import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import {
  APPROVAL_STATUS,
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
} from "../../constants/attendance";
import { getActiveWageConfig, type WageConfig } from "../../services/wage-config.service";
import { companySqlFragment, getCompanyEmployeeCodes } from "../../services/company-scope.service";

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

/**
 * Converts all BigInt values in a flat raw-SQL result row to number.
 *
 * prisma.$queryRaw returns aggregate columns (SUM, MAX on INT columns, etc.)
 * as JavaScript BigInt on the MySQL/MariaDB driver.  BigInt is not JSON-serializable,
 * so every raw row must pass through this before being spread into a response object.
 *
 * Shallow conversion is sufficient — raw SQL rows are always flat objects.
 */
function normalizeSqlRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}

/**
 * Applies per-company wage to a raw SQL row and computes all income fields.
 *
 * Income uses the selected company's exact Decimal configuration:
 * base + OT1 + OT1.5 + OT2. Attendance has no independent OT3 field,
 * so OT3 is intentionally not calculated yet.
 *
 * Also attaches daily_wage_used / work_hours_used so snapshot save records the
 * exact rate applied to each employee, not a single global rate.
 */
export function applyWageToRow<T extends Record<string, unknown>>(row: T, wage: WageConfig): T & {
  base_income: number;
  ot1_income: number;
  ot15_income: number;
  ot2_income: number;
  gross_income: number;
  daily_wage_used: number;
  work_hours_used: number;
} {
  const workDays = new Prisma.Decimal(num(row.work_days));
  const ot1 = new Prisma.Decimal(num(row.total_ot1));
  const ot15 = new Prisma.Decimal(num(row.total_ot15));
  const ot2 = new Prisma.Decimal(num(row.total_ot2));
  const hourlyRate = wage.daily_wage.div(wage.work_hours_per_day);
  const baseIncome = workDays.mul(wage.daily_wage);
  const ot1Income = ot1.mul(hourlyRate).mul(wage.ot1_multiplier);
  const ot15Income = ot15.mul(hourlyRate).mul(wage.ot15_multiplier);
  const ot2Income = ot2.mul(hourlyRate).mul(wage.ot2_multiplier);
  const grossIncome = baseIncome.plus(ot1Income).plus(ot15Income).plus(ot2Income);
  return {
    ...row,
    base_income: baseIncome.toNumber(),
    ot1_income: ot1Income.toNumber(),
    ot15_income: ot15Income.toNumber(),
    ot2_income: ot2Income.toNumber(),
    gross_income: grossIncome.toNumber(),
    daily_wage_used: wage.daily_wage.toNumber(),
    work_hours_used: wage.work_hours_per_day.toNumber(),
  } as any;
}

