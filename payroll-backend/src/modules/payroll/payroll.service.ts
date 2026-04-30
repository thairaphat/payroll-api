import { prisma } from "../../db";

const DAILY_WAGE = 372;
const WORK_HOURS = 8;

export const getPayrollSummary = async () => {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      employee_code,
      employee_name,
      branch_code,
      SUM(is_present) AS work_days,

      SUM(COALESCE(ot1, 0)) AS total_ot1,
      SUM(COALESCE(ot15, 0)) AS total_ot15,
      SUM(COALESCE(ot2, 0)) AS total_ot2,
      SUM(COALESCE(ot_hours, 0)) AS total_ot_hours,

      SUM(is_present) * ? AS base_income,

      SUM(COALESCE(ot15, 0)) * (? / ?) * 1.5 AS ot15_income,
      SUM(COALESCE(ot2, 0)) * (? / ?) * 2 AS ot2_income,

      (
        SUM(is_present) * ?
        + SUM(COALESCE(ot15, 0)) * (? / ?) * 1.5
        + SUM(COALESCE(ot2, 0)) * (? / ?) * 2
      ) AS total_income

    FROM attendance_records
    WHERE is_present = 1
    GROUP BY employee_code, employee_name, branch_code
    ORDER BY employee_code ASC
    `,
    DAILY_WAGE,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    WORK_HOURS
  );

  return rows;
};

export const getPayrollByEmployeeCode = async (employeeCode: string) => {
  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      employee_code,
      employee_name,
      branch_code,
      SUM(is_present) AS work_days,

      SUM(COALESCE(ot1, 0)) AS total_ot1,
      SUM(COALESCE(ot15, 0)) AS total_ot15,
      SUM(COALESCE(ot2, 0)) AS total_ot2,
      SUM(COALESCE(ot_hours, 0)) AS total_ot_hours,

      SUM(is_present) * ? AS base_income,

      SUM(COALESCE(ot15, 0)) * (? / ?) * 1.5 AS ot15_income,
      SUM(COALESCE(ot2, 0)) * (? / ?) * 2 AS ot2_income,

      (
        SUM(is_present) * ?
        + SUM(COALESCE(ot15, 0)) * (? / ?) * 1.5
        + SUM(COALESCE(ot2, 0)) * (? / ?) * 2
      ) AS total_income

    FROM attendance_records
    WHERE is_present = 1
      AND employee_code = ?
    GROUP BY employee_code, employee_name, branch_code
    LIMIT 1
    `,
    DAILY_WAGE,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    DAILY_WAGE,
    WORK_HOURS,
    DAILY_WAGE,
    WORK_HOURS,
    employeeCode
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};