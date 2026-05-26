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
    ...(includeTest ? {} : { NOT: TEST_RECORD_WHERE }),
  };
}

export const attendanceRoute = new Elysia()
  .use(
    new Elysia({ prefix: "/api/sheets" })
      .post("/sync-attendance", async ({ body }) => {
        try {
          return await syncAttendanceFromSheet(body as { sheetId: string });
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

      .get("/attendance", async ({ query }: any) => {
        const q = query ?? {};
        const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
        const pageSize = Math.min(2000, Math.max(1, parseInt(q.pageSize ?? "1000", 10) || 1000));
        const skip = (page - 1) * pageSize;
        const where = buildAttendanceListWhere(q);

        const [data, total] = await Promise.all([
          prisma.attendance_records.findMany({
            where,
            orderBy: [{ work_date: "desc" }, { id: "desc" }],
            skip,
            take: pageSize,
          }),
          prisma.attendance_records.count({ where }),
        ]);

        return { ok: true, data, total, page, pageSize };
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
