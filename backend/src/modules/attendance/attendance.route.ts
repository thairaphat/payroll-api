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
import { getCompanyScope, getCompanyEmployeeCodes } from "../../services/company-scope.service";
import { logRouteEnter, logApiError } from "../../diag";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const attendanceScopeBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

const attendanceListRoles = ["admin", "hr", "accounting", "field_staff"] as const;

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

        const scope = user ? getCompanyScope(user) : "deny";
        if (scope === "deny") {
          set.status = 403;
          return { ok: false, message: "No company assigned to your account. Contact your administrator." };
        }

        // Pre-fetch company employee codes for scoped users
        let codeFilter: { in: string[] } | undefined;
        try {
          if (scope !== null) {
            const codes = await getCompanyEmployeeCodes(scope);
            codeFilter = { in: codes }; // empty array = no accessible records
            console.log(`[attendance] step=getCompanyEmployeeCodes scope=${scope} codeCount=${codes.length}`);
          }
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

        // Resolve display names from employee_document_profiles.
        // attendance_records.employee_name may be blank for auto-provisioned employees.
        // Sheet-synced records may carry a sheet_employee_code — resolve through
        // employee_code_mapping first (mirrors the JOIN used in payroll SQL).
        let enrichedData: any[] = data;
        if (data.length > 0) {
          const rawCodes = [...new Set(data.map((r) => r.employee_code))];

          // Step 1: resolve sheet codes → canonical emp_codes (single query)
          const mappings = await prisma.employee_code_mapping.findMany({
            where: { sheet_employee_code: { in: rawCodes } },
            select: { sheet_employee_code: true, emp_code: true },
          });
          const codeMap = new Map(mappings.map((m) => [m.sheet_employee_code, m.emp_code]));

          // Step 2: collect resolved emp_codes (mapped overrides direct)
          const empCodes = [...new Set(rawCodes.map((c) => codeMap.get(c) ?? c))];

          // Step 3: batch-fetch profiles (single query)
          const profiles = await prisma.employee_document_profiles.findMany({
            where: { emp_code: { in: empCodes } },
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
            const resolvedCode = codeMap.get(r.employee_code) ?? r.employee_code;
            const p = profileMap.get(resolvedCode);

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

      .get("/available-months", async () => {
        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m') AS month
          FROM attendance_records
          WHERE employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
            AND employee_name <> ${TEST_EMPLOYEE_NAME}
          ORDER BY month DESC
        `);
        return rows.map(r => r.month);
      }, { beforeHandle: requireAttendanceListRole })

      .get("/available-dates", async ({ query }: any) => {
        const month = query.month; // Expected format: YYYY-MM
        if (!month || !MONTH_PATTERN.test(month)) return [];

        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m-%d') AS date
          FROM attendance_records
          WHERE DATE_FORMAT(work_date, '%Y-%m') = ${month}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
            AND employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
            AND employee_name <> ${TEST_EMPLOYEE_NAME}
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

      return await submitAttendance(body as any, user);
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

      return await approveAttendance(body as any, user);
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
