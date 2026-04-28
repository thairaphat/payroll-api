import { prisma } from "../../db";
import { readAttendanceFromGoogleSheet } from "./google-sheet.service";

export async function syncAttendanceFromSheet({ sheetId }: { sheetId: string }) {
  const { rows, errors } = await readAttendanceFromGoogleSheet(sheetId);

  let inserted = 0;

  for (const item of rows) {
    await prisma.attendance_records.create({
      data: {
        employee_code: item.employeeCode,
        employee_name: item.employeeName,
        work_date: new Date(item.workDate),
        is_present: item.isPresent,
        ot_hours: item.otHours,
        note: item.note || "",
        source_sheet_id: sheetId,
      },
    });

    inserted++;
  }

  return {
    inserted,
    updated: 0,
    skipped: 0,
    errors,
  };
}