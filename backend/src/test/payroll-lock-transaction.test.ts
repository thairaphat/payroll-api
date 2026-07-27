import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  executePayrollLock,
  requirePayrollLockCompany,
  type PayrollLockDependencies,
} from "../modules/payroll/payroll-lock.service";
import {
  WageConfigError,
  type WageConfig,
} from "../services/wage-config.service";

const user = {
  id: "7",
  username: "admin",
  role: "admin" as const,
  companyId: 16,
};

function wage(): WageConfig {
  return {
    id: 1n,
    company_id: 16,
    daily_wage: new Prisma.Decimal(360),
    work_hours_per_day: new Prisma.Decimal(8),
    ot1_multiplier: new Prisma.Decimal(1),
    ot15_multiplier: new Prisma.Decimal(1.5),
    ot2_multiplier: new Prisma.Decimal(2),
    ot3_multiplier: new Prisma.Decimal(3),
    is_active: true,
  };
}

function row() {
  return {
    employee_code: "E001",
    employee_name: "Employee",
    employee_profile_status: "FOUND" as const,
    work_days: 20,
    total_ot1: 2,
    total_ot15: 2,
    total_ot2: 3,
    total_ot_hours: 7,
    daily_wage_used: 360,
    work_hours_used: 8,
    base_income: 7200,
    ot15_income: 135,
    ot2_income: 270,
    gross_income: 7695,
    deduction_amount: 0,
    net_income: 7695,
  };
}

function harness(overrides: Partial<PayrollLockDependencies> = {}) {
  const calls: string[] = [];
  const tx = {
    payroll_snapshots: {
      findFirst: async () => null,
      createMany: async () => {
        calls.push("snapshot");
        return { count: 1 };
      },
    },
  } as any;
  const dependencies: PayrollLockDependencies = {
    transactionRunner: {
      $transaction: async (operation) => operation(tx),
    },
    getWage: async () => {
      calls.push("wage");
      return wage();
    },
    getCodes: async () => {
      calls.push("codes");
      return ["E001"];
    },
    calculate: async () => {
      calls.push("calculate");
      return [row()];
    },
    lockAttendance: async () => {
      calls.push("attendance");
      return { locked: 1 };
    },
    writeAudit: async () => {
      calls.push("audit");
    },
    ...overrides,
  };
  return { calls, tx, dependencies };
}

