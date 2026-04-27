import { Elysia } from "elysia";
import { syncAttendanceFromSheet } from "./attendance.controller";

export const attendanceRoute = new Elysia({ prefix: "/attendance" })
  .post("/sync-google-sheet", async ({ body }) => {
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
  });