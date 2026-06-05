/**
 * Domain Types — Payroll System
 * ------------------------------------------------------------
 * NOTE: ชนิดข้อมูลกลางของระบบ ใช้ร่วมกันทั้ง Frontend / Backend (ในอนาคต)
 * ควรย้ายไปไว้ใน package shared/ เมื่อแยก monorepo
 *
 * TODO (ทีม Backend):
 *  - sync schema นี้ให้ตรงกับ PostgreSQL migration
 *  - generate types จาก DB ด้วย kysely-codegen หรือ prisma generate
 */

export type Role = "admin" | "hr" | "accounting" | "field_staff" | "viewer";

export interface Employee {
  id: string;
  employeeCode: string;
  fullname: string;
  nationality: string;       // เช่น "เมียนมา", "กัมพูชา", "ลาว"
  department: string;
  dailyRate: number;         // ค่าแรงรายวัน (บาท)
  otRate: number;            // ค่าโอที (บาท/ชั่วโมง)
  // TODO: passport_number, work_permit_expired_at
  createdAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  workDate: string;          // YYYY-MM-DD
  isPresent: boolean;
  isLeave: boolean;
  otHours: number;
  replacementName?: string;  // มีคนมาทำงานแทน
  note?: string;
  // TODO: nightShift: boolean
}

export interface Payroll {
  id: string;
  employeeId: string;
  payrollMonth: number;      // 1-12
  payrollYear: number;
  totalWorkDays: number;
  totalOtHours: number;
  grossIncome: number;
  totalDeduction: number;
  netSalary: number;
  pdfUrl?: string;           // เก็บลิงก์ PDF เมื่อ generate แล้ว
  createdAt: string;
}

/**
 * Payload ที่ใช้สร้าง Payroll
 * NOTE: แยกออกจาก entity เพื่อให้ Backend validate ง่าย
 */
export interface PayrollInput {
  employeeId: string;
  month: number;
  year: number;
  deduction?: number;        // หัก เช่น ค่าหอ ค่าน้ำค่าไฟ ฯลฯ
}
