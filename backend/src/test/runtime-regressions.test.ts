import { describe, expect, it } from "bun:test";
import { hasEmployeeCodes } from "../utils/company-scope";

const repoRoot = new URL("../../../", import.meta.url);

async function readRepoFile(path: string) {
  return Bun.file(new URL(path, repoRoot)).text();
}

describe("empty company scope", () => {
  it("recognizes an empty employee-code scope", () => {
    expect(hasEmployeeCodes([])).toBe(false);
    expect(hasEmployeeCodes(["EMP001"])).toBe(true);
  });

  it("guards dashboard SQL before Prisma.join", async () => {
    const source = await readRepoFile("backend/src/modules/dashboard/dashboard.route.ts");
    const guard = source.indexOf("if (hasEmployeeCodes(companyCodes))");
    const join = source.indexOf("Prisma.join(companyCodes)");
    expect(guard).toBeGreaterThan(-1);
    expect(join).toBeGreaterThan(guard);
  });

  it("guards available month/date SQL before joining scoped codes", async () => {
    const source = await readRepoFile("backend/src/modules/attendance/attendance.route.ts");
    const emptyGuards = source.match(/if \(codes\.length === 0\) return \[\];/g) ?? [];
    expect(emptyGuards.length).toBeGreaterThanOrEqual(2);
  });

  it("does not lock or snapshot an empty payroll result", async () => {
    const source = await readRepoFile(
      "backend/src/modules/payroll/payroll-lock.service.ts"
    );
    const emptyGuard = source.indexOf("if (rows.length === 0)");
    const lockCall = source.indexOf("dependencies.lockAttendance(");
    const snapshotCall = source.indexOf("tx.payroll_snapshots.createMany");
    expect(emptyGuard).toBeGreaterThan(-1);
    expect(lockCall).toBeGreaterThan(emptyGuard);
    expect(snapshotCall).toBeGreaterThan(lockCall);
  });
});

describe("removed employee-master UI", () => {
  it("does not reference the removed RefreshCw sync control", async () => {
    const source = await readRepoFile("frontend/src/pages/Employees.tsx");
    expect(source).not.toContain("RefreshCw");
    expect(source).not.toContain("syncEmployeeMaster");
    expect(source).not.toContain("handleSyncMaster");
    expect(source).toContain("ไม่พบข้อมูลพนักงาน");
  });
});

