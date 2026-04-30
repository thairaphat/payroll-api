import { google } from "googleapis";
import { z } from "zod";

const attendanceSchema = z.object({
  rawDateText: z.string().nullable().optional(),
  searchText: z.string().nullable().optional(),

  startTime: z.string().nullable().optional(),
  shiftName: z.string().nullable().optional(),

  // อันนี้ยังคงต้องเป็น YYYY-MM-DD แต่ยอมให้ null ก่อน parse ได้
  workDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .refine((v) => v !== null, {
      message: "workDate ห้ามเป็น null",
    }),

  branchCode: z.string().nullable().optional(),
  formulaCol1: z.string().nullable().optional(),
  formulaCol2: z.string().nullable().optional(),
  statusCode: z.string().nullable().optional(),
  workTime: z.string().nullable().optional(),

  // อันนี้ห้ามว่างเด็ดขาด
  employeeCode: z.string().min(1),

  employeeCode13: z.string().nullable().optional(),

  // รวมชื่อ ต้องมีค่า
  employeeName: z.string().min(1),

  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),

  isPresent: z.boolean(),

  ot1: z.number().min(0),
  ot15: z.number().min(0),
  ot2: z.number().min(0),
  otHours: z.number().min(0),

  note: z.string().nullable().optional(),

  rawRowJson: z.any().optional(),
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

function cleanText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function convertThaiDate(dateStr: string | null) {
  if (!dateStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const months: Record<string, string> = {
    "ม.ค.": "01",
    "ก.พ.": "02",
    "มี.ค.": "03",
    "เม.ย.": "04",
    "พ.ค.": "05",
    "มิ.ย.": "06",
    "ก.ค.": "07",
    "ส.ค.": "08",
    "ก.ย.": "09",
    "ต.ค.": "10",
    "พ.ย.": "11",
    "ธ.ค.": "12",
  };

  const parts = dateStr.split(" ");
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, "0");
  const month = months[parts[1]];
  let year = parts[2];

  if (!month) return null;

  if (year.length === 2) {
    year = "20" + year;
  }

  return `${year}-${month}-${day}`;
}

function toNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
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

  if (rows.length === 0) {
    return { rows: [], errors: ["ไม่มีข้อมูลในชีต"] };
  }

  const dataRows = rows.slice(1);

  const validRows: z.infer<typeof attendanceSchema>[] = [];
  const errors: string[] = [];

dataRows.forEach((row, index) => {
  const employeeCode = cleanText(row[10]);
  const workDate = cleanText(row[4]);
  const firstName = cleanText(row[12]);
  const lastName = cleanText(row[13]);

  // ข้ามแถวว่าง / แถวไม่มีรหัส / แถวไม่มีวันที่ / แถวไม่มีชื่อ
  if (
    !employeeCode ||
    employeeCode === "#N/A" ||
    !workDate ||
    (!firstName && !lastName)
  ) {
    return;
  }

  const ot1 = toNumber(row[14]);
  const ot15 = toNumber(row[15]);
  const ot2 = toNumber(row[16]);

  const raw = {
    rawDateText: cleanText(row[0]),
    searchText: cleanText(row[1]),
    startTime: cleanText(row[2]),
    shiftName: cleanText(row[3]),
    workDate,

    branchCode: cleanText(row[5]),
    formulaCol1: cleanText(row[6]),
    formulaCol2: cleanText(row[7]),
    statusCode: cleanText(row[8]),
    workTime: cleanText(row[9]),

    employeeCode,
    employeeCode13: cleanText(row[11]),

    firstName,
    lastName,
    employeeName: `${firstName ?? ""} ${lastName ?? ""}`.trim(),

    ot1,
    ot15,
    ot2,
    otHours: ot1 + ot15 + ot2,

    isPresent: true,

    note: cleanText(row[19]),
    rawRowJson: JSON.parse(JSON.stringify(row)),
  };

  validRows.push(raw as any);
});

  return {
    rows: validRows,
    errors,
  };
}