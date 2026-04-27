import { google } from "googleapis";
import { z } from "zod";

const attendanceSchema = z.object({
  employeeCode: z.string().min(1),
  employeeName: z.string().min(1),
  workDate: z.string().min(1),
  isPresent: z.boolean(),
  otHours: z.number().min(0),
  note: z.string().optional(),
});

export async function readAttendanceFromGoogleSheet(sheetId: string) {
  const credentialsText = process.env.GOOGLE_SHEETS_CREDENTIALS;

  if (!credentialsText) {
    throw new Error("Missing GOOGLE_SHEETS_CREDENTIALS");
  }

  const credentials = JSON.parse(credentialsText);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Attendance!A2:F",
  });

  const rows = res.data.values ?? [];

  const validRows = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const raw = {
      employeeCode: String(row[0] ?? "").trim(),
      employeeName: String(row[1] ?? "").trim(),
      workDate: String(row[2] ?? "").trim(),
      isPresent: ["true", "1", "yes", "มา", "มาทำงาน"].includes(
        String(row[3] ?? "").trim().toLowerCase()
      ),
      otHours: Number(row[4] ?? 0),
      note: String(row[5] ?? "").trim(),
    };

    const result = attendanceSchema.safeParse(raw);

    if (!result.success) {
      errors.push(`แถว ${index + 2}: ข้อมูลไม่ถูกต้อง`);
      return;
    }

    validRows.push(result.data);
  });

  return {
    rows: validRows,
    errors,
  };
}