/**
 * @deprecated DEMO / PROTOTYPE DATA ONLY — NOT USED IN PRODUCTION
 * ------------------------------------------------------------
 * This file is NOT imported by any active page or service.
 * All live data comes from the backend API (payroll-backend).
 *
 * WARNING: The dailyRate values here (400 THB) differ from the backend
 * constant (372 THB) and the payroll_wage_config table. Do NOT use these
 * figures for any real calculation.
 *
 * This file is kept for reference/demo purposes only.
 * It can be safely deleted once the team confirms no demo mode is needed.
 */

import { Employee, Attendance } from "@/types/domain";

// ----------------------------------------------------------------------
// Employees — ข้อมูลพนักงานต่างด้าวตัวอย่าง
// ----------------------------------------------------------------------
export const mockEmployees: Employee[] = [
  {
    id: "emp-001",
    employeeCode: "MM-001",
    fullname: "Aung Ko Ko",
    nationality: "เมียนมา",
    department: "ฝ่ายผลิต A",
    dailyRate: 400,
    otRate: 75,
    createdAt: "2024-01-15T00:00:00Z",
  },
  {
    id: "emp-002",
    employeeCode: "MM-002",
    fullname: "Thida Win",
    nationality: "เมียนมา",
    department: "ฝ่ายผลิต A",
    dailyRate: 400,
    otRate: 75,
    createdAt: "2024-02-01T00:00:00Z",
  },
  {
    id: "emp-003",
    employeeCode: "KH-001",
    fullname: "Sok Pisey",
    nationality: "กัมพูชา",
    department: "คลังสินค้า",
    dailyRate: 420,
    otRate: 80,
    createdAt: "2024-03-10T00:00:00Z",
  },
  {
    id: "emp-004",
    employeeCode: "LA-001",
    fullname: "Khamla Vong",
    nationality: "ลาว",
    department: "ฝ่ายผลิต B",
    dailyRate: 410,
    otRate: 78,
    createdAt: "2024-04-05T00:00:00Z",
  },
  {
    id: "emp-005",
    employeeCode: "MM-003",
    fullname: "Nyein Chan",
    nationality: "เมียนมา",
    department: "ฝ่ายผลิต B",
    dailyRate: 400,
    otRate: 75,
    createdAt: "2024-05-20T00:00:00Z",
  },
  {
    id: "emp-006",
    employeeCode: "KH-002",
    fullname: "Channary Mao",
    nationality: "กัมพูชา",
    department: "คลังสินค้า",
    dailyRate: 420,
    otRate: 80,
    createdAt: "2024-06-12T00:00:00Z",
  },
];

// ----------------------------------------------------------------------
// Attendance — สร้างข้อมูลสุ่มของเดือนปัจจุบัน
// ----------------------------------------------------------------------
function generateMonthAttendance(): Attendance[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  const records: Attendance[] = [];
  let id = 1;

  for (const emp of mockEmployees) {
    for (let day = 1; day <= today; day++) {
      const date = new Date(year, month, day);
      const isWeekend = date.getDay() === 0; // อาทิตย์ = วันหยุด
      // สุ่มขาดงาน ~5%, ลา ~3%
      const r = Math.random();
      const isPresent = !isWeekend && r > 0.08;
      const isLeave = !isWeekend && r > 0.05 && r <= 0.08;
      const otHours = isPresent && Math.random() > 0.6 ? Math.floor(Math.random() * 4) + 1 : 0;

      records.push({
        id: `att-${id++}`,
        employeeId: emp.id,
        workDate: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        isPresent,
        isLeave,
        otHours,
        note: isLeave ? "ลากิจ" : undefined,
      });
    }
    // หลีกเลี่ยง warning ตัวแปรไม่ใช้
    void daysInMonth;
  }

  return records;
}

export const mockAttendance: Attendance[] = generateMonthAttendance();
