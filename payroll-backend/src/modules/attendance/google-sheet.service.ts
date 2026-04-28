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

function getGoogleCredentials() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  return {
    client_email: clientEmail,
    private_key: privateKey,
  };
}

export async function readAttendanceFromGoogleSheet(sheetId: string) {
  const credentials = getGoogleCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "'Nov 25'!A1:T20000",
  });

  const rows = res.data.values ?? [];
  const dataRows = rows.slice(1);

  const validRows: z.infer<typeof attendanceSchema>[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, index) => {
    const employeeCode = String(row[10] ?? "").trim();
    const firstName = String(row[12] ?? "").trim();
    const lastName = String(row[13] ?? "").trim();

    const raw = {
      employeeCode,
      employeeName: `${firstName} ${lastName}`.trim(),
      workDate: String(row[4] ?? "").trim(),
      isPresent: Boolean(employeeCode),
      otHours:
        Number(row[14] || 0) +
        Number(row[15] || 0) +
        Number(row[16] || 0),
      note: String(row[19] ?? "").trim(),
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