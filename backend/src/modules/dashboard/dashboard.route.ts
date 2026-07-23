import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import {
  getCompanyEmployeeCodes,
  resolveCompanyScope,
  CompanyScopeError,
} from "../../services/company-scope.service";
import {
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
  FIELD_APP_SHEET_ID,
  TEST_RECORD_WHERE,
  APPROVAL_STATUS,
} from "../../constants/attendance";
import {
  getActiveWageConfig,
  getWageConfigsForCompanies,
} from "../../services/wage-config.service";
import { logRouteEnter, logApiError } from "../../diag";
import { hasEmployeeCodes } from "../../utils/company-scope";
import { logRequiredAudit } from "../../services/audit.service";

export const dashboardRoute = new Elysia().get(
  "/dashboard/summary",
  async ({ request, jwt, set, query }: any) => {
    const ENDPOINT = "/dashboard/summary";

    // ── 1. Resolve current user and company scope ────────────────────────────
    const user = await getAuthUser(request, jwt);
    logRouteEnter(ENDPOINT, user);

    if (!user) { set.status = 401; return { ok: false, message: "Authentication required" }; }
    let companyId: number;
    try {
      companyId = await resolveCompanyScope(user, query?.companyId, {
        endpoint: ENDPOINT,
        method: "GET",
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      });
    } catch (error) {
      if (error instanceof CompanyScopeError) {
        set.status = error.status;
        return { ok: false, message: error.message };
      }
      throw error;
    }

    // ── 2. Total employee profiles + company employee codes (parallel) ────────
    let totalEmployeeProfiles: number;
    let companyCodes: string[];
    try {
      [totalEmployeeProfiles, companyCodes] = await Promise.all([
        prisma.employee_document_profiles.count({
          where: { company_id: companyId },
        }),
        getCompanyEmployeeCodes(companyId),
      ]);
      console.log(`[dashboard] step=profileCount+companyCodes totalEmployeeProfiles=${totalEmployeeProfiles} companyCodes=${companyCodes.length}`);
    } catch (err) {
      logApiError(ENDPOINT, user, err, "step=profileCount+companyCodes companyId=" + companyId);
      throw err;
    }

    // ── 3. Payroll/OT summary — filtered to this company via e.company_id ────
    let rows: any[] = [];
    try {
      if (hasEmployeeCodes(companyCodes)) {
        rows = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          a.employee_code,
          a.employee_name,
          MAX(a.branch_code)                   AS branch_code,
          MAX(e.company_id)                    AS company_id,
          COUNT(DISTINCT a.work_date)          AS work_days,
          COALESCE(SUM(a.ot_hours), 0)         AS total_ot,
          COALESCE(SUM(a.ot15), 0)             AS total_ot15,
          COALESCE(SUM(a.ot2), 0)              AS total_ot2
        FROM attendance_records a
        INNER JOIN employee_document_profiles e ON a.employee_code = e.emp_code
        WHERE a.employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
          AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
          AND a.employee_name <> ${TEST_EMPLOYEE_NAME}
          AND e.company_id = ${companyId}
          AND a.employee_code IN (${Prisma.join(companyCodes)})
        GROUP BY a.employee_code, a.employee_name
        ORDER BY a.employee_code ASC
      `);
      }
      console.log(`[dashboard] step=payrollOtSQL rowCount=${rows.length} companyId=${companyId}`);
    } catch (err) {
      logApiError(ENDPOINT, user, err, "step=payrollOtSQL companyId=" + companyId);
      throw err;
    }

    // ── 4. Wage config for this company (income calculation) ─────────────────
    let wageMap: Awaited<ReturnType<typeof getWageConfigsForCompanies>>;
    try {
      wageMap = await getWageConfigsForCompanies(
        rows.map((r: any) => (r.company_id != null ? Number(r.company_id) : null))
      );
      console.log(`[dashboard] step=wageConfig wageMapSize=${wageMap.size}`);
    } catch (err) {
      logApiError(ENDPOINT, user, err, "step=wageConfig companyId=" + companyId);
      throw err;
    }

    const employees = rows.map((r) => {
      const cId = r.company_id != null ? Number(r.company_id) : null;
      const wage = wageMap.get(cId) ?? wageMap.get(null)!;
      const hourlyRate = wage.daily_wage / wage.work_hours;

      const workDays = Number(r.work_days ?? 0);
      const ot = Number(r.total_ot ?? 0);
      const ot15 = Number(r.total_ot15 ?? 0);
      const ot2 = Number(r.total_ot2 ?? 0);

      // Mirror payroll.service.ts income formula: base + ot1.5 + ot2
      const totalIncome =
        workDays * wage.daily_wage +
        ot15 * hourlyRate * 1.5 +
        ot2 * hourlyRate * 2;

      return {
        code: r.employee_code,
        name: r.employee_name,
        department: r.branch_code ?? null,
        workDays,
        ot,
        totalIncome,
      };
    });

    // Company-specific wage config for the _wage_config display field
    let companyWageConfig: Awaited<ReturnType<typeof getActiveWageConfig>>;
    try {
      companyWageConfig = await getActiveWageConfig(companyId);
      console.log(`[dashboard] step=companyWageConfig daily_wage=${companyWageConfig.daily_wage} work_hours=${companyWageConfig.work_hours}`);
    } catch (err) {
      logApiError(ENDPOINT, user, err, "step=companyWageConfig companyId=" + companyId);
      throw err;
    }

    // ── 5. Today's field attendance — filtered to company employee codes ──────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    let todayFieldRaw: Array<{ approval_status: string | null; updated_at: Date | null }>;
    try {
      todayFieldRaw =
        companyCodes.length === 0
          ? []
          : await prisma.attendance_records.findMany({
              where: {
                source_sheet_id: FIELD_APP_SHEET_ID,
                work_date: { gte: todayStart, lt: todayEnd },
                employee_code: { in: companyCodes },
                NOT: [...TEST_RECORD_WHERE],
              },
              select: { approval_status: true, updated_at: true },
              orderBy: { updated_at: "desc" },
            });
      console.log(`[dashboard] step=todayFieldAttendance records=${todayFieldRaw.length} companyCodes=${companyCodes.length}`);
    } catch (err) {
      logApiError(ENDPOINT, user, err, "step=todayFieldAttendance companyId=" + companyId);
      throw err;
    }

    const todayFieldEntry = {
      total: todayFieldRaw.length,
      draft: todayFieldRaw.filter(
        (r) => r.approval_status === APPROVAL_STATUS.DRAFT
      ).length,
      submitted: todayFieldRaw.filter(
        (r) => r.approval_status === APPROVAL_STATUS.SUBMITTED
      ).length,
      approved: todayFieldRaw.filter(
        (r) => r.approval_status === APPROVAL_STATUS.APPROVED
      ).length,
      latestEntry: todayFieldRaw[0]?.updated_at ?? null,
    };

    // ── 6. Return company-scoped summary ──────────────────────────────────────
    return {
      totalEmployeeProfiles,
      totalEmployees: employees.length,
      totalSalary: employees.reduce((sum, e) => sum + e.totalIncome, 0),
      totalOt: employees.reduce((sum, e) => sum + e.ot, 0),
      notIssuedPayslip: employees.length,
      employees,
      todayFieldEntry,
      _wage_config: {
        daily_wage: companyWageConfig.daily_wage,
        work_hours: companyWageConfig.work_hours,
      },
    };
  },
  // Allow admin, hr, accounting, viewer — all company-scoped roles
  // field_staff route directly to /field-attendance and do not use this endpoint
  { beforeHandle: requireRole(["cyd_admin", "admin", "hr", "accounting", "viewer"]) }
).get(
  "/admin/companies/summary",
  async ({ request, jwt }: any) => {
    const user = await getAuthUser(request, jwt);
    const companies = await prisma.companies.findMany({ select: { id: true, company_name: true }, orderBy: { company_name: "asc" } });
    const summaries = await Promise.all(companies.map(async (company) => {
      const codes = await getCompanyEmployeeCodes(company.id);
      const attendanceCount = codes.length === 0 ? 0 : await prisma.attendance_records.count({ where: { employee_code: { in: codes } } });
      const lockedCount = codes.length === 0 ? 0 : await prisma.attendance_records.count({ where: { employee_code: { in: codes }, payroll_locked_at: { not: null } } });
      return {
        companyId: company.id,
        companyName: company.company_name,
        employeeCount: codes.length,
        attendanceCount,
        payrollStatus: lockedCount > 0 ? "locked" : attendanceCount > 0 ? "draft" : "no_data",
      };
    }));
    await logRequiredAudit("company.scope.view", "company", {
      endpoint: "/admin/companies/summary", method: "GET",
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    }, user);
    return {
      totalCompanies: companies.length,
      totalEmployees: summaries.reduce((sum, company) => sum + company.employeeCount, 0),
      companies: summaries,
    };
  },
  { beforeHandle: requireRole(["cyd_admin"]) }
);
