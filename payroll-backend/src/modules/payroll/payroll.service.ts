import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { DAILY_WAGE, WORK_HOURS } from "../../constants/payroll";
import {
  APPROVAL_STATUS,
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
} from "../../constants/attendance";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DEDUCTION_FIELDS = [
  "insuranceDeduction",
  "employerChangeDeduction",
  "report90DaysDeduction",
  "registrationDeduction",
  "extensionDeduction",
  "absentDeduction",
  "transportDeduction",
  "documentFeeDeduction",
] as const;

export type PayrollDateRange = {
  startDate: string;
  endDate: string;
};

function validateDateRange(range: PayrollDateRange) {
  if (!DATE_PATTERN.test(range.startDate) || !DATE_PATTERN.test(range.endDate)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function withDeductionBreakdown<T extends Record<string, unknown>>(row: T) {
  const enriched = {
    ...row,
    insuranceDeduction: num(row.insuranceDeduction),
    employerChangeDeduction: num(row.employerChangeDeduction),
    report90DaysDeduction: num(row.report90DaysDeduction),
    registrationDeduction: num(row.registrationDeduction),
    extensionDeduction: num(row.extensionDeduction),
    absentDeduction: num(row.absentDeduction),
    transportDeduction: num(row.transportDeduction),
    documentFeeDeduction: num(row.documentFeeDeduction ?? row.deduction_amount),
  };

  const totalDeduction = DEDUCTION_FIELDS.reduce(
    (sum, field) => sum + num(enriched[field]),
    0
  );

  return {
    ...enriched,
    deduction_amount: totalDeduction,
    net_income: num(row.gross_income) - totalDeduction,
  };
}

function buildPayrollSql(
  range: PayrollDateRange,
  includeDraft: boolean,
  employeeCode?: string
) {
  const approvalFragment = includeDraft
    ? Prisma.empty
    : Prisma.sql`AND (
        a.approval_status = ${APPROVAL_STATUS.APPROVED}
        OR a.payroll_locked_at IS NOT NULL
      )`;

  const employeeFragment = employeeCode
    ? Prisma.sql`AND COALESCE(m.emp_code, a.employee_code) = ${employeeCode}`
    : Prisma.empty;

  const limitFragment = employeeCode ? Prisma.sql`LIMIT 1` : Prisma.empty;

  return Prisma.sql`
    SELECT
      COALESCE(m.emp_code, a.employee_code) AS employee_code,
      a.employee_name,
      a.branch_code,
      SUM(a.is_present) AS work_days,

      SUM(COALESCE(a.ot1, 0)) AS total_ot1,
      SUM(COALESCE(a.ot15, 0)) AS total_ot15,
      SUM(COALESCE(a.ot2, 0)) AS total_ot2,
      SUM(COALESCE(a.ot_hours, 0)) AS total_ot_hours,

      SUM(a.is_present) * ${DAILY_WAGE} AS base_income,

      SUM(COALESCE(a.ot15, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 1.5 AS ot15_income,
      SUM(COALESCE(a.ot2, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 2 AS ot2_income,

      COALESCE(e.debt_amount, 0) AS deduction_amount,

      (
        SUM(a.is_present) * ${DAILY_WAGE}
        + SUM(COALESCE(a.ot15, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 1.5
        + SUM(COALESCE(a.ot2, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 2
      ) AS gross_income,

      (
        (
          SUM(a.is_present) * ${DAILY_WAGE}
          + SUM(COALESCE(a.ot15, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 1.5
          + SUM(COALESCE(a.ot2, 0)) * (${DAILY_WAGE} / ${WORK_HOURS}) * 2
        ) - COALESCE(e.debt_amount, 0)
      ) AS net_income

    FROM attendance_records a
    LEFT JOIN employee_code_mapping m ON a.employee_code = m.sheet_employee_code
    LEFT JOIN employee_document_profiles e ON COALESCE(m.emp_code, a.employee_code) = e.emp_code
    WHERE a.is_present = 1
      ${approvalFragment}
      AND a.work_date BETWEEN ${toDate(range.startDate)} AND ${toDate(range.endDate)}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
      AND a.employee_name <> ${TEST_EMPLOYEE_NAME}
      ${employeeFragment}
    GROUP BY COALESCE(m.emp_code, a.employee_code), a.employee_name, a.branch_code, e.debt_amount
    ORDER BY employee_code ASC
    ${limitFragment}
  `;
}

export const getPayrollSummary = async (
  range: PayrollDateRange,
  includeDraft = false
) => {
  validateDateRange(range);
  const rows = await prisma.$queryRaw<any[]>(buildPayrollSql(range, includeDraft));
  return rows.map(withDeductionBreakdown);
};

export const getPayrollByEmployeeCode = async (
  employeeCode: string,
  range: PayrollDateRange,
  includeDraft = false
) => {
  validateDateRange(range);
  const rows = await prisma.$queryRaw<any[]>(
    buildPayrollSql(range, includeDraft, employeeCode)
  );
  return rows.length > 0 ? withDeductionBreakdown(rows[0]) : null;
};