function withDeductionBreakdown<T extends Record<string, unknown>>(row: T) {
  // Normalize employee_name — handles snake_case (raw SQL) and camelCase (Prisma ORM).
  const rawName = String((row as any).employee_name ?? (row as any).employeeName ?? "").trim();
  const rawCode = String((row as any).employee_code ?? (row as any).employeeCode ?? "").trim();
  const resolvedName = rawName || rawCode;

  const enriched = {
    ...row,
    employee_name: resolvedName,
    employeeName: resolvedName,
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

/**
 * Builds the core payroll aggregation SQL.
 *
 * Key change: income amounts (base_income, ot15_income, ot2_income, gross_income)
 * are NO LONGER computed in SQL.  They are computed in JavaScript after the query
 * returns, using the per-company wage config resolved via applyWageToRow().
 *
 * The SQL now returns `company_id` (from employee_document_profiles) so the
 * application layer can look up the correct wage for each employee row.
 */
function buildPayrollSql(
  range: PayrollDateRange,
  includeDraft: boolean,
  employeeCode?: string,
  companyId?: number | null,
  companyCodes?: string[]
) {
  const approvalFragment = includeDraft
    ? Prisma.empty
    : Prisma.sql`AND (
        a.approval_status = ${APPROVAL_STATUS.APPROVED}
        OR a.payroll_locked_at IS NOT NULL
      )`;

  const employeeFragment = employeeCode
    ? Prisma.sql`AND a.employee_code = ${employeeCode}`
    : Prisma.empty;

  const limitFragment = employeeCode ? Prisma.sql`LIMIT 1` : Prisma.empty;

  const companyFragment = companySqlFragment(companyId ?? null);
  const companyCodeFragment = companyCodes
    ? companyCodes.length > 0
      ? Prisma.sql`AND a.employee_code IN (${Prisma.join(companyCodes)})`
      : Prisma.sql`AND 1 = 0`
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      -- MAX() satisfies ONLY_FULL_GROUP_BY for all joined/non-GROUP-BY columns.
      -- MariaDB 11 has no ANY_VALUE(); MAX() returns a single deterministic value
      -- per group and works on the 1:1 joined rows here. Both m.emp_code
      -- (UNIQUE JOIN) and a.employee_code are wrapped — any column not directly
      -- listed as a GROUP BY key must be inside an aggregate.
       MAX(a.employee_code) AS employee_code,

      -- Name fallback chain (DB level):
      --   1. a.employee_name if not blank  (a.employee_name is a GROUP BY key — raw OK)
      --   2. Thai name from employee_document_profiles
      --   3. English name from employee_document_profiles
      --   4. Default profile name (first_name + last_name)
      --   5. emp_code / employee_code as last resort
      COALESCE(
        NULLIF(TRIM(a.employee_name), ''),
        NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_th), ''), ' ', COALESCE(MAX(e.last_name_th), ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_en), ''), ' ', COALESCE(MAX(e.last_name_en), ''))), ''),
        NULLIF(TRIM(CONCAT(MAX(e.first_name), ' ', MAX(e.last_name))), ''),
         MAX(a.employee_code)
      )                                      AS employee_name,

      a.branch_code                          AS branch_code,

      -- company_id is resolved via the profile join; used in JS to pick the
      -- correct wage config for this employee.
      MAX(e.company_id)                      AS company_id,

      SUM(a.is_present)                      AS work_days,
      SUM(COALESCE(a.ot1,  0))               AS total_ot1,
      SUM(COALESCE(a.ot15, 0))               AS total_ot15,
      SUM(COALESCE(a.ot2,  0))               AS total_ot2,
      SUM(COALESCE(a.ot_hours, 0))           AS total_ot_hours,

      -- deduction_amount from profile; income fields are computed in JS
      COALESCE(MAX(e.debt_amount), 0)        AS deduction_amount

    FROM attendance_records a
    INNER JOIN employee_document_profiles e ON a.employee_code = e.emp_code
    WHERE a.is_present = 1
      ${approvalFragment}
      AND a.work_date BETWEEN ${toDate(range.startDate)} AND ${toDate(range.endDate)}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
      AND a.employee_name <> ${TEST_EMPLOYEE_NAME}
      ${employeeFragment}
      ${companyFragment}
      ${companyCodeFragment}
    GROUP BY a.employee_code, a.employee_name, a.branch_code
    ORDER BY employee_code ASC
    ${limitFragment}
  `;
}

/**
 * Maps a payroll_snapshots DB row to the same shape as a live-calculated payroll row.
 * Snapshot rows already have pre-computed income fields (base_income, gross_income etc.)
 * captured at lock time with the per-company wage that was active then.
 */
export function deriveSnapshotOt1Income(snap: any) {
  return (
    Number(snap.gross_income ?? snap.grossIncome ?? 0) -
    Number(snap.base_income ?? snap.baseIncome ?? 0) -
    Number(snap.ot15_income ?? snap.ot15Income ?? 0) -
    Number(snap.ot2_income ?? snap.ot2Income ?? 0)
  );
}

function formatSnapshotAsPayrollRow(snap: any) {
  const empCode = snap.employee_code ?? snap.employeeCode ?? "";
  const rawName = snap.employee_name ?? snap.employeeName ?? "";
  const empName = String(rawName).trim() || String(empCode);

  return withDeductionBreakdown({
    employee_code: empCode,
    employee_name: empName,
    employeeName: empName,
    branch_code: snap.branch_code ?? snap.branchCode ?? null,
    work_days: Number(snap.work_days ?? snap.workDays ?? 0),
    total_ot1: Number(snap.total_ot1 ?? snap.totalOt1 ?? 0),
    total_ot15: Number(snap.total_ot15 ?? snap.totalOt15 ?? 0),
    total_ot2: Number(snap.total_ot2 ?? snap.totalOt2 ?? 0),
    total_ot_hours: Number(snap.total_ot_hours ?? snap.totalOtHours ?? 0),
    base_income: Number(snap.base_income ?? snap.baseIncome ?? 0),
    // The existing snapshot table has no ot1_income column. Derive the immutable
    // amount from its stored gross/base/OT1.5/OT2 totals without consulting a
    // current wage config that may have changed since the lock.
    ot1_income: deriveSnapshotOt1Income(snap),
    ot15_income: Number(snap.ot15_income ?? snap.ot15Income ?? 0),
    ot2_income: Number(snap.ot2_income ?? snap.ot2Income ?? 0),
    gross_income: Number(snap.gross_income ?? snap.grossIncome ?? 0),
    deduction_amount: Number(snap.deduction_amount ?? snap.deductionAmount ?? 0),
    documentFeeDeduction: Number(snap.deduction_amount ?? snap.deductionAmount ?? 0),
    daily_wage_used: Number(snap.daily_wage_used ?? snap.dailyWageUsed ?? 0),
    work_hours_used: Number(snap.work_hours_used ?? snap.workHoursUsed ?? 0),
    net_income: Number(snap.net_income ?? snap.netIncome ?? 0),
    _from_snapshot: true,
  });
}

/**
 * Applies the required company wage to a batch of raw SQL rows and returns
 * fully-enriched payroll rows ready for the API response or snapshot save.
 */
function enrichRows(
  rows: any[],
  wage: WageConfig
): ReturnType<typeof withDeductionBreakdown>[] {
  return rows.map((row) => {
    const safe = normalizeSqlRow(row);
    return withDeductionBreakdown(applyWageToRow(safe, wage));
  });
}

export const getPayrollSummary = async (
  range: PayrollDateRange,
  includeDraft = false,
  companyId?: number | null
) => {
  validateDateRange(range);
  if (companyId == null) {
    throw new Error("companyId is required for payroll calculation");
  }
  const wage = await getActiveWageConfig(companyId);

  const companyCodes = await getCompanyEmployeeCodes(companyId);
  if (companyCodes.length === 0) return [];

  // Serve from immutable snapshot if the period has been locked.
  if (!includeDraft) {
    const lockKey = `${range.startDate}_${range.endDate}`;

    // Apply company scope to snapshot lookup when user is company-scoped
    const snapshotWhere: any = { lock_key: lockKey };
    snapshotWhere.employee_code = { in: companyCodes };

    const snapshots = await prisma.payroll_snapshots.findMany({
      where: snapshotWhere,
      orderBy: { employee_code: "asc" },
    });

    if (snapshots.length > 0) {
      console.info(
        "[payroll] Serving %d rows from locked snapshot (lock_key=%s)",
        snapshots.length,
        lockKey
      );
      return snapshots.map(formatSnapshotAsPayrollRow);
    }
  }

  // Live calculation — resolve company_id per employee then apply company wage.
  const rows = await prisma.$queryRaw<any[]>(buildPayrollSql(range, includeDraft, undefined, companyId, companyCodes));

  if (process.env.NODE_ENV !== "production" && rows.length > 0) {
    const sample = rows[0];
    console.debug(
      "[payroll:debug] keys=%s | employee_code=%s | company_id=%s",
      Object.keys(sample).join(","),
      sample.employee_code ?? "(missing)",
      sample.company_id ?? "null"
    );
  }

  return enrichRows(rows, wage);
};

export const getPayrollByEmployeeCode = async (
  employeeCode: string,
  range: PayrollDateRange,
  includeDraft = false,
  companyId?: number | null
) => {
  validateDateRange(range);
  if (companyId == null) {
    throw new Error("companyId is required for payroll calculation");
  }
  const wage = await getActiveWageConfig(companyId);

  const companyCodes = await getCompanyEmployeeCodes(companyId);
  if (!companyCodes.includes(employeeCode)) return null;

  if (!includeDraft) {
    const lockKey = `${range.startDate}_${range.endDate}`;
    // For scoped users: verify the requested employee belongs to their company
    const snap = await prisma.payroll_snapshots.findFirst({
      where: { lock_key: lockKey, employee_code: employeeCode },
    });
    if (snap) {
      return formatSnapshotAsPayrollRow(snap);
    }
  }

  const rows = await prisma.$queryRaw<any[]>(
    buildPayrollSql(range, includeDraft, employeeCode, companyId, companyCodes)
  );

  if (rows.length === 0) return null;

  const safe = normalizeSqlRow(rows[0]);
  return withDeductionBreakdown(applyWageToRow(safe, wage));
};

/**
 * Exported helper used by the lock route to calculate payroll before saving snapshots.
 * Always uses live calculation (never returns snapshots) to capture the pre-lock state.
 *
 * Each returned row includes daily_wage_used / work_hours_used so the snapshot
 * records the exact per-company rate applied — not a single global rate.
 */
export const getPayrollSummaryLive = async (range: PayrollDateRange, companyId: number) => {
  validateDateRange(range);
  const wage = await getActiveWageConfig(companyId);
  const companyCodes = await getCompanyEmployeeCodes(companyId);
  if (companyCodes.length === 0) return [];
  const rows = await prisma.$queryRaw<any[]>(buildPayrollSql(range, false, undefined, companyId, companyCodes));
  return enrichRows(rows, wage);
};
