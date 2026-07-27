import { normalizeEmployeeCode } from "../../utils/employee-profile";

export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";

export type DashboardAttendanceRow = {
  employee_code: string | null;
  approval_status: string | null;
  updated_at: Date | null;
};

export type TodayFieldEntrySummary = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  latestEntry: Date | null;
};

export function getBangkokDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function toDatabaseDate(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Invalid dashboard date");
  }
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/**
 * Today Entered means distinct employees with a FIELD_APP attendance row whose
 * work_date is today's Bangkok calendar date. For duplicate rows, the latest
 * status for the normalized full employee code wins.
 */
export function summarizeTodayFieldAttendance(
  rows: readonly DashboardAttendanceRow[]
): TodayFieldEntrySummary {
  const latestByEmployee = new Map<string, DashboardAttendanceRow>();

  for (const row of rows) {
    const code = normalizeEmployeeCode(row.employee_code);
    if (!code) continue;

    const existing = latestByEmployee.get(code);
    const existingTime = existing?.updated_at?.getTime() ?? -Infinity;
    const candidateTime = row.updated_at?.getTime() ?? -Infinity;
    if (!existing || candidateTime > existingTime) {
      latestByEmployee.set(code, row);
    }
  }

  const uniqueRows = [...latestByEmployee.values()];
  const statusCount = (status: string) =>
    uniqueRows.filter(
      (row) => row.approval_status?.trim().toLowerCase() === status
    ).length;
  const latestTimestamp = uniqueRows.reduce<number | null>((latest, row) => {
    const timestamp = row.updated_at?.getTime();
    if (timestamp == null || !Number.isFinite(timestamp)) return latest;
    return latest == null || timestamp > latest ? timestamp : latest;
  }, null);

  return {
    total: uniqueRows.length,
    draft: statusCount("draft"),
    submitted: statusCount("submitted"),
    approved: statusCount("approved"),
    latestEntry: latestTimestamp == null ? null : new Date(latestTimestamp),
  };
}
