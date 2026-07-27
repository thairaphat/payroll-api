import { describe, expect, it } from "bun:test";
import {
  FIELD_ATTENDANCE_BATCH_LIMIT,
  saveFieldAttendanceBatch,
  validateFieldAttendanceBatch,
} from "../modules/attendance/field-attendance.service";

const user = {
  id: "9",
  username: "field",
  role: "field_staff" as const,
  companyId: 16,
};

function record(code: string) {
  return {
    employee_code: code,
    first_name: "Test",
    last_name: code,
    start_time: "08:00",
    work_time: "08:00-17:00",
    ot1: 1,
    ot15: 0,
    ot2: 0,
  };
}

function transactionHarness(options: {
  profiles?: Array<{
    emp_code: string;
    company_id: number;
    first_name?: string;
    last_name?: string;
  }>;
  existing?: any[];
  failWriteAt?: number;
  failAudit?: boolean;
} = {}) {
  const committed: string[] = [];
  const writes: Array<{
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    where: Record<string, unknown>;
  }> = [];
  let txValue: unknown;
  const runner = {
    $transaction: async (operation: (tx: any) => Promise<any>) => {
      const pending: string[] = [];
      let write = 0;
      const tx = {
        employee_document_profiles: {
          findMany: async () =>
            options.profiles ?? [
              { emp_code: "E001", company_id: 16, first_name: "Employee", last_name: "One" },
              { emp_code: "E002", company_id: 16, first_name: "Employee", last_name: "Two" },
            ],
        },
        attendance_records: {
          findMany: async () => options.existing ?? [],
          upsert: async ({
            create,
            update,
            where,
          }: {
            create: Record<string, unknown>;
            update: Record<string, unknown>;
            where: Record<string, unknown>;
          }) => {
            write += 1;
            if (write === options.failWriteAt) throw new Error("write failed");
            writes.push({ create, update, where });
            pending.push(String(create.employee_code));
            return {};
          },
        },
        payroll_audit_logs: {
          create: async () => {
            if (options.failAudit) throw new Error("audit failed");
            pending.push("audit");
            return {};
          },
        },
      };
      txValue = tx;
      const result = await operation(tx as any);
      committed.push(...pending);
      return result;
    },
  };
  return { runner, committed, writes, get tx() { return txValue; } };
}

