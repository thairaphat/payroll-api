import { Elysia, t } from "elysia";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import {
  APPROVAL_STATUS,
  FIELD_APP_SHEET_ID,
  TEST_RECORD_WHERE,
} from "../../constants/attendance";
import {
  getCompanyScope,
  getCompanyEmployeeCodes,
  resolveCompanyScope,
  CompanyScopeError,
} from "../../services/company-scope.service";
import { logRouteEnter, logApiError } from "../../diag";

const fieldAttendanceAccess = requireRole(["cyd_admin", "admin", "hr", "field_staff"]);
const fieldAttendanceWriteAccess = requireRole(["admin", "hr", "field_staff"]);

export const fieldAttendanceRoute = new Elysia({ prefix: "/api/field-attendance" })
  .get("/", async (context: any) => {
    const { query, request, jwt, set } = context;
    const { date } = query;
    if (!date) return [];

    const user = await getAuthUser(request, jwt);
    logRouteEnter("/api/field-attendance", user);

    if (!user) { set.status = 401; return { ok: false, message: "Authentication required" }; }
    let scope: number;
    try { scope = await resolveCompanyScope(user, query?.companyId, { endpoint: "/api/field-attendance", method: "GET", requestId: request.headers.get("x-request-id") ?? crypto.randomUUID() }); }
    catch (error) { if (error instanceof CompanyScopeError) { set.status = error.status; return { ok: false, message: error.message }; } throw error; }

    // Build employee_code filter for company-scoped users
    const codes = await getCompanyEmployeeCodes(scope);
    if (codes.length === 0) return [];
    const codeFilter = { in: codes };

    const records = await prisma.attendance_records.findMany({
      where: {
        work_date: new Date(date as string),
        source_sheet_id: FIELD_APP_SHEET_ID,
        NOT: [...TEST_RECORD_WHERE],
        employee_code: codeFilter,
      },
      orderBy: { id: "asc" },
    });

    if (records.length === 0) return [];

    // Batch-fetch profiles to resolve display names — attendance_records.employee_name
    // may be blank/whitespace for employees created via auto-provisioning.
    const empCodes = [...new Set(records.map((r) => r.employee_code))];
    const profiles = await prisma.employee_document_profiles.findMany({
      where: { emp_code: { in: empCodes }, company_id: scope },
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

    return records.map((r) => {
      const p = profileMap.get(r.employee_code);

      // Fallback chain: attendance name → Thai → English → base → emp_code
      const trimmed = (r.employee_name ?? "").trim();
      const thName  = p ? `${p.first_name_th || ""} ${p.last_name_th || ""}`.trim() : "";
      const enName  = p ? `${p.first_name_en || ""} ${p.last_name_en || ""}`.trim() : "";
      const baseName = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";
      const resolvedName = trimmed || thName || enName || baseName || r.employee_code;

      return {
        ...r,
        employee_name: resolvedName,
        first_name: p?.first_name_th || p?.first_name_en || p?.first_name || r.first_name || null,
        last_name:  p?.last_name_th  || p?.last_name_en  || p?.last_name  || r.last_name  || null,
        half_day:   (r.raw_row_json as any)?.half_day || false,
        work_type_2: (r.raw_row_json as any)?.work_type_2 || "",
        leave_day: !r.is_present,
      };
    });
  }, { beforeHandle: fieldAttendanceAccess })
  .post("/bulk", async (context: any) => {
    const { body, request, jwt, set } = context;
    const { date, records } = body as { date: string; records: any[] };
    const user = await getAuthUser(request, jwt);
    logRouteEnter("/api/field-attendance/bulk", user);

    if (!date || !records) {
      throw new Error("Missing date or records");
    }

    if (!user?.id) {
      set.status = 401;
      return { success: false, message: "Authentication required" };
    }

    // Enforce company scope: field_staff must have a company assigned
    const scope = getCompanyScope(user);
    if (scope === "deny" || scope === null) {
      set.status = 403;
      return { success: false, message: "No company assigned to your account. Contact your administrator." };
    }

    // For company-scoped users: validate all submitted records belong to their company.
    // New employees (not yet in DB) are allowed — they will be provisioned with user's company_id.
    if (scope !== null && records.length > 0) {
      const submittedCodes = records.map((r: any) => r.employee_code).filter(Boolean);
      const allowedCodes = await getCompanyEmployeeCodes(scope);
      const allowedSet = new Set(allowedCodes);

      // All submitted codes must already belong to the caller's company.
      const existingProfiles = await prisma.employee_document_profiles.findMany({
        where: {
          emp_code: { in: submittedCodes },
          company_id: { not: null },
        },
        select: { emp_code: true, company_id: true },
      });

      const outOfScope = existingProfiles.filter((p) => p.company_id !== scope || !allowedSet.has(p.emp_code!));
      const unknownCodes = submittedCodes.filter((code: string) => !allowedSet.has(code));

      if (outOfScope.length > 0 || unknownCodes.length > 0) {
        set.status = 403;
        return {
          success: false,
          message: "Records contain unknown, ambiguous, or out-of-scope employee codes.",
        };
      }
    }

    const workDate = new Date(date);

    for (const rec of records) {
      const employeeName = `${rec.first_name || ""} ${rec.last_name || ""}`.trim() || rec.employee_name || "UNKNOWN";
      
      const data = {
        employee_code: rec.employee_code,
        employee_code_13: rec.employee_code_13 || null,
        employee_name: employeeName,
        first_name: rec.first_name || null,
        last_name: rec.last_name || null,
        work_date: workDate,
        start_time: rec.start_time || null,
        shift_name: rec.shift_name || null,
        branch_code: rec.branch_code || null,
        work_time: rec.work_time || null,
        is_present: !rec.leave_day,
        ot1: Number(rec.ot1 || 0),
        ot15: Number(rec.ot15 || 0),
        ot2: Number(rec.ot2 || 0),
        ot_hours: Number(rec.ot1 || 0) + Number(rec.ot15 || 0) + Number(rec.ot2 || 0),
        note: rec.note || null,
        search_text: rec.search_text || null,
        source_sheet_id: FIELD_APP_SHEET_ID,
        approval_status: APPROVAL_STATUS.DRAFT,
        created_by: Number(user.id),
        raw_row_json: {
          half_day: rec.half_day || false,
          work_type_2: rec.work_type_2 || "",
        }
      };

      const existing = await prisma.attendance_records.findUnique({
        where: {
          uniq_attendance: {
            source_sheet_id: FIELD_APP_SHEET_ID,
            employee_code: rec.employee_code,
            work_date: workDate,
          },
        },
        select: {
          approval_status: true,
          payroll_locked_at: true,
          created_by: true,
        },
      });

      if (existing?.approval_status === APPROVAL_STATUS.APPROVED || existing?.payroll_locked_at) {
        set.status = 423;
        return {
          success: false,
          message: "Attendance is approved or payroll locked",
        };
      }

      if (
        user.role === "field_staff" &&
        existing?.created_by &&
        existing.created_by !== Number(user.id)
      ) {
        set.status = 403;
        return {
          success: false,
          message: "Cannot edit attendance created by another user",
        };
      }

      const { approval_status, created_by, ...updateData } = data;

      await prisma.attendance_records.upsert({
        where: {
          uniq_attendance: {
            source_sheet_id: FIELD_APP_SHEET_ID,
            employee_code: rec.employee_code,
            work_date: workDate,
          },
        },
        create: data,
        update: updateData,
      });
    }

    return { success: true, count: records.length };
  }, {
    beforeHandle: fieldAttendanceWriteAccess,
    body: t.Object({
      date: t.String(),
      records: t.Array(t.Any())
    })
  });
