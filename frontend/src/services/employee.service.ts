import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchEmployees() {
  const res = await authFetch(`${API_URL}/employees`);
  const json = await res.json();
  if (!res.ok) throw new Error("โหลดข้อมูลพนักงานไม่สำเร็จ");
  return json.data ?? [];
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

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "เพิ่มพนักงานไม่สำเร็จ");
  return json;
}

export async function getUnmappedAttendance() {
  const res = await authFetch(`${API_URL}/employees/unmapped`);
  if (!res.ok) throw new Error("โหลดข้อมูล Attendance ที่ยังไม่ได้ Map ไม่สำเร็จ");
  const json = await res.json();
  return json.data || [];
}

export async function saveMapping(sheet_employee_code: string, emp_code: string) {
  const res = await authFetch(`${API_URL}/employees/mapping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet_employee_code, emp_code }),
  });

  if (!res.ok) throw new Error("บันทึกการ Mapping ไม่สำเร็จ");
  return res.json();
}
