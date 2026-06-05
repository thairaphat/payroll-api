import { syncAttendanceFromSheet as syncService } from "./attendance.service";
import type { AuthUser } from "../../middlewares/auth.middleware";

export async function syncAttendanceFromSheet(
  body: { sheetId: string },
  user?: AuthUser
) {
  if (!body.sheetId) {
    throw new Error("Missing sheetId");
  }

  return await syncService({ sheetId: body.sheetId, user });
}