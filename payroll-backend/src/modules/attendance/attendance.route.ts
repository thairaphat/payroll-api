import { Elysia, t } from "elysia";
import { syncAttendanceFromSheet } from "./attendance.controller";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import { approveAttendance, submitAttendance } from "./approval.service";

const attendanceScopeBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

const attendanceListRoles = ["admin", "hr", "accounting", "field_staff"] as const;
const testRecordWhere = [
  { employee_code: { startsWith: "FIELD_TEST" } },
  { employee_code: { startsWith: "MVPLOCK" } },
  { employee_name: "Field Smoke" },
];

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
    ...(includeTest ? {} : { NOT: testRecordWhere }),
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
        return await prisma.attendance_records.findMany({
          where: buildAttendanceListWhere(query ?? {}),
          orderBy: [
            { work_date: "desc" },
            { id: "desc" },
          ],
          take: 10000,
        });
      }, { beforeHandle: requireAttendanceListRole })

      .get("/available-months", async () => {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m') as month
           FROM attendance_records
           WHERE employee_code NOT LIKE 'FIELD_TEST%'
             AND employee_code NOT LIKE 'MVPLOCK%'
             AND employee_name <> 'Field Smoke'
           ORDER BY month DESC`
        );
        return rows.map(r => r.month);
      }, { beforeHandle: requireAttendanceListRole })

      .get("/available-dates", async ({ query }: any) => {
        const month = query.month; // Expected format: YYYY-MM
        if (!month) return [];

        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT DATE_FORMAT(work_date, '%Y-%m-%d') as date
           FROM attendance_records
           WHERE DATE_FORMAT(work_date, '%Y-%m') = ?
             AND employee_code NOT LIKE 'FIELD_TEST%'
             AND employee_code NOT LIKE 'MVPLOCK%'
             AND employee_name <> 'Field Smoke'
           ORDER BY date DESC`,
          month
        );
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
