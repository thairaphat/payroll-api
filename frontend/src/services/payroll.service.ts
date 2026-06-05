/**
 * Payroll Service
 * ------------------------------------------------------------
 * IMPORTANT:
 *   Service นี้เป็นหัวใจหลักของระบบ ใช้คำนวณเงินเดือนทั้งหมด
 *
 * Logic:
 *   - รวมวันทำงาน (isPresent === true)
 *   - รวมชั่วโมง OT
 *   - รายได้รวม = (วันทำงาน × ค่าแรง/วัน) + (OT × ค่าแรง OT)
 *   - เงินสุทธิ = รายได้รวม - รายการหัก
 *
 * TODO (ทีม Backend):
 *   - รองรับโบนัส, allowance (ค่าครองชีพ, ค่าตำแหน่ง)
 *   - รองรับหลายบริษัท / หลายไซต์งาน (multi-tenant)
 *   - หักประกันสังคมตามกฎหมาย (ปัจจุบันยังไม่หัก เพราะแรงงานต่างด้าวบางกลุ่มไม่เข้าเกณฑ์)
 *   - ย้าย logic นี้ไปที่ฝั่ง server เพื่อกัน manipulation จาก client
 */

import { Attendance, Employee, Payroll } from "@/types/domain";
import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface PayrollSummary {
  totalWorkDays: number;
  totalOtHours: number;
  totalLeaveDays: number;
  totalAbsentDays: number;
  grossIncome: number;
  totalDeduction: number;
  netSalary: number;
}

export type PayrollSummaryParams = {
  startDate?: string;
  endDate?: string;
  includeDraft?: boolean;
};

export async function fetchPayrollSummary(params: PayrollSummaryParams = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.set("startDate", params.startDate);
  if (params.endDate) query.set("endDate", params.endDate);
  if (params.includeDraft) query.set("includeDraft", "true");

  const res = await authFetch(`${API_URL}/payroll${query.toString() ? `?${query}` : ""}`);
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error("Failed to load payroll");
  }
  return json.data ?? [];
}

export type PayrollLockScope = {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
};

export async function lockPayrollPeriod(scope: PayrollLockScope) {
  const res = await authFetch(`${API_URL}/payroll/lock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(scope),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message ?? "Failed to lock payroll");
  }

  return json;
}

/**
 * รวม Attendance รายเดือนของพนักงาน 1 คน
 * NOTE: ฟังก์ชัน pure ไม่มี side-effect ทดสอบง่าย
 */
export function summarizeMonthlyAttendance(
  employee: Employee,
  attendance: Attendance[],
  options?: { deduction?: number }
): PayrollSummary {
  const totalWorkDays = attendance.filter((a) => a.isPresent).length;
  const totalOtHours = attendance.reduce((sum, a) => sum + (a.otHours || 0), 0);
  const totalLeaveDays = attendance.filter((a) => a.isLeave).length;
  const totalAbsentDays = attendance.filter((a) => !a.isPresent && !a.isLeave).length;

  const grossIncome = totalWorkDays * employee.dailyRate + totalOtHours * employee.otRate;
  const totalDeduction = options?.deduction ?? 0;
  const netSalary = grossIncome - totalDeduction;

  return {
    totalWorkDays,
    totalOtHours,
    totalLeaveDays,
    totalAbsentDays,
    grossIncome,
    totalDeduction,
    netSalary,
  };
}

/**
 * สร้าง Payroll record จาก summary
 * TODO: หลังจากเชื่อม backend ให้ส่งไป endpoint POST /api/payrolls
 */
export function buildPayroll(
  employee: Employee,
  summary: PayrollSummary,
  month: number,
  year: number
): Payroll {
  return {
    id: `pay-${employee.id}-${year}-${month}`,
    employeeId: employee.id,
    payrollMonth: month,
    payrollYear: year,
    totalWorkDays: summary.totalWorkDays,
    totalOtHours: summary.totalOtHours,
    grossIncome: summary.grossIncome,
    totalDeduction: summary.totalDeduction,
    netSalary: summary.netSalary,
    createdAt: new Date().toISOString(),
  };
}

/** Format ตัวเลขเป็นสกุลบาท */
export function formatTHB(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}
