import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  applyWageToRow,
  assertUniqueCompanyPayrollProfiles,
  buildPayrollSql,
  PayrollDataIntegrityError,
} from "../modules/payroll/payroll.service";

const payrollSourceUrl = new URL(
  "../modules/payroll/payroll.service.ts",
  import.meta.url
);

const queryText = buildPayrollSql(
  { startDate: "2026-07-01", endDate: "2026-07-31" },
  true,
  undefined,
  39,
  ["CYD1909"]
).sql;

describe("payroll duplicate aggregation", () => {
  it("PAY-DUP-001 groups multiple attendance days into one employee row", () => {
    expect(queryText).toContain(
      "GROUP BY e.company_id, e.id, UPPER(TRIM(a.employee_code))"
    );
    expect(queryText).not.toContain("GROUP BY a.employee_code, a.employee_name");
  });

  it("PAY-DUP-002 sums canonical present days", () => {
    expect(queryText).toContain("SUM(a.is_present)");
  });

  it("PAY-DUP-003 sums every OT category after canonical selection", () => {
    expect(queryText).toContain("SUM(COALESCE(a.ot1");
    expect(queryText).toContain("SUM(COALESCE(a.ot15");
    expect(queryText).toContain("SUM(COALESCE(a.ot2");
    expect(queryText).toContain("SUM(COALESCE(a.ot_hours");
  });

  it("PAY-DUP-004 ranks one canonical attendance row per employee and date", () => {
    expect(queryText).toContain("ROW_NUMBER() OVER");
    expect(queryText).toContain(
      "PARTITION BY UPPER(TRIM(source_rows.employee_code)), source_rows.work_date"
    );
    expect(queryText).toContain("WHERE ranked.canonical_rank = 1");
  });

  it("PAY-DUP-005 prioritizes locked, approved, submitted, then draft", () => {
    const locked = queryText.indexOf(
      "source_rows.payroll_locked_at IS NOT NULL"
    );
    const approved = queryText.indexOf(
      "LOWER(TRIM(source_rows.approval_status))"
    );
    expect(locked).toBeGreaterThan(-1);
    expect(approved).toBeGreaterThan(locked);
    expect(
      queryText.split("LOWER(TRIM(source_rows.approval_status))").length - 1
    ).toBeGreaterThanOrEqual(3);
  });

  it("PAY-DUP-006 gives FIELD_APP priority when status is equal", () => {
    expect(queryText).toContain("source_rows.source_sheet_id");
    expect(queryText).toContain("THEN 0 ELSE 1 END");
  });

  it("PAY-DUP-007 normalizes whitespace and case for identity", () => {
    expect(queryText).toContain(
      "UPPER(TRIM(source_rows.employee_code))"
    );
    expect(queryText).toContain("UPPER(TRIM(a.employee_code))");
  });

  it("PAY-DUP-008 keeps company and profile identity in the payroll grain", () => {
    expect(queryText).toContain("e.company_id");
    expect(queryText).toContain("e.id");
  });

  it("PAY-DUP-009 fails closed when normalized profiles are duplicated", async () => {
    const db = {
      $queryRaw: async <T>() =>
        [{ employee_code: "CYD1909" }] as unknown as T,
    };
    await expect(
      assertUniqueCompanyPayrollProfiles(
        39,
        db as unknown as Parameters<
          typeof assertUniqueCompanyPayrollProfiles
        >[1]
      )
    ).rejects.toBeInstanceOf(PayrollDataIntegrityError);
  });

  it("PAY-DUP-010 returns one grouped row per employee profile", () => {
    expect(queryText).toContain("MAX(e.id)");
    expect(queryText).not.toContain("a.employee_name, a.branch_code");
  });

  it("PAY-DUP-011 serves snapshot rows instead of appending live rows", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    const snapshotReturn = source.indexOf(
      "return snapshots.map(formatSnapshotAsPayrollRow)"
    );
    const liveQuery = source.indexOf(
      "buildPayrollSql(range, includeDraft, undefined"
    );
    expect(snapshotReturn).toBeGreaterThan(-1);
    expect(snapshotReturn).toBeLessThan(liveQuery);
  });

  it("PAY-DUP-013 calculates net-relevant income once from aggregate totals", () => {
    const wage = {
      id: BigInt(1),
      company_id: 39,
      daily_wage: new Prisma.Decimal("420"),
      work_hours_per_day: new Prisma.Decimal("8"),
      ot1_multiplier: new Prisma.Decimal("1"),
      ot15_multiplier: new Prisma.Decimal("1.5"),
      ot2_multiplier: new Prisma.Decimal("2"),
      ot3_multiplier: new Prisma.Decimal("3"),
      is_active: true,
    };
    const result = applyWageToRow(
      {
        work_days: 2,
        total_ot1: 0,
        total_ot15: 2,
        total_ot2: 0,
      },
      wage
    );
    expect(result.base_income).toBe(840);
    expect(result.ot15_income).toBe(157.5);
    expect(result.gross_income).toBe(997.5);
  });
});
