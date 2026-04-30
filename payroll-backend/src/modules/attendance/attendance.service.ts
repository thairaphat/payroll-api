import { prisma } from "../../db";
import { readAttendanceFromGoogleSheet } from "./google-sheet.service";

function safeDate(value: unknown) {
  const text = String(value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(text);
  }

  return new Date();
}

export async function syncAttendanceFromSheet({
  sheetId,
}: {
  sheetId: string;
}) {
  const { rows, errors } = await readAttendanceFromGoogleSheet(sheetId);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of rows as any[]) {
    try {
      const workDate = safeDate(item.workDate);
      const employeeCode = item.employeeCode || `UNKNOWN-${inserted + updated + skipped + 1}`;

      await prisma.attendance_records.upsert({
        where: {
          uniq_attendance: {
            source_sheet_id: sheetId,
            employee_code: employeeCode,
            work_date: workDate,
          },
        },

        create: {
          raw_date_text: item.rawDateText ?? null,
          search_text: item.searchText ?? null,

          start_time: item.startTime ?? null,
          shift_name: item.shiftName ?? null,
          branch_code: item.branchCode ?? null,
          formula_col_1: item.formulaCol1 ?? null,
          formula_col_2: item.formulaCol2 ?? null,
          status_code: item.statusCode ?? null,
          work_time: item.workTime ?? null,

          employee_code: employeeCode,
          employee_code_13: item.employeeCode13 ?? null,
          employee_name: item.employeeName || "UNKNOWN",
          first_name: item.firstName ?? null,
          last_name: item.lastName ?? null,

          work_date: workDate,
          is_present: item.isPresent ?? true,

          ot1: item.ot1 ?? 0,
          ot15: item.ot15 ?? 0,
          ot2: item.ot2 ?? 0,
          ot_hours: item.otHours ?? 0,

          note: item.note ?? null,
          raw_row_json: item.rawRowJson ?? null,

          source_sheet_id: sheetId,
        },

        update: {
          raw_date_text: item.rawDateText ?? null,
          search_text: item.searchText ?? null,

          start_time: item.startTime ?? null,
          shift_name: item.shiftName ?? null,
          branch_code: item.branchCode ?? null,
          formula_col_1: item.formulaCol1 ?? null,
          formula_col_2: item.formulaCol2 ?? null,
          status_code: item.statusCode ?? null,
          work_time: item.workTime ?? null,

          employee_code_13: item.employeeCode13 ?? null,
          employee_name: item.employeeName || "UNKNOWN",
          first_name: item.firstName ?? null,
          last_name: item.lastName ?? null,

          is_present: item.isPresent ?? true,

          ot1: item.ot1 ?? 0,
          ot15: item.ot15 ?? 0,
          ot2: item.ot2 ?? 0,
          ot_hours: item.otHours ?? 0,

          note: item.note ?? null,
          raw_row_json: item.rawRowJson ?? null,
        },
      });

      inserted++;
    } catch (error) {
      skipped++;

      const message =
        error instanceof Error ? error.message : JSON.stringify(error);

      console.error("INSERT ERROR:", message);

      errors.push(`ข้าม row: ${message}`);
    }
  }

  const latestRows = await prisma.attendance_records.findMany({
    orderBy: [{ work_date: "desc" }, { id: "desc" }],
    take: 50,
  });

  return {
    inserted,
    updated,
    skipped,
    errors,
    rows: latestRows,
  };
}