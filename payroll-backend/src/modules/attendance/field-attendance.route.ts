import { Elysia, t } from "elysia";
import { prisma } from "../../db";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import {
  APPROVAL_STATUS,
  FIELD_APP_SHEET_ID,
  TEST_RECORD_WHERE,
} from "../../constants/attendance";

const fieldAttendanceAccess = requireRole(["admin", "hr", "field_staff"]);

export const fieldAttendanceRoute = new Elysia({ prefix: "/api/field-attendance" })
  .get("/", async ({ query }) => {
    const { date } = query;
    if (!date) return [];

    const records = await prisma.attendance_records.findMany({
      where: {
        work_date: new Date(date as string),
        source_sheet_id: FIELD_APP_SHEET_ID,
        NOT: TEST_RECORD_WHERE,
      },
      orderBy: { id: "asc" },
    });

    return records.map(r => ({
      ...r,
      half_day: (r.raw_row_json as any)?.half_day || false,
      work_type_2: (r.raw_row_json as any)?.work_type_2 || "",
      leave_day: !r.is_present
    }));
  }, { beforeHandle: fieldAttendanceAccess })
  .post("/bulk", async (context: any) => {
    const { body, request, jwt, set } = context;
    const { date, records } = body as { date: string; records: any[] };
    const user = await getAuthUser(request, jwt);

    if (!date || !records) {
      throw new Error("Missing date or records");
    }

    if (!user?.id) {
      set.status = 401;
      return { success: false, message: "Authentication required" };
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
    beforeHandle: fieldAttendanceAccess,
    body: t.Object({
      date: t.String(),
      records: t.Array(t.Any())
    })
  });
