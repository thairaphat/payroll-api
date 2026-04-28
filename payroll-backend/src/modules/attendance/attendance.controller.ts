import { syncAttendanceFromSheet as syncService } from "./attendance.service";

export async function syncAttendanceFromSheet(body: { sheetId: string }) {
  if (!body.sheetId) {
    throw new Error("Missing sheetId");
  }

  return await syncService(body);
}