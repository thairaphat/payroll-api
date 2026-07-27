import { describe, expect, it } from "bun:test";
import { canIncludeDraftPayroll } from "../modules/payroll/payroll.controller";
import { buildPayrollSql } from "../modules/payroll/payroll.service";
import {
  CompanyScopeError,
  resolveCompanyScope,
} from "../services/company-scope.service";
import type { AuthUser } from "../middlewares/auth.middleware";

const range = {
  startDate: "2026-07-01",
  endDate: "2026-07-31",
};
const cydAdmin: AuthUser = {
  id: "1",
  username: "global-admin",
  role: "cyd_admin",
  companyId: null,
};
const companyAdmin: AuthUser = {
  id: "2",
  username: "company-admin",
  role: "admin",
  companyId: 16,
};

describe("cyd_admin payroll company scope", () => {
  it("CYD-PAY-001 requires cyd_admin to select a company", async () => {
    await expect(resolveCompanyScope(cydAdmin)).rejects.toMatchObject({
      status: 400,
      message: "companyId is required",
    } satisfies Partial<CompanyScopeError>);
  });

  it("CYD-PAY-002 scopes payroll SQL to the selected company", () => {
    const query = buildPayrollSql(range, false, undefined, 16, ["EMP16"]);
    expect(query.sql).toContain("e.company_id = ?");
    expect(query.values).toContain(16);
    expect(query.values).toContain("EMP16");
  });

  it("CYD-PAY-003 creates different scoped parameters for another company", () => {
    const companyA = buildPayrollSql(range, false, undefined, 16, ["EMP16"]);
    const companyB = buildPayrollSql(range, false, undefined, 18, ["EMP18"]);
    expect(companyA.values).toContain(16);
    expect(companyA.values).not.toContain(18);
    expect(companyB.values).toContain(18);
    expect(companyB.values).not.toContain(16);
  });

  it("CYD-PAY-004 keeps a company admin on the JWT company", async () => {
    await expect(resolveCompanyScope(companyAdmin)).resolves.toBe(16);
    await expect(resolveCompanyScope(companyAdmin, 18)).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<CompanyScopeError>);
  });

  it("CYD-PAY-007 Payroll Ready excludes draft attendance", () => {
    const query = buildPayrollSql(range, false, undefined, 16, ["EMP16"]);
    expect(query.sql).toContain("a.approval_status = ?");
    expect(query.values).toContain("approved");
  });

  it("CYD-PAY-008 All Records allows cyd_admin to request draft rows", () => {
    expect(canIncludeDraftPayroll("cyd_admin")).toBe(true);
    const query = buildPayrollSql(range, true, undefined, 16, ["EMP16"]);
    expect(query.sql).not.toContain("a.approval_status = ?");
  });

  it("CYD-PAY-010 accepts a positive integer company string", async () => {
    await expect(resolveCompanyScope(companyAdmin, "16")).resolves.toBe(16);
  });

  it("CYD-PAY-011 rejects invalid company IDs before querying payroll", async () => {
    await expect(resolveCompanyScope(cydAdmin, "not-a-company")).rejects.toMatchObject({
      status: 400,
    } satisfies Partial<CompanyScopeError>);
    await expect(resolveCompanyScope(cydAdmin, "0")).rejects.toMatchObject({
      status: 400,
    } satisfies Partial<CompanyScopeError>);
  });
});