describe("field attendance bulk transaction", () => {
  it("ATT-BULK-001 commits a complete valid batch", async () => {
    const harness = transactionHarness();
    const result = await saveFieldAttendanceBatch(
      { date: "2026-07-01", records: [record("E001"), record("E002")] },
      user,
      16,
      harness.runner
    );
    expect(result).toEqual({ success: true, count: 2 });
    expect(harness.committed).toEqual(["E001", "E002", "audit"]);
  });

  it("ATT-BULK-002 invalid input prevents transaction and writes", async () => {
    let transactions = 0;
    const runner = {
      $transaction: async () => {
        transactions += 1;
      },
    };
    await expect(
      saveFieldAttendanceBatch(
        { date: "bad-date", records: [record("E001")] },
        user,
        16,
        runner as any
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transactions).toBe(0);
  });

  it("ATT-BULK-003 unknown employee rolls back the whole batch", async () => {
    const harness = transactionHarness({ profiles: [] });
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001")] },
        user,
        16,
        harness.runner
      )
    ).rejects.toMatchObject({ code: "UNKNOWN_EMPLOYEE" });
    expect(harness.committed).toEqual([]);
  });

  it("ATT-BULK-004 rejects a cross-company employee", async () => {
    const harness = transactionHarness({
      profiles: [{ emp_code: "E001", company_id: 18 }],
    });
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001")] },
        user,
        16,
        harness.runner
      )
    ).rejects.toMatchObject({ code: "COMPANY_SCOPE_MISMATCH", status: 403 });
  });

  it("ATT-BULK-005 rejects duplicate employee/date before transaction", async () => {
    let transactions = 0;
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001"), record("E001")] },
        user,
        16,
        {
          $transaction: async () => {
            transactions += 1;
          },
        } as any
      )
    ).rejects.toMatchObject({ code: "DUPLICATE_ATTENDANCE" });
    expect(transactions).toBe(0);
  });

  it("ATT-BULK-006 database failure in the middle rolls back all records", async () => {
    const harness = transactionHarness({ failWriteAt: 2 });
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001"), record("E002")] },
        user,
        16,
        harness.runner
      )
    ).rejects.toThrow("write failed");
    expect(harness.committed).toEqual([]);
  });

  it("ATT-BULK-007 audit failure rolls back all records", async () => {
    const harness = transactionHarness({ failAudit: true });
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001")] },
        user,
        16,
        harness.runner
      )
    ).rejects.toThrow("audit failed");
    expect(harness.committed).toEqual([]);
  });

  it("ATT-BULK-008 uses one transaction client for reads, writes, and audit", async () => {
    const harness = transactionHarness();
    await saveFieldAttendanceBatch(
      { date: "2026-07-01", records: [record("E001")] },
      user,
      16,
      harness.runner
    );
    expect(harness.tx).toBeDefined();
    const source = await Bun.file(
      new URL(
        "../modules/attendance/field-attendance.service.ts",
        import.meta.url
      )
    ).text();
    expect(source).not.toMatch(/prisma\.(attendance_records|employee_document_profiles|payroll_audit_logs)/);
  });

  it("ATT-BULK-009 rejects locked attendance without writing", async () => {
    const harness = transactionHarness({
      existing: [
        {
          employee_code: "E001",
          approval_status: "approved",
          payroll_locked_at: null,
          created_by: 9,
        },
      ],
    });
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records: [record("E001")] },
        user,
        16,
        harness.runner
      )
    ).rejects.toMatchObject({ code: "ATTENDANCE_LOCKED", status: 423 });
    expect(harness.committed).toEqual([]);
  });

  it("ATT-BULK-010 enforces the batch limit before transaction", async () => {
    const records = Array.from(
      { length: FIELD_ATTENDANCE_BATCH_LIMIT + 1 },
      (_, index) => record(`E${index}`)
    );
    let transactions = 0;
    await expect(
      saveFieldAttendanceBatch(
        { date: "2026-07-01", records },
        user,
        16,
        {
          $transaction: async () => {
            transactions += 1;
          },
        } as any
      )
    ).rejects.toMatchObject({ code: "BATCH_LIMIT_EXCEEDED", status: 413 });
    expect(transactions).toBe(0);
  });

  it("ATT-OT-001 persists two OT2 hours and the matching total", async () => {
    const harness = transactionHarness();
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ ...record("E001"), ot1: 0, ot2: 2 }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].create).toMatchObject({ ot2: 2, ot_hours: 2 });
  });

  it("ATT-OT-003 updating only note preserves existing OT", async () => {
    const harness = transactionHarness({
      existing: [
        {
          employee_code: "E001",
          approval_status: "draft",
          payroll_locked_at: null,
          created_by: 9,
          ot1: 2,
          ot15: 0,
          ot2: 0,
        },
      ],
    });
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ employee_code: "E001", note: "updated" }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].update).toMatchObject({ ot1: 2, ot_hours: 2 });
  });

  it("ATT-OT-004 updating only start time preserves existing OT", async () => {
    const harness = transactionHarness({
      existing: [
        {
          employee_code: "E001",
          approval_status: "draft",
          payroll_locked_at: null,
          created_by: 9,
          ot1: 0,
          ot15: 0,
          ot2: 1,
        },
      ],
    });
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ employee_code: "E001", start_time: "09:00" }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].update).toMatchObject({ ot2: 1, ot_hours: 1 });
  });

  it("ATT-OT-005 bulk save keeps two employees separate", async () => {
    const harness = transactionHarness();
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [
          { ...record("E001"), ot1: 2 },
          { ...record("E002"), ot1: 1 },
        ],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes.map((write) => write.create.ot1)).toEqual([2, 1]);
  });

  it("ATT-OT-006 uses the complete normalized code, not a display suffix", async () => {
    const harness = transactionHarness({
      profiles: [
        {
          emp_code: "CYD31193",
          company_id: 16,
          first_name: "Employee",
          last_name: "One",
        },
        {
          emp_code: "OTHER193",
          company_id: 18,
          first_name: "Employee",
          last_name: "Other",
        },
      ],
    });
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ ...record("cyd31193"), ot1: 2 }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].create.employee_code).toBe("CYD31193");
    expect(harness.writes[0].where).toMatchObject({
      uniq_attendance: { employee_code: "CYD31193" },
    });
  });

  it("ATT-OT-013 saves OT category and hours together", async () => {
    const harness = transactionHarness();
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ ...record("E001"), ot1: 0, ot15: 2 }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].create).toMatchObject({ ot15: 2, ot_hours: 2 });
  });

  it("ATT-OT-014 preserves decimal OT hours", async () => {
    const harness = transactionHarness();
    await saveFieldAttendanceBatch(
      {
        date: "2026-07-24",
        records: [{ ...record("E001"), ot1: 1.5 }],
      },
      user,
      16,
      harness.runner
    );
    expect(harness.writes[0].create).toMatchObject({
      ot1: 1.5,
      ot_hours: 1.5,
    });
  });

  it("ATT-OT-018 preserves the selected Bangkok calendar date", () => {
    const validated = validateFieldAttendanceBatch("2026-07-24", [
      record("E001"),
    ]);
    expect(validated.workDate.toISOString().slice(0, 10)).toBe("2026-07-24");
  });
});
