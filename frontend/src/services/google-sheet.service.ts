import { Attendance } from "@/types/domain";
import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  rows?: Attendance[];
}

export async function syncAttendanceFromSheet(
  sheetId: string
): Promise<SyncResult> {
  const res = await authFetch(`${API_URL}/api/sheets/sync-attendance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sheetId }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message ?? "Sync Google Sheet ไม่สำเร็จ");
  }

  return res.json();
}

export type AttendanceListParams = {
  startDate?: string;
  endDate?: string;
  company?: string;
  approvalStatus?: string;
  page?: number;
  pageSize?: number;
  companyId?: number;
};

export async function getAttendanceRecords(params: AttendanceListParams = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.company) query.set("company", params.company);
  if (params.approvalStatus && params.approvalStatus !== "all") {
    query.set("approvalStatus", params.approvalStatus);
  }
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.companyId != null) query.set("companyId", String(params.companyId));

  const url = `${API_URL}/api/sheets/attendance${query.toString() ? `?${query}` : ""}`;
  const res = await authFetch(url);

  if (!res.ok) {
    throw new Error("โหลดข้อมูล attendance ไม่สำเร็จ");
  }

  const result = await res.json();
  // Support both new { ok, data, total } shape and legacy raw array
  return Array.isArray(result) ? result : (result?.data ?? []);
}

export async function getAvailableMonths(companyId?: number): Promise<string[]> {
  const query = companyId != null ? `?companyId=${companyId}` : "";
  const res = await authFetch(`${API_URL}/api/sheets/available-months${query}`);
  if (!res.ok) {
    throw new Error("โหลดเดือนที่พร้อมใช้งานไม่สำเร็จ");
  }
  return res.json();
}

export async function getAvailableDates(month: string, companyId?: number): Promise<string[]> {
  const query = new URLSearchParams({ month });
  if (companyId != null) query.set("companyId", String(companyId));
  const res = await authFetch(`${API_URL}/api/sheets/available-dates?${query}`);
  if (!res.ok) {
    throw new Error("โหลดวันที่ที่พร้อมใช้งานไม่สำเร็จ");
  }
  return res.json();
}

export type AttendanceApprovalScope = {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
};

async function postAttendanceApproval(path: string, scope: AttendanceApprovalScope) {
  const res = await authFetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(scope),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message ?? "Attendance approval action failed");
  }

  return json;
}

export async function submitAttendanceApproval(scope: AttendanceApprovalScope) {
  return postAttendanceApproval("/api/attendance/submit", scope);
}

export async function approveAttendanceApproval(scope: AttendanceApprovalScope) {
  return postAttendanceApproval("/api/attendance/approve", scope);
}

export function validateAttendanceRow(row: unknown): row is Attendance {
  if (typeof row !== "object" || row === null) return false;

  const r = row as Record<string, unknown>;

  return (
    typeof r.employeeId === "string" &&
    typeof r.workDate === "string" &&
    typeof r.isPresent === "boolean"
  );
}