describe("authentication logging", () => {
  it("does not log credentials or password-hash details", async () => {
    const source = await readRepoFile("backend/src/modules/auth/auth.service.ts");
    for (const forbidden of [
      "[auth.debug]",
      "password raw",
      "password charCodes",
      "password length",
      "password type",
      "hash prefix",
      "hash length",
      "compareSync result",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe("legacy mapping removal", () => {
  it("does not query employee_code_mapping from runtime source", async () => {
    const files = [
      "backend/src/modules/dashboard/dashboard.route.ts",
      "backend/src/modules/payroll/payroll.service.ts",
      "backend/src/modules/attendance/attendance.route.ts",
      "backend/src/services/company-scope.service.ts",
    ];
    for (const file of files) {
      expect(await readRepoFile(file)).not.toContain("prisma.employee_code_mapping");
    }
  });
});

describe("CYD administrator isolation", () => {
  it("uses one canonical role and a central company-scope resolver", async () => {
    const auth = await readRepoFile("backend/src/middlewares/auth.middleware.ts");
    const policy = await readRepoFile("backend/src/utils/user-policy.ts");
    const scope = await readRepoFile("backend/src/services/company-scope.service.ts");
    expect(auth).toContain("type AppRole = CanonicalRole");
    expect(policy).toContain('"cyd_admin"');
    expect(scope).toContain("export async function resolveCompanyScope");
    expect(scope).toContain('throw new CompanyScopeError("companyId is required", 400)');
    expect(scope).toContain('throw new CompanyScopeError("Company not found", 404)');
    expect(scope).toContain('throw new CompanyScopeError("Cannot access another company.", 403)');
  });

  it("requires the resolver on company-selectable read endpoints", async () => {
    const files = [
      "backend/src/modules/dashboard/dashboard.route.ts",
      "backend/src/modules/employees/employee.route.ts",
      "backend/src/modules/payroll/payroll.controller.ts",
      "backend/src/modules/attendance/attendance.route.ts",
      "backend/src/modules/attendance/field-attendance.route.ts",
    ];
    for (const file of files) {
      expect(await readRepoFile(file)).toContain("resolveCompanyScope");
    }
  });

  it("keeps CYD mutations disabled by default", async () => {
    const payroll = await readRepoFile("backend/src/modules/payroll/payroll.route.ts");
    const fieldAttendance = await readRepoFile("backend/src/modules/attendance/field-attendance.route.ts");
    expect(payroll).toContain('requireRole(["admin", "accounting"])');
    expect(fieldAttendance).toMatch(
      /fieldAttendanceWriteAccess\s*=\s*requireRole\(\s*\[\s*"admin",\s*"hr",\s*"field_staff",?\s*\]\s*\)/
    );
  });

  it("audits cross-company reads without credential data", async () => {
    const scope = await readRepoFile("backend/src/services/company-scope.service.ts");
    const employees = await readRepoFile("backend/src/modules/employees/employee.route.ts");
    const audit = await readRepoFile("backend/src/services/audit.service.ts");
    expect(scope).toContain('logRequiredAudit("company.scope.view"');
    expect(employees).toContain('endpoint: "/employees/companies"');
    expect(scope).toContain("requestId: context?.requestId");
    expect(audit).toContain("actor_user_id");
    expect(audit).not.toContain("password");
    expect(audit).not.toContain("jwt");
  });

  it("accepts identity only from a verified JWT", async () => {
    const auth = await readRepoFile("backend/src/middlewares/auth.middleware.ts");
    const frontendAuth = await readRepoFile("frontend/src/lib/authz.ts");
    expect(auth).not.toContain("ALLOW_DEV_AUTH_BYPASS");
    expect(auth).not.toContain('request.headers.get("x-user-role")');
    expect(auth).toContain("await jwt.verify(token)");
    expect(frontendAuth).not.toContain('"X-User-Role"');
  });

  it("resolves secure seed configuration and uses idempotent writes", async () => {
    const seed = await readRepoFile("backend/prisma/seed.ts");
    const config = await readRepoFile("backend/prisma/seed-config.ts");
    expect(config).toContain("CYD_ADMIN_USERNAME");
    expect(config).toContain("CYD_ADMIN_EMAIL");
    expect(config).toContain("CYD_ADMIN_PASSWORD");
    expect(config).toContain("PAYROLL_COMPANY_USERS_JSON");
    expect(config).toContain("validateUserRoleCompany");
    expect(config).toContain("validatePasswordPolicy");
    expect(seed).toContain("payroll_roles.upsert");
    expect(seed).toContain("prisma.$transaction");
    expect(seed).not.toContain('password: "123456"');
  });

  it("restricts user-management routes at the backend", async () => {
    const route = await readRepoFile("backend/src/modules/users/user-management.route.ts");
    const service = await readRepoFile("backend/src/modules/users/user-management.service.ts");
    expect(route).toContain('"/admin/users"');
    expect(route).toContain('requireRole(["cyd_admin"])');
    expect(route).toContain('"/company/users"');
    expect(route).toContain('requireRole(["admin"])');
    expect(service).toContain('assignment.role === "cyd_admin"');
    expect(service).not.toContain("password_hash: user.password_hash");
  });

  it("shows global user management only to cyd_admin in frontend policy", async () => {
    const app = await readRepoFile("frontend/src/App.tsx");
    const layout = await readRepoFile("frontend/src/layouts/AppLayout.tsx");
    expect(app).toContain('path="/admin/users"');
    expect(layout).toContain('to: "/admin/users"');
    expect(layout).toContain('roles: ["cyd_admin"]');
  });
});
