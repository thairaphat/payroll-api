import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { applyWageToRow } from "../modules/payroll/payroll.service";
import type { WageConfig } from "../services/wage-config.service";

const payrollSourceUrl = new URL(
  "../modules/payroll/payroll.service.ts",
  import.meta.url
);

function wage(): WageConfig {
  return {
    id: 1n,
    company_id: 40,
    daily_wage: new Prisma.Decimal(400),
    work_hours_per_day: new Prisma.Decimal(8),
    ot1_multiplier: new Prisma.Decimal(1),
    ot15_multiplier: new Prisma.Decimal(1.5),
    ot2_multiplier: new Prisma.Decimal(2),
    ot3_multiplier: new Prisma.Decimal(3),
    is_active: true,
  };
}

describe("attendance OT payroll consumption", () => {
  it("ATT-OT-008 aggregates OT inside the requested payroll month", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).toContain(
      "a.work_date BETWEEN ${toDate(range.startDate)} AND ${toDate(range.endDate)}"
    );
    expect(source).toContain("SUM(COALESCE(a.ot1,  0))");
    expect(source).toContain("SUM(COALESCE(a.ot15, 0))");
    expect(source).toContain("SUM(COALESCE(a.ot2,  0))");
  });

  it("ATT-OT-009 keeps employee and company scope in the payroll join", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).toContain(
      "UPPER(TRIM(a.employee_code)) = UPPER(TRIM(e.emp_code))"
    );
    expect(source).toContain("e.company_id = ${companyId}");
  });

  it("ATT-OT-010 includes approved or payroll-locked attendance", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).toContain(
      "a.approval_status = ${APPROVAL_STATUS.APPROVED}"
    );
    expect(source).toContain("a.payroll_locked_at IS NOT NULL");
  });

  it("ATT-OT-011 excludes draft attendance unless includeDraft is requested", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).toContain("const approvalFragment = includeDraft");
    expect(source).toContain("? Prisma.empty");
    expect(source).toContain(": Prisma.sql`AND (");
  });

  it("ATT-OT-012 recalculates income when attendance OT changes", () => {
    const withoutOt = applyWageToRow(
      { work_days: 1, total_ot1: 0, total_ot15: 0, total_ot2: 0 },
      wage()
    );
    const withOt = applyWageToRow(
      { work_days: 1, total_ot1: 2, total_ot15: 0, total_ot2: 0 },
      wage()
    );
    expect(withoutOt.ot1_income).toBe(0);
    expect(withOt.ot1_income).toBe(100);
    expect(withOt.gross_income - withoutOt.gross_income).toBe(100);
  });
});

