import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { APPROVAL_STATUS, FIELD_APP_SHEET_ID } from "../../constants/attendance";
import type { AuthUser } from "../../middlewares/auth.middleware";
import { logRequiredAudit } from "../../services/audit.service";
import {
  normalizeEmployeeCode,
  resolveProfileDisplayName,
} from "../../utils/employee-profile";

export const FIELD_ATTENDANCE_BATCH_LIMIT = 200;

export type FieldAttendanceRecordInput = {
  employee_code?: unknown;
  employee_code_13?: unknown;
  employee_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  start_time?: unknown;
  shift_name?: unknown;
  branch_code?: unknown;
  work_time?: unknown;
  leave_day?: unknown;
  ot1?: unknown;
  ot15?: unknown;
  ot2?: unknown;
  note?: unknown;
  search_text?: unknown;
  half_day?: unknown;
  work_type_2?: unknown;
};

export class FieldAttendanceBulkError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "BATCH_LIMIT_EXCEEDED"
      | "DUPLICATE_ATTENDANCE"
      | "UNKNOWN_EMPLOYEE"
      | "COMPANY_SCOPE_MISMATCH"
      | "ATTENDANCE_LOCKED"
      | "FORBIDDEN",
    message: string,
    public readonly status: 400 | 403 | 413 | 423
  ) {
    super(message);
    this.name = "FieldAttendanceBulkError";
  }
}

export type FieldAttendanceTx = Pick<
  Prisma.TransactionClient,
  | "attendance_records"
  | "employee_document_profiles"
  | "payroll_audit_logs"
>;

type TransactionRunner = {
  $transaction<T>(operation: (tx: FieldAttendanceTx) => Promise<T>): Promise<T>;
};

type ValidatedRecord = FieldAttendanceRecordInput & {
  employeeCode: string;
  ot1Value?: number;
  ot15Value?: number;
  ot2Value?: number;
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalTime(value: unknown) {
  if (value == null || value === "") return true;
  return typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value);
}

function optionalWorkTime(value: unknown) {
  if (value == null || value === "") return true;
  return (
    typeof value === "string" &&
    (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value) ||
      /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(value))
  );
}

function optionalNonNegativeNumber(value: unknown, field: string) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
    throw new FieldAttendanceBulkError(
      "INVALID_INPUT",
      `${field} must be a number between 0 and 24`,
      400
    );
  }
  return parsed;
}

export function validateFieldAttendanceBatch(
  date: unknown,
  records: unknown
): { workDate: Date; records: ValidatedRecord[] } {
  if (typeof date !== "string" || !validDate(date)) {
    throw new FieldAttendanceBulkError(
      "INVALID_INPUT",
      "date must use YYYY-MM-DD",
      400
    );
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new FieldAttendanceBulkError(
      "INVALID_INPUT",
      "records must be a non-empty array",
      400
    );
  }
  if (records.length > FIELD_ATTENDANCE_BATCH_LIMIT) {
    throw new FieldAttendanceBulkError(
      "BATCH_LIMIT_EXCEEDED",
      `records must not exceed ${FIELD_ATTENDANCE_BATCH_LIMIT} items`,
      413
    );
  }

  const seen = new Set<string>();
  const validated = records.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new FieldAttendanceBulkError(
        "INVALID_INPUT",
        "Each attendance record must be an object",
        400
      );
    }
    const record = raw as FieldAttendanceRecordInput;
    const employeeCode =
      typeof record.employee_code === "string"
        ? normalizeEmployeeCode(record.employee_code)
        : "";
    if (!employeeCode || employeeCode.length > 64) {
      throw new FieldAttendanceBulkError(
        "INVALID_INPUT",
        "employee_code is required",
        400
      );
    }
    if (seen.has(employeeCode)) {
      throw new FieldAttendanceBulkError(
        "DUPLICATE_ATTENDANCE",
        "The batch contains a duplicate employee/date record",
        400
      );
    }
    seen.add(employeeCode);
    if (
      !optionalTime(record.start_time) ||
      !optionalWorkTime(record.work_time)
    ) {
      throw new FieldAttendanceBulkError(
        "INVALID_INPUT",
        "Attendance time fields are invalid",
        400
      );
    }
    return {
      ...record,
      employeeCode,
      ot1Value: optionalNonNegativeNumber(record.ot1, "ot1"),
      ot15Value: optionalNonNegativeNumber(record.ot15, "ot15"),
      ot2Value: optionalNonNegativeNumber(record.ot2, "ot2"),
    };
  });

  return {
    workDate: new Date(`${date}T00:00:00.000Z`),
    records: validated,
  };
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildData(
  record: ValidatedRecord,
  workDate: Date,
  user: AuthUser,
  employeeName: string,
  ot: { ot1: number; ot15: number; ot2: number }
) {
  const firstName = text(record.first_name);
  const lastName = text(record.last_name);
  return {
    employee_code: normalizeEmployeeCode(record.employeeCode),
    employee_code_13: text(record.employee_code_13),
    employee_name: employeeName,
    first_name: firstName,
    last_name: lastName,
    work_date: workDate,
    start_time: text(record.start_time),
    shift_name: text(record.shift_name),
    branch_code: text(record.branch_code),
    work_time: text(record.work_time),
    is_present: !Boolean(record.leave_day),
    ot1: ot.ot1,
    ot15: ot.ot15,
    ot2: ot.ot2,
    ot_hours: ot.ot1 + ot.ot15 + ot.ot2,
    note: text(record.note),
    search_text: text(record.search_text),
    source_sheet_id: FIELD_APP_SHEET_ID,
    approval_status: APPROVAL_STATUS.DRAFT,
    created_by: Number(user.id),
    raw_row_json: {
      half_day: Boolean(record.half_day),
      work_type_2: text(record.work_type_2) ?? "",
    },
  };
}

export async function saveFieldAttendanceBatch(
  input: { date: unknown; records: unknown },
  user: AuthUser,
  companyId: number,
  transactionRunner: TransactionRunner = prisma
) {
  const validated = validateFieldAttendanceBatch(input.date, input.records);
  const codes = validated.records.map((record) =>
    normalizeEmployeeCode(record.employeeCode)
  );

  return transactionRunner.$transaction(async (tx) => {
    const profiles = await tx.employee_document_profiles.findMany({
      where: { emp_code: { in: codes }, company_id: { not: null } },
      select: {
        emp_code: true,
        company_id: true,
        first_name_th: true,
        last_name_th: true,
        first_name_en: true,
        last_name_en: true,
        first_name: true,
        last_name: true,
      },
    });
    const ownership = new Map<string, Set<number>>();
    const officialNames = new Map<string, string>();
    for (const profile of profiles) {
      if (!profile.emp_code || profile.company_id == null) continue;
      const normalizedCode = normalizeEmployeeCode(profile.emp_code);
      const owners = ownership.get(normalizedCode) ?? new Set<number>();
      owners.add(profile.company_id);
      ownership.set(normalizedCode, owners);
      if (profile.company_id === companyId) {
        const officialName = resolveProfileDisplayName(profile);
        if (officialName) officialNames.set(normalizedCode, officialName);
      }
    }
    const crossCompany = codes.some(
      (code) => {
        const owners = ownership.get(code);
        return Boolean(
          owners &&
            (owners.size !== 1 || !owners.has(companyId))
        );
      }
    );
    if (crossCompany) {
      throw new FieldAttendanceBulkError(
        "COMPANY_SCOPE_MISMATCH",
        "Records contain an employee assigned to another company",
        403
      );
    }
    if (codes.some((code) => !ownership.has(code))) {
      throw new FieldAttendanceBulkError(
        "UNKNOWN_EMPLOYEE",
        "Records contain an unknown employee code",
        403
      );
    }
    if (codes.some((code) => !officialNames.has(code))) {
      throw new FieldAttendanceBulkError(
        "UNKNOWN_EMPLOYEE",
        "Employee profile is incomplete for the current company",
        403
      );
    }

    const existingRows = await tx.attendance_records.findMany({
      where: {
        source_sheet_id: FIELD_APP_SHEET_ID,
        work_date: validated.workDate,
        employee_code: { in: codes },
      },
      select: {
        employee_code: true,
        approval_status: true,
        payroll_locked_at: true,
        created_by: true,
        ot1: true,
        ot15: true,
        ot2: true,
      },
    });
    const existing = new Map(
      existingRows.map((row) => [normalizeEmployeeCode(row.employee_code), row])
    );
    for (const code of codes) {
      const row = existing.get(code);
      if (
        row?.approval_status === APPROVAL_STATUS.APPROVED ||
        row?.payroll_locked_at
      ) {
        throw new FieldAttendanceBulkError(
          "ATTENDANCE_LOCKED",
          "Attendance is approved or payroll locked",
          423
        );
      }
      if (
        user.role === "field_staff" &&
        row?.created_by &&
        row.created_by !== Number(user.id)
      ) {
        throw new FieldAttendanceBulkError(
          "FORBIDDEN",
          "Cannot edit attendance created by another user",
          403
        );
      }
    }

    for (const record of validated.records) {
      const normalizedCode = normalizeEmployeeCode(record.employeeCode);
      const existingRow = existing.get(normalizedCode);
      const ot = {
        ot1: record.ot1Value ?? Number(existingRow?.ot1 ?? 0),
        ot15: record.ot15Value ?? Number(existingRow?.ot15 ?? 0),
        ot2: record.ot2Value ?? Number(existingRow?.ot2 ?? 0),
      };
      const data = buildData(
        { ...record, employeeCode: normalizedCode },
        validated.workDate,
        user,
        officialNames.get(normalizedCode)!,
        ot
      );
      const { approval_status, created_by, ...updateData } = data;
      await tx.attendance_records.upsert({
        where: {
          uniq_attendance: {
            source_sheet_id: FIELD_APP_SHEET_ID,
            employee_code: normalizedCode,
            work_date: validated.workDate,
          },
        },
        create: data,
        update: updateData,
      });
    }

    await logRequiredAudit(
      "attendance.bulk",
      "attendance_period",
      {
        date: String(input.date),
        sourceSheetId: FIELD_APP_SHEET_ID,
        companyId,
      },
      user,
      { record_count: validated.records.length },
      tx
    );

    return { success: true, count: validated.records.length };
  });
}
