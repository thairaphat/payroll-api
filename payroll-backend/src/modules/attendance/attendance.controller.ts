import { readAttendanceFromGoogleSheet } from "./google-sheet.service";

export async function syncAttendanceFromSheet(body: { sheetId: string }) {
  const { sheetId } = body;

  if (!sheetId) {
    throw new Error("Missing sheetId");
  }

  const result = await readAttendanceFromGoogleSheet(sheetId);

  return {
    inserted: result.rows.length,
    updated: 0,
    skipped: 0,
    errors: result.errors,
    data: result.rows,
  };
}