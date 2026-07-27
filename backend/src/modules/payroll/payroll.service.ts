import { Prisma, type payroll_run_items } from "@prisma/client";
import { prisma } from "../../db";
import {
  APPROVAL_STATUS,
  FIELD_APP_SHEET_ID,
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
} from "../../constants/attendance";
import { getActiveWageConfig, type WageConfig } from "../../services/wage-config.service";
import { companySqlFragment, getCompanyEmployeeCodes } from "../../services/company-scope.service";
import {
  isUsableEmployeeName,
  normalizeEmployeeCode,
} from "../../utils/employee-profile";
import { withPayrollRunSchemaFallback } from "../payroll-runs/payroll-run-schema";

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

export class PayrollDataIntegrityError extends Error {
  readonly code = "PAYROLL_EMPLOYEE_PROFILE_DUPLICATE";
  readonly status = 409;

  constructor(public readonly employeeCodes: string[]) {
    super("Duplicate employee profiles exist in this company scope.");
    this.name = "PayrollDataIntegrityError";
  }
}

type PayrollLiveClient = Pick<
  Prisma.TransactionClient,
  "$queryRaw" | "employee_document_profiles"
>;

export function buildPayrollLockKey(
  companyId: number,
  range: PayrollDateRange
) {
  return `${companyId}_${range.startDate}_${range.endDate}`;
}

export function buildLegacyPayrollLockKey(range: PayrollDateRange) {
  return `${range.startDate}_${range.endDate}`;
}

