import { Elysia, t } from "elysia";
import { Prisma } from "@prisma/client";
import { syncAttendanceFromSheet } from "./attendance.controller";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import { approveAttendance, submitAttendance } from "./approval.service";
import {
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
  TEST_RECORD_WHERE,
} from "../../constants/attendance";
import { CompanyScopeError, getCompanyScope, getCompanyEmployeeCodes, resolveCompanyScope } from "../../services/company-scope.service";
import { logRouteEnter, logApiError } from "../../diag";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const attendanceScopeBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

const attendanceListRoles = ["cyd_admin", "admin", "hr", "accounting", "field_staff"] as const;

async function requireAttendanceListRole({ request, set, jwt }: any) {
  const user = await getAuthUser(request, jwt);

  if (!user) {
    set.status = 401;
    return {
      ok: false,
      message: "Authentication required",
    };
  }

  if (!attendanceListRoles.includes(user.role as (typeof attendanceListRoles)[number])) {
    set.status = 403;
    return {
      ok: false,
      message: "Access denied",
      requiredRoles: attendanceListRoles,
    };
  }
}

function toDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function buildAttendanceListWhere(query: Record<string, string | undefined>) {
  const startDate = toDate(query.startDate);
  const endDate = toDate(query.endDate);
  const approvalStatus = query.approvalStatus;
  const company = query.company;
  const includeTest = query.includeTest === "true";

  return {
    ...(startDate && endDate
      ? { work_date: { gte: startDate, lte: endDate } }
      : {}),
    ...(company ? { branch_code: company } : {}),
    ...(approvalStatus && approvalStatus !== "all" && approvalStatus !== "locked"
      ? { approval_status: approvalStatus }
      : {}),
    ...(approvalStatus === "locked" ? { payroll_locked_at: { not: null } } : {}),
    ...(includeTest ? {} : { NOT: [...TEST_RECORD_WHERE] }),
  };
}

