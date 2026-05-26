import { prisma } from "../../db";
import { APPROVAL_STATUS } from "../../constants/attendance";
import { readAttendanceFromGoogleSheet } from "./google-sheet.service";

const UPDATE_CHUNK_SIZE = 100;

let isSyncing = false;

function safeDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(text);
  }
  return new Date();
}

function isAttendanceLocked(record: {
  approval_status: string;
  payroll_locked_at: Date | null;
}) {
  return (
    record.approval_status === APPROVAL_STATUS.APPROVED ||
    Boolean(record.payroll_locked_at)
  );
}

function buildSharedData(item: any) {
  return {
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
  };
}

export async function syncAttendanceFromSheet({
  sheetId,
}: {
  sheetId: string;
}) {
  if (isSyncing) {
    throw new Error("ระบบกำลังทำการซิงค์ข้อมูลอยู่ กรุณารอสักครู่");
  }

  try {
    isSyncing = true;
    const { rows, errors } = await readAttendanceFromGoogleSheet(sheetId);

    if (rows.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0, errors, rows: [] };
    }

    // Fetch all existing records for this sheet in a single query
    const existingRecords = await prisma.attendance_records.findMany({
      where: { source_sheet_id: sheetId },
      select: {
        employee_code: true,
        work_date: true,
        approval_status: true,
        payroll_locked_at: true,
      },
    });

    const existingMap = new Map(
      existingRecords.map((r) => [
        `${r.employee_code}|${r.work_date.toISOString().slice(0, 10)}`,
        r,
      ])
    );

    const toInsert: any[] = [];
    const toUpdate: Array<{
      where: { uniq_attendance: { source_sheet_id: string; employee_code: string; work_date: Date } };
      data: ReturnType<typeof buildSharedData>;
    }> = [];
    let skipped = 0;

    for (const item of rows as any[]) {
      const workDate = safeDate(item.workDate);
      const employeeCode = item.employeeCode;
      const key = `${employeeCode}|${workDate.toISOString().slice(0, 10)}`;
      const existing = existingMap.get(key);

      if (existing && isAttendanceLocked(existing)) {
        skipped++;
        errors.push(
          `Skipped locked attendance: ${employeeCode} ${workDate.toISOString().slice(0, 10)}`
        );
        continue;
      }

      const sharedData = buildSharedData(item);

      if (existing) {
        toUpdate.push({
          where: {
            uniq_attendance: { source_sheet_id: sheetId, employee_code: employeeCode, work_date: workDate },
          },
          data: sharedData,
        });
      } else {
        toInsert.push({
          ...sharedData,
          employee_code: employeeCode,
          work_date: workDate,
          source_sheet_id: sheetId,
          approval_status: APPROVAL_STATUS.DRAFT,
        });
      }
    }

    let inserted = 0;
    let updated = 0;

    if (toInsert.length > 0) {
      try {
        const result = await prisma.attendance_records.createMany({
          data: toInsert,
          skipDuplicates: true,
        });
        inserted = result.count;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Batch insert error: ${message}`);
      }
    }

    // Process updates in chunks to avoid transaction timeouts on large datasets
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
      try {
        await prisma.$transaction(
          chunk.map(({ where, data }) =>
            prisma.attendance_records.update({ where, data })
          )
        );
        updated += chunk.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`Batch update error (chunk ${Math.floor(i / UPDATE_CHUNK_SIZE) + 1}): ${message}`);
      }
    }

    const latestRows = await prisma.attendance_records.findMany({
      orderBy: [{ work_date: "desc" }, { id: "desc" }],
      take: 50,
    });

    return { inserted, updated, skipped, errors, rows: latestRows };
  } finally {
    isSyncing = false;
  }
}