describe("payroll lock transaction", () => {
  it("LOCK-TX-001 uses the same tx client for every transactional operation", async () => {
    const seen: unknown[] = [];
    const setup = harness();
    for (const name of [
      "getWage",
      "getCodes",
      "calculate",
      "lockAttendance",
      "writeAudit",
    ] as const) {
      const original = setup.dependencies[name] as (...args: any[]) => any;
      (setup.dependencies[name] as any) = async (...args: any[]) => {
        const txIndex = name === "writeAudit" ? 2 : name === "getWage" || name === "getCodes" ? 1 : 2;
        seen.push(args[txIndex]);
        return original(...args);
      };
    }
    await executePayrollLock(
      { date: "2026-07-01" },
      user,
      setup.dependencies
    );
    expect(seen.every((value) => value === setup.tx)).toBe(true);
  });

  it("LOCK-TX-002 rolls back attendance when snapshot creation fails", async () => {
    const committed = { attendance: false };
    const setup = harness({
      transactionRunner: {
        $transaction: async (operation) => {
          const pending = { attendance: false };
          const tx = {
            payroll_snapshots: {
              findFirst: async () => null,
              createMany: async () => {
                throw new Error("snapshot failed");
              },
            },
            pending,
          } as any;
          const result = await operation(tx);
          committed.attendance = pending.attendance;
          return result;
        },
      },
      lockAttendance: async (_input, _companyId, tx: any) => {
        tx.pending.attendance = true;
        return { locked: 1 };
      },
    });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toThrow("snapshot failed");
    expect(committed.attendance).toBe(false);
  });

  it("LOCK-TX-003 rolls back snapshot and attendance when audit fails", async () => {
    const committed = { attendance: false, snapshot: false };
    const setup = harness({
      transactionRunner: {
        $transaction: async (operation) => {
          const pending = { attendance: false, snapshot: false };
          const tx = {
            payroll_snapshots: {
              findFirst: async () => null,
              createMany: async () => {
                pending.snapshot = true;
                return { count: 1 };
              },
            },
            pending,
          } as any;
          const result = await operation(tx);
          Object.assign(committed, pending);
          return result;
        },
      },
      lockAttendance: async (_input, _companyId, tx: any) => {
        tx.pending.attendance = true;
        return { locked: 1 };
      },
      writeAudit: async () => {
        throw new Error("audit failed");
      },
    });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toThrow("audit failed");
    expect(committed).toEqual({ attendance: false, snapshot: false });
  });

  it("LOCK-TX-004 does not create snapshot or audit when attendance update fails", async () => {
    let snapshots = 0;
    let audits = 0;
    const setup = harness({
      lockAttendance: async () => {
        throw new Error("attendance failed");
      },
      writeAudit: async () => {
        audits += 1;
      },
    });
    setup.tx.payroll_snapshots.createMany = async () => {
      snapshots += 1;
      return { count: 1 };
    };
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toThrow("attendance failed");
    expect({ snapshots, audits }).toEqual({ snapshots: 0, audits: 0 });
  });

  it("LOCK-TX-005 propagates a thrown transaction callback", async () => {
    const setup = harness({
      getWage: async () => {
        throw new Error("callback failed");
      },
    });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toThrow("callback failed");
  });

  it("LOCK-TX-006 commits every success-path mutation in order", async () => {
    const setup = harness();
    const result = await executePayrollLock(
      { date: "2026-07-01" },
      user,
      setup.dependencies
    );
    expect(result).toEqual({
      success: true,
      locked: 1,
      snapshots_saved: 1,
    });
    expect(setup.calls).toEqual([
      "wage",
      "codes",
      "calculate",
      "attendance",
      "snapshot",
      "audit",
    ]);
  });

  it("LOCK-TX-007 has no global Prisma mutation inside orchestration", async () => {
    const source = await Bun.file(
      new URL(
        "../modules/payroll/payroll-lock.service.ts",
        import.meta.url
      )
    ).text();
    expect(source).not.toMatch(/prisma\.(attendance_records|payroll_snapshots|payroll_audit_logs)/);
    expect(source).toContain("transactionRunner.$transaction");
  });

  it("LOCK-TX-008 rejects missing company scope before starting a transaction", () => {
    expect(() =>
      requirePayrollLockCompany({ ...user, companyId: null })
    ).toThrow("A company assignment is required");
  });

  it("LOCK-TX-009 missing wage fails before any mutation", async () => {
    const setup = harness({
      getWage: async () => {
        throw new WageConfigError(
          "COMPANY_WAGE_NOT_CONFIGURED",
          "Missing wage",
          422
        );
      },
    });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toBeInstanceOf(WageConfigError);
    expect(setup.calls).toEqual([]);
  });

  it("LOCK-TX-010 rejects a duplicate before attendance, snapshot, or audit", async () => {
    const setup = harness();
    setup.tx.payroll_snapshots.findFirst = async () => ({ id: 1 });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toMatchObject({ code: "PAYROLL_ALREADY_LOCKED", status: 409 });
    expect(setup.calls).toEqual(["wage", "codes"]);
  });

  it("EMP-NAME-008 blocks payroll lock before every mutation when a profile is missing", async () => {
    const setup = harness({
      calculate: async () => [
        {
          ...row(),
          employee_code: "CYD1096",
          employee_name: null,
          employee_profile_status: "NOT_FOUND",
        },
      ],
    });
    await expect(
      executePayrollLock({ date: "2026-07-01" }, user, setup.dependencies)
    ).rejects.toMatchObject({
      code: "PAYROLL_EMPLOYEE_PROFILE_MISSING",
      employeeCodes: ["CYD1096"],
      status: 422,
    });
    expect(setup.calls).toEqual(["wage", "codes"]);
  });
});