export const attendanceRoute = new Elysia()
  .use(
    new Elysia({ prefix: "/api/sheets" })
      .post("/sync-attendance", async (context: any) => {
        const { body, request, jwt } = context;
        try {
          const user = await getAuthUser(request, jwt);
          return await syncAttendanceFromSheet(
            body as { sheetId: string },
            user ?? undefined
          );
        } catch (error) {
          return {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Sync Google Sheet failed",
          };
        }
      }, { beforeHandle: requireRole(["admin", "hr"]) })

      .get("/attendance", async ({ query, request, jwt, set }: any) => {
        const user = await getAuthUser(request, jwt);
        logRouteEnter("/api/sheets/attendance", user);

        if (!user) { set.status = 401; return { ok: false, message: "Authentication required" }; }
        let scope: number;
        try {
          scope = await resolveCompanyScope(user, query?.companyId, { endpoint: "/api/sheets/attendance", method: "GET", requestId: request.headers.get("x-request-id") ?? crypto.randomUUID() });
        } catch (error) {
          if (error instanceof CompanyScopeError) { set.status = error.status; return { ok: false, message: error.message }; }
          throw error;
        }

        // Pre-fetch company employee codes for scoped users
        let codeFilter: { in: string[] } | undefined;
        try {
          const codes = await getCompanyEmployeeCodes(scope);
          codeFilter = { in: codes }; // empty array is fail-closed in Prisma
          console.log(`[attendance] step=getCompanyEmployeeCodes scope=${scope} codeCount=${codes.length}`);
        } catch (err) {
          logApiError("/api/sheets/attendance", user, err, "step=getCompanyEmployeeCodes scope=" + scope);
          throw err;
        }

        const q = query ?? {};
        const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
        const pageSize = Math.min(2000, Math.max(1, parseInt(q.pageSize ?? "1000", 10) || 1000));
        const skip = (page - 1) * pageSize;
        const where = {
          ...buildAttendanceListWhere(q),
          ...(codeFilter ? { employee_code: codeFilter } : {}),
        };

        let data: any[] = [];
        let total = 0;
        try {
          [data, total] = await Promise.all([
            prisma.attendance_records.findMany({
              where,
              orderBy: [{ work_date: "desc" }, { id: "desc" }],
              skip,
              take: pageSize,
            }),
            prisma.attendance_records.count({ where }),
          ]);
          console.log(`[attendance] step=findMany total=${total} page=${page} pageSize=${pageSize}`);
        } catch (err) {
          logApiError("/api/sheets/attendance", user, err, "step=findMany page=" + page);
          throw err;
        }

        // Resolve display names directly from employee_document_profiles.
        let enrichedData: any[] = data;
        if (data.length > 0) {
          const rawCodes = [...new Set(data.map((r) => r.employee_code))];

          // employee_code maps directly to employee_document_profiles.emp_code.
          const profiles = await prisma.employee_document_profiles.findMany({
            where: { emp_code: { in: rawCodes }, company_id: scope },
            select: {
              emp_code: true,
              first_name: true,
              last_name: true,
              first_name_th: true,
              last_name_th: true,
              first_name_en: true,
              last_name_en: true,
            },
          });
          const profileMap = new Map(profiles.map((p) => [p.emp_code, p]));

          enrichedData = data.map((r) => {
            const p = profileMap.get(r.employee_code);

            // Fallback: attendance name → Thai → English → base → employee_code
            const trimmed  = (r.employee_name ?? "").trim();
            const thName   = p ? `${p.first_name_th || ""} ${p.last_name_th || ""}`.trim() : "";
            const enName   = p ? `${p.first_name_en || ""} ${p.last_name_en || ""}`.trim() : "";
            const baseName = p ? `${p.first_name   || ""} ${p.last_name   || ""}`.trim() : "";
            const resolvedName = trimmed || thName || enName || baseName || r.employee_code;

            return {
              ...r,
              employee_name: resolvedName,
              display_name:  resolvedName,
              first_name: p?.first_name_th || p?.first_name_en || p?.first_name || r.first_name || null,
              last_name:  p?.last_name_th  || p?.last_name_en  || p?.last_name  || r.last_name  || null,
            };
          });
        }

        return { ok: true, data: enrichedData, total, page, pageSize };
      }, { beforeHandle: requireAttendanceListRole })

      .get("/available-months", async ({ request, jwt, set, query }: any) => {
        const user = await getAuthUser(request, jwt);
        if (!user) { set.status = 401; return []; }
        let scope: number;
        try { scope = await resolveCompanyScope(user, query?.companyId, { endpoint: "/api/sheets/available-months", method: "GET", requestId: request.headers.get("x-request-id") ?? crypto.randomUUID() }); }
        catch (error) { if (error instanceof CompanyScopeError) { set.status = error.status; return []; } throw error; }
        const codes = await getCompanyEmployeeCodes(scope);
        if (codes.length === 0) return [];
        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m') AS month
          FROM attendance_records
          WHERE employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
            AND employee_name <> ${TEST_EMPLOYEE_NAME}
            AND employee_code IN (${Prisma.join(codes)})
          ORDER BY month DESC
        `);
        return rows.map(r => r.month);
      }, { beforeHandle: requireAttendanceListRole })

      .get("/available-dates", async ({ query, request, jwt, set }: any) => {
        const month = query.month; // Expected format: YYYY-MM
        if (!month || !MONTH_PATTERN.test(month)) return [];
        const user = await getAuthUser(request, jwt);
        if (!user) { set.status = 401; return []; }
        let scope: number;
        try { scope = await resolveCompanyScope(user, query?.companyId, { endpoint: "/api/sheets/available-dates", method: "GET", requestId: request.headers.get("x-request-id") ?? crypto.randomUUID() }); }
        catch (error) { if (error instanceof CompanyScopeError) { set.status = error.status; return []; } throw error; }
        const codes = await getCompanyEmployeeCodes(scope);
        if (codes.length === 0) return [];

        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m-%d') AS date
          FROM attendance_records
          WHERE DATE_FORMAT(work_date, '%Y-%m') = ${month}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
            AND employee_name <> ${TEST_EMPLOYEE_NAME}
            AND employee_code IN (${Prisma.join(codes)})
          ORDER BY date DESC
        `);
        return rows.map(r => r.date);
      }, { beforeHandle: requireAttendanceListRole })
  )

  .post("/api/attendance/submit", async (context: any) => {
    const { set } = context;
    try {
      const { body, request, jwt } = context;
      const user = await getAuthUser(request, jwt);
      if (!user) {
        set.status = 401;
        return { success: false, message: "Authentication required" };
      }

      const scope = getCompanyScope(user);
      if (scope === "deny" || scope === null) {
        set.status = 403;
        return { success: false, message: "A company assignment is required." };
      }
      return await submitAttendance(body as any, user, scope);
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Submit attendance failed",
      };
    }
  }, {
    beforeHandle: requireRole(["admin", "hr", "field_staff"]),
    body: attendanceScopeBody,
  })

  .post("/api/attendance/approve", async (context: any) => {
    const { set } = context;
    try {
      const { body, request, jwt } = context;
      const user = await getAuthUser(request, jwt);
      if (!user) {
        set.status = 401;
        return { success: false, message: "Authentication required" };
      }

      const scope = getCompanyScope(user);
      if (scope === "deny" || scope === null) {
        set.status = 403;
        return { success: false, message: "A company assignment is required." };
      }
      return await approveAttendance(body as any, user, scope);
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Approve attendance failed",
      };
    }
  }, {
    beforeHandle: requireRole(["admin", "hr"]),
    body: attendanceScopeBody,
  });
