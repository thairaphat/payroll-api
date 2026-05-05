import { prisma } from "../../db";

const DEFAULT_DAILY_WAGE = 372;
const WORK_HOURS = 8;

export const getPayrollSummary = async () => {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      COALESCE(m.emp_code, a.employee_code) AS employee_code,
      a.employee_name,
      a.branch_code,
      SUM(a.is_present) AS work_days,

      SUM(COALESCE(a.ot1, 0)) AS total_ot1,
      SUM(COALESCE(a.ot15, 0)) AS total_ot15,
      SUM(COALESCE(a.ot2, 0)) AS total_ot2,
      SUM(COALESCE(a.ot_hours, 0)) AS total_ot_hours,

      -- ใช้ค่าแรงขั้นต่ำคงที่ตามที่กำหนด (372)
      SUM(a.is_present) * ? AS base_income,

      SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5 AS ot15_income,
      SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2 AS ot2_income,

      COALESCE(e.debt_amount, 0) AS deduction_amount,

      (
        SUM(a.is_present) * ?
        + SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5
        + SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2
      ) AS gross_income,

      (
        (
          SUM(a.is_present) * ?
          + SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5
          + SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2
        ) - COALESCE(e.debt_amount, 0)
      ) AS net_income

    FROM attendance_records a
    LEFT JOIN employee_code_mapping m ON a.employee_code = m.sheet_employee_code
    LEFT JOIN employee_document_profiles e ON COALESCE(m.emp_code, a.employee_code) = e.emp_code
    WHERE a.is_present = 1
    GROUP BY COALESCE(m.emp_code, a.employee_code), a.employee_name, a.branch_code, e.debt_amount
    ORDER BY employee_code ASC
    `,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS
  );

  return rows;
};

export const getPayrollByEmployeeCode = async (employeeCode: string) => {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      COALESCE(m.emp_code, a.employee_code) AS employee_code,
      a.employee_name,
      a.branch_code,
      SUM(a.is_present) AS work_days,

      SUM(COALESCE(a.ot1, 0)) AS total_ot1,
      SUM(COALESCE(a.ot15, 0)) AS total_ot15,
      SUM(COALESCE(a.ot2, 0)) AS total_ot2,
      SUM(COALESCE(a.ot_hours, 0)) AS total_ot_hours,

      SUM(a.is_present) * ? AS base_income,

      SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5 AS ot15_income,
      SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2 AS ot2_income,

      COALESCE(e.debt_amount, 0) AS deduction_amount,

      (
        SUM(a.is_present) * ?
        + SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5
        + SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2
      ) AS gross_income,

      (
        (
          SUM(a.is_present) * ?
          + SUM(COALESCE(a.ot15, 0)) * (? / ?) * 1.5
          + SUM(COALESCE(a.ot2, 0)) * (? / ?) * 2
        ) - COALESCE(e.debt_amount, 0)
      ) AS net_income

    FROM attendance_records a
    LEFT JOIN employee_code_mapping m ON a.employee_code = m.sheet_employee_code
    LEFT JOIN employee_document_profiles e ON COALESCE(m.emp_code, a.employee_code) = e.emp_code
    WHERE a.is_present = 1
      AND COALESCE(m.emp_code, a.employee_code) = ?
    GROUP BY COALESCE(m.emp_code, a.employee_code), a.employee_name, a.branch_code, e.debt_amount
    LIMIT 1
    `,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    DEFAULT_DAILY_WAGE,
    WORK_HOURS,
    employeeCode
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};