function validateDateRange(range: PayrollDateRange) {
  if (!DATE_PATTERN.test(range.startDate) || !DATE_PATTERN.test(range.endDate)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function assertUniqueCompanyPayrollProfiles(
  companyId: number,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma
) {
  const duplicates = await db.$queryRaw<Array<{ employee_code: string }>>(
    Prisma.sql`
      SELECT UPPER(TRIM(emp_code)) AS employee_code
      FROM employee_document_profiles
      WHERE company_id = ${companyId}
        AND emp_code IS NOT NULL
        AND TRIM(emp_code) <> ''
      GROUP BY UPPER(TRIM(emp_code))
      HAVING COUNT(*) > 1
    `
  );
  if (duplicates.length > 0) {
    throw new PayrollDataIntegrityError(
      duplicates.map((row) => normalizeEmployeeCode(row.employee_code))
    );
  }
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
  const rawName = row.employee_name ?? row.employeeName;
  const rawCode = row.employee_code ?? row.employeeCode;
  const explicitStatus =
    row.employee_profile_status ?? row.employeeProfileStatus;
  const profileFound =
    explicitStatus !== "NOT_FOUND" && isUsableEmployeeName(rawName);
  const resolvedName = profileFound ? String(rawName).trim() : null;

  const enriched = {
    ...row,
    employee_code: normalizeEmployeeCode(rawCode),
    employee_name: resolvedName,
    employeeName: resolvedName,
    employee_profile_status: profileFound
      ? ("FOUND" as const)
      : ("NOT_FOUND" as const),
    employeeProfileStatus: profileFound
      ? ("FOUND" as const)
      : ("NOT_FOUND" as const),
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
export function buildPayrollSql(
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
    ? Prisma.sql`AND UPPER(TRIM(a.employee_code)) = ${normalizeEmployeeCode(employeeCode)}`
    : Prisma.empty;

  const limitFragment = employeeCode ? Prisma.sql`LIMIT 1` : Prisma.empty;

  const companyFragment = companySqlFragment(companyId ?? null);
  const profileCompanyJoinFragment =
    companyId != null
      ? Prisma.sql`AND e.company_id = ${companyId}`
      : Prisma.empty;
  const companyCodeFragment = companyCodes
    ? companyCodes.length > 0
      ? Prisma.sql`AND UPPER(TRIM(a.employee_code)) IN (${Prisma.join(
          companyCodes.map(normalizeEmployeeCode)
        )})`
      : Prisma.sql`AND 1 = 0`
    : Prisma.empty;

  return Prisma.sql`
    SELECT
      -- MAX() satisfies ONLY_FULL_GROUP_BY for all joined/non-GROUP-BY columns.
      -- MariaDB 11 has no ANY_VALUE(); MAX() returns a single deterministic value
      -- per group and works on the 1:1 joined rows here. Both m.emp_code
      -- (UNIQUE JOIN) and a.employee_code are wrapped — any column not directly
      -- listed as a GROUP BY key must be inside an aggregate.
       UPPER(TRIM(MAX(a.employee_code))) AS employee_code,
       MAX(e.id)                         AS employee_profile_id,

      -- Profile names are authoritative. Attendance name is only a compatibility
      -- fallback, and literal UNKNOWN is treated as missing.
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_th), ''), ' ', COALESCE(MAX(e.last_name_th), ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_en), ''), ' ', COALESCE(MAX(e.last_name_en), ''))), ''),
        NULLIF(TRIM(CONCAT(MAX(e.first_name), ' ', MAX(e.last_name))), ''),
        NULLIF(
          CASE
            WHEN UPPER(TRIM(MAX(a.employee_name))) = 'UNKNOWN' THEN ''
            ELSE TRIM(MAX(a.employee_name))
          END,
          ''
        )
      )                                      AS employee_name,

      CASE
        WHEN COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_th), ''), ' ', COALESCE(MAX(e.last_name_th), ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(MAX(e.first_name_en), ''), ' ', COALESCE(MAX(e.last_name_en), ''))), ''),
          NULLIF(TRIM(CONCAT(MAX(e.first_name), ' ', MAX(e.last_name))), '')
        ) IS NULL THEN 'NOT_FOUND'
        ELSE 'FOUND'
      END                                    AS employee_profile_status,

      MAX(a.branch_code)                     AS branch_code,

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

    FROM (
      SELECT ranked.*
      FROM (
        SELECT
          source_rows.*,
          ROW_NUMBER() OVER (
            PARTITION BY UPPER(TRIM(source_rows.employee_code)), source_rows.work_date
            ORDER BY
              CASE
                WHEN source_rows.payroll_locked_at IS NOT NULL THEN 0
                WHEN LOWER(TRIM(source_rows.approval_status)) = ${APPROVAL_STATUS.APPROVED} THEN 1
                WHEN LOWER(TRIM(source_rows.approval_status)) = ${APPROVAL_STATUS.SUBMITTED} THEN 2
                WHEN LOWER(TRIM(source_rows.approval_status)) = ${APPROVAL_STATUS.DRAFT} THEN 3
                ELSE 4
              END,
              CASE WHEN source_rows.source_sheet_id = ${FIELD_APP_SHEET_ID} THEN 0 ELSE 1 END,
              source_rows.updated_at DESC,
              source_rows.id DESC
          ) AS canonical_rank
        FROM attendance_records source_rows
      ) ranked
      WHERE ranked.canonical_rank = 1
    ) a
    INNER JOIN employee_document_profiles e
      ON UPPER(TRIM(a.employee_code)) = UPPER(TRIM(e.emp_code))
      ${profileCompanyJoinFragment}
    WHERE a.is_present = 1
      ${approvalFragment}
      AND a.work_date BETWEEN ${toDate(range.startDate)} AND ${toDate(range.endDate)}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
      AND a.employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
      AND a.employee_name <> ${TEST_EMPLOYEE_NAME}
      ${employeeFragment}
      ${companyFragment}
      ${companyCodeFragment}
    GROUP BY e.company_id, e.id, UPPER(TRIM(a.employee_code))
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
  const empName = isUsableEmployeeName(rawName)
    ? String(rawName).trim()
    : null;

  return withDeductionBreakdown({
    employee_code: empCode,
    employee_name: empName,
    employeeName: empName,
    employee_profile_status: empName ? "FOUND" : "NOT_FOUND",
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

function formatRunItemAsPayrollRow(item: payroll_run_items) {
  const wage = item.wage_config_snapshot as Record<string, unknown>;
  const hourlyRate = new Prisma.Decimal(String(wage.dailyWage ?? 0)).div(
    String(wage.workHoursPerDay ?? 1)
  );
  const ot1Income = new Prisma.Decimal(item.ot1_hours)
    .mul(hourlyRate)
    .mul(String(wage.ot1Multiplier ?? 1));
  const ot15Income = new Prisma.Decimal(item.ot15_hours)
    .mul(hourlyRate)
    .mul(String(wage.ot15Multiplier ?? 1.5));
  const ot2Income = new Prisma.Decimal(item.ot2_hours)
    .mul(hourlyRate)
    .mul(String(wage.ot2Multiplier ?? 2));
  return withDeductionBreakdown({
    employee_code: item.employee_code_snapshot,
    employee_name: item.employee_name_snapshot,
    employeeName: item.employee_name_snapshot,
    employee_profile_id: item.employee_profile_id,
    employee_profile_status: "FOUND",
    branch_code: item.branch_code_snapshot,
    work_days: item.work_days,
    total_ot1: item.ot1_hours,
    total_ot15: item.ot15_hours,
    total_ot2: item.ot2_hours,
    total_ot_hours: new Prisma.Decimal(item.ot1_hours)
      .plus(item.ot15_hours)
      .plus(item.ot2_hours)
      .toNumber(),
    base_income: item.base_income,
    ot1_income: ot1Income,
    ot15_income: ot15Income,
    ot2_income: ot2Income,
    gross_income: item.gross_income,
    deduction_amount: item.total_deductions,
    documentFeeDeduction: item.total_deductions,
    net_income: item.net_income,
    _from_snapshot: true,
    _payroll_run_id: item.payroll_run_id.toString(),
  });
}

async function getLockedRunItems(
  companyId: number,
  range: PayrollDateRange,
  employeeCode?: string
) {
  return withPayrollRunSchemaFallback(
    async () => {
      const run = await prisma.payroll_runs.findFirst({
        where: {
          company_id: companyId,
          period_start: toDate(range.startDate),
          period_end: toDate(range.endDate),
          status: { in: ["LOCKED", "PAID"] },
        },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (!run) return [];
      return prisma.payroll_run_items.findMany({
        where: {
          payroll_run_id: run.id,
          company_id: companyId,
          ...(employeeCode
            ? { employee_code_snapshot: normalizeEmployeeCode(employeeCode) }
            : {}),
        },
        orderBy: { employee_code_snapshot: "asc" },
      });
    },
    () => []
  );
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

  const companyCodes = await getCompanyEmployeeCodes(companyId);
  if (companyCodes.length === 0) return [];

  // Serve from immutable snapshot if the period has been locked.
  if (!includeDraft) {
    const runItems = await getLockedRunItems(companyId, range);
    if (runItems.length > 0) {
      return runItems.map(formatRunItemAsPayrollRow);
    }
    const lockKeys = [
      buildPayrollLockKey(companyId, range),
      buildLegacyPayrollLockKey(range),
    ];

    // Apply company scope to snapshot lookup when user is company-scoped
    const snapshotWhere: any = { lock_key: { in: lockKeys } };
    snapshotWhere.employee_code = { in: companyCodes };

    const snapshots = await prisma.payroll_snapshots.findMany({
      where: snapshotWhere,
      orderBy: { employee_code: "asc" },
    });

    if (snapshots.length > 0) {
      console.info(
        "[payroll] Serving %d rows from locked snapshot (lock_key=%s)",
        snapshots.length,
        lockKeys[0]
      );
      return snapshots.map(formatSnapshotAsPayrollRow);
    }
  }

  // Live calculation — resolve company_id per employee then apply company wage.
  const wage = await getActiveWageConfig(companyId);
  await assertUniqueCompanyPayrollProfiles(companyId);
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

  const companyCodes = await getCompanyEmployeeCodes(companyId);
  if (!companyCodes.includes(employeeCode)) return null;

  if (!includeDraft) {
    const runItems = await getLockedRunItems(companyId, range, employeeCode);
    if (runItems.length > 0) {
      return formatRunItemAsPayrollRow(runItems[0]);
    }
    const lockKeys = [
      buildPayrollLockKey(companyId, range),
      buildLegacyPayrollLockKey(range),
    ];
    // For scoped users: verify the requested employee belongs to their company
    const snap = await prisma.payroll_snapshots.findFirst({
      where: {
        lock_key: { in: lockKeys },
        employee_code: employeeCode,
      },
    });
    if (snap) {
      return formatSnapshotAsPayrollRow(snap);
    }
  }

  const wage = await getActiveWageConfig(companyId);
  await assertUniqueCompanyPayrollProfiles(companyId);
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
export const getPayrollSummaryLive = async (
  range: PayrollDateRange,
  companyId: number,
  db: PayrollLiveClient = prisma,
  configuredWage?: WageConfig
) => {
  validateDateRange(range);
  await assertUniqueCompanyPayrollProfiles(companyId, db);
  const wage = configuredWage ?? (await getActiveWageConfig(companyId, db));
  const companyCodes = await getCompanyEmployeeCodes(companyId, db);
  if (companyCodes.length === 0) return [];
  const rows = await db.$queryRaw<any[]>(
    buildPayrollSql(range, false, undefined, companyId, companyCodes)
  );
  return enrichRows(rows, wage);
};
