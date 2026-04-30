import { Elysia } from "elysia";
import { syncAttendanceFromSheet } from "./attendance.controller";
import { prisma } from "../../db";

export const attendanceRoute = new Elysia({ prefix: "/api/sheets" })

  // ✅ sync (ของเดิม)
  .post("/sync-attendance", async ({ body }) => {
    try {
      return await syncAttendanceFromSheet(body as { sheetId: string });
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Sync Google Sheet ไม่สำเร็จ",
      };
    }
  })

  // ✅ เพิ่มอันนี้ !!!
  .get("/attendance", async () => {
    return await prisma.attendance_records.findMany({
      orderBy: [
        { work_date: "desc" },
        { id: "desc" },
      ],
      take: 10000,
    });
  });