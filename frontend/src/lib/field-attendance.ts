export type ProfileStatus = "FOUND" | "NOT_FOUND";
export type OtField = "ot1" | "ot15" | "ot2";

export type FieldAttendanceRecord = {
  [key: string]: unknown;
  employee_code: string;
  employee_code_13: string;
  employee_name: string | null;
  employee_profile_status: ProfileStatus;
  first_name: string;
  last_name: string;
  branch_code: string;
  start_time: string;
  work_time: string;
  work_type_2: string;
  note: string;
  ot1: number;
  ot15: number;
  ot2: number;
  half_day: boolean;
  leave_day: boolean;
};

export type PendingOtInput = {
  type: string;
  hours: string;
};

const OT_FIELDS = new Set<OtField>(["ot1", "ot15", "ot2"]);

function numericValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeFieldAttendanceRecord(
  row: Record<string, unknown>,
  isUsableEmployeeName: (value: unknown) => boolean
): FieldAttendanceRecord {
  const safeString = (value: unknown) =>
    value == null ? "" : String(value);
  const employeeName = isUsableEmployeeName(row.employee_name)
    ? String(row.employee_name).trim()
    : null;

  return {
    ...row,
    employee_code:
      safeString(row.employee_code) || safeString(row.emp_code),
    employee_code_13: safeString(row.employee_code_13),
    first_name: safeString(row.first_name),
    last_name: safeString(row.last_name),
    employee_name: employeeName,
    employee_profile_status:
      (row.employee_profile_status as ProfileStatus | undefined) ??
      (employeeName ? "FOUND" : "NOT_FOUND"),
    branch_code: safeString(row.branch_code),
    start_time: safeString(row.start_time) || "08:00",
    work_time: safeString(row.work_time) || "08:00-17:00",
    work_type_2: safeString(row.work_type_2),
    note: safeString(row.note),
    ot1: numericValue(row.ot1),
    ot15: numericValue(row.ot15),
    ot2: numericValue(row.ot2),
    half_day: Boolean(row.half_day),
    leave_day: Boolean(row.leave_day),
  };
}

export function materializePendingOt(
  records: FieldAttendanceRecord[],
  pendingByEmployee: Record<string, PendingOtInput>
) {
  return records.map((record) => {
    const pending = pendingByEmployee[record.employee_code];
    if (!pending?.hours.trim()) return record;
    if (!OT_FIELDS.has(pending.type as OtField)) {
      throw new Error(`Invalid OT type for ${record.employee_code}`);
    }
    const hours = Number(pending.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error(`Invalid OT hours for ${record.employee_code}`);
    }
    const field = pending.type as OtField;
    const nextValue = record[field] + hours;
    if (nextValue > 24) {
      throw new Error(`OT hours exceed 24 for ${record.employee_code}`);
    }
    return { ...record, [field]: nextValue };
  });
}

export function getPersistedOtSummary(record: FieldAttendanceRecord) {
  return [
    { label: "OT 1", value: record.ot1 },
    { label: "OT 1.5", value: record.ot15 },
    { label: "OT 2", value: record.ot2 },
  ].filter((item) => item.value > 0);
}

export function getEmployeeCodeDisplay(employeeCode: string) {
  return employeeCode.slice(-3) || "—";
}
