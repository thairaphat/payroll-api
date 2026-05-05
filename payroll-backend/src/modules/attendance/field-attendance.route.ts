import { Elysia, t } from "elysia";
import { prisma } from "../../db";

export const fieldAttendanceRoute = new Elysia({ prefix: "/api/field-attendance" })
  .get("/", async ({ query }) => {
    const { date } = query;
    if (!date) return [];

    const records = await prisma.attendance_records.findMany({
      where: {
        work_date: new Date(date as string),
        source_sheet_id: "FIELD_APP",
      },
      orderBy: { id: "asc" },
    });

    return records.map(r => ({
      ...r,
      half_day: (r.raw_row_json as any)?.half_day || false,
      work_type_2: (r.raw_row_json as any)?.work_type_2 || "",
      leave_day: !r.is_present
    }));
  })
  .post("/bulk", async ({ body }) => {
    const { date, records } = body as { date: string; records: any[] };

    if (!date || !records) {
      throw new Error("Missing date or records");
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
        source_sheet_id: "FIELD_APP",
        raw_row_json: {
          half_day: rec.half_day || false,
          work_type_2: rec.work_type_2 || "",
        }
      };

      await prisma.attendance_records.upsert({
        where: {
          uniq_attendance: {
            source_sheet_id: "FIELD_APP",
            employee_code: rec.employee_code,
            work_date: workDate,
          },
        },
        create: data,
        update: data,
      });
    }

    return { success: true, count: records.length };
  }, {
    body: t.Object({
      date: t.String(),
      records: t.Array(t.Any())
    })
  });
