import { Elysia, t } from "elysia";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import {
  FIELD_APP_SHEET_ID,
  TEST_RECORD_WHERE,
} from "../../constants/attendance";
import {
  CompanyScopeError,
  getCompanyEmployeeCodes,
  getCompanyScope,
  resolveCompanyScope,
} from "../../services/company-scope.service";
import { logRouteEnter } from "../../diag";
import { resolveCompanyEmployeeProfiles } from "../../services/employee-profile.service";
import { normalizeEmployeeCode } from "../../utils/employee-profile";
import {
  FieldAttendanceBulkError,
  saveFieldAttendanceBatch,
} from "./field-attendance.service";

const fieldAttendanceAccess = requireRole([
  "cyd_admin",
  "admin",
  "hr",
  "field_staff",
]);
const fieldAttendanceWriteAccess = requireRole([
  "admin",
  "hr",
  "field_staff",
]);

export const fieldAttendanceRoute = new Elysia({
  prefix: "/api/field-attendance",
})
  .get(
    "/",
    async ({ query, request, jwt, set }: any) => {
      const { date } = query;
      if (!date) return [];

      const user = await getAuthUser(request, jwt);
      logRouteEnter("/api/field-attendance", user);
      if (!user) {
        set.status = 401;
        return { ok: false, message: "Authentication required" };
      }

      let scope: number;
      try {
        scope = await resolveCompanyScope(user, query?.companyId, {
          endpoint: "/api/field-attendance",
          method: "GET",
          requestId:
            request.headers.get("x-request-id") ?? crypto.randomUUID(),
        });
      } catch (error) {
        if (error instanceof CompanyScopeError) {
          set.status = error.status;
          return { ok: false, message: error.message };
        }
        throw error;
      }

      const codes = await getCompanyEmployeeCodes(scope);
      if (codes.length === 0) return [];
      const records = await prisma.attendance_records.findMany({
        where: {
          work_date: new Date(date as string),
          source_sheet_id: FIELD_APP_SHEET_ID,
          NOT: [...TEST_RECORD_WHERE],
          employee_code: { in: codes },
        },
        orderBy: { id: "asc" },
      });
      if (records.length === 0) return [];

      const employeeCodes = [
        ...new Set(records.map((record) => record.employee_code)),
      ];
      const profileMap = await resolveCompanyEmployeeProfiles(
        scope,
        employeeCodes
      );

      return records.map((record) => {
        const profile = profileMap.get(
          normalizeEmployeeCode(record.employee_code)
        );

        return {
          ...record,
          employee_code: normalizeEmployeeCode(record.employee_code),
          employee_name: profile?.employeeName ?? null,
          employee_profile_status: profile?.status ?? "NOT_FOUND",
          half_day:
            (record.raw_row_json as { half_day?: boolean } | null)?.half_day ??
            false,
          work_type_2:
            (record.raw_row_json as { work_type_2?: string } | null)
              ?.work_type_2 ?? "",
          leave_day: !record.is_present,
        };
      });
    },
    { beforeHandle: fieldAttendanceAccess }
  )
  .post(
    "/bulk",
    async ({ body, request, jwt, set }: any) => {
      const user = await getAuthUser(request, jwt);
      logRouteEnter("/api/field-attendance/bulk", user);
      if (!user?.id) {
        set.status = 401;
        return {
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required",
        };
      }

      const scope = getCompanyScope(user);
      if (scope === "deny" || scope === null) {
        set.status = 403;
        return {
          success: false,
          code: "COMPANY_SCOPE_MISMATCH",
          message: "A company assignment is required.",
        };
      }

      try {
        return await saveFieldAttendanceBatch(body, user, scope);
      } catch (error) {
        if (error instanceof FieldAttendanceBulkError) {
          set.status = error.status;
          return {
            success: false,
            code: error.code,
            message: error.message,
          };
        }
        throw error;
      }
    },
    {
      beforeHandle: fieldAttendanceWriteAccess,
      body: t.Object({
        date: t.String(),
        records: t.Array(t.Any()),
      }),
    }
  );
