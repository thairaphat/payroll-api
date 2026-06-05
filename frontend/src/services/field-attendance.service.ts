import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function getFieldAttendance(date: string) {
  const res = await authFetch(`${API_URL}/api/field-attendance?date=${date}`);
  if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
  return res.json();
}

export async function getCompanies() {
  const res = await authFetch(`${API_URL}/employees/companies`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function addManualEmployee(data: {
  emp_code: string;
  first_name: string;
  last_name: string;
  company_id?: number;
}) {
  const res = await authFetch(`${API_URL}/employees/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (res.status === 409) {
    throw new Error("รหัสพนักงานนี้มีอยู่แล้ว");
  }
  
  if (!res.ok) throw new Error("เพิ่มพนักงานไม่สำเร็จ");
  return res.json();
}

export async function saveFieldAttendance(date: string, records: any[]) {
  const sanitizedRecords = records.map(({ shift_name, ...record }) => record);
  const res = await authFetch(`${API_URL}/api/field-attendance/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, records: sanitizedRecords }),
  });
  if (!res.ok) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
  return res.json();
}
