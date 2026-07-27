import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import type { AuthUser } from "../../middlewares/auth.middleware";
import { lockPayrollPeriod } from "../attendance/approval.service";
import { logRequiredAudit } from "../../services/audit.service";
import { getCompanyEmployeeCodes } from "../../services/company-scope.service";
import {
  getActiveWageConfig,
  type WageConfig,
} from "../../services/wage-config.service";
import {
  buildLegacyPayrollLockKey,
  buildPayrollLockKey,
  getPayrollSummaryLive,
  type PayrollDateRange,
} from "./payroll.service";
import {
  isUsableEmployeeName,
  normalizeEmployeeCode,
} from "../../utils/employee-profile";

export type PayrollLockInput = {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
};

export class PayrollLockError extends Error {
  constructor(
    public readonly code:
      | "COMPANY_SCOPE_MISMATCH"
      | "NO_ELIGIBLE_ATTENDANCE"
      | "PAYROLL_ALREADY_LOCKED"
      | "PAYROLL_EMPLOYEE_PROFILE_MISSING",
    message: string,
    public readonly status: 403 | 409 | 422,
    public readonly employeeCodes?: string[]
  ) {
    super(message);
    this.name = "PayrollLockError";
  }
}

export type PayrollLockTx = Pick<
  Prisma.TransactionClient,
  | "$queryRaw"
  | "attendance_records"
  | "employee_document_profiles"
  | "payroll_snapshots"
  | "payroll_audit_logs"
>;

type PayrollLockRow = Record<string, unknown> & {
  employee_code?: string | null;
  employeeCode?: string | null;
  employee_name?: string | null;
  employeeName?: string | null;
  branch_code?: string | null;
  branchCode?: string | null;
  work_days?: number;
  total_ot1?: number;
  total_ot15?: number;
  total_ot2?: number;
  total_ot_hours?: number;
  daily_wage_used?: number;
  work_hours_used?: number;
  base_income?: number;
  ot15_income?: number;
  ot2_income?: number;
  gross_income?: number;
  deduction_amount?: number;
  net_income?: number;
  employee_profile_status?: "FOUND" | "NOT_FOUND";
  employeeProfileStatus?: "FOUND" | "NOT_FOUND";
};

type TransactionRunner = {
  $transaction<T>(operation: (tx: PayrollLockTx) => Promise<T>): Promise<T>;
};

export type PayrollLockDependencies = {
  transactionRunner: TransactionRunner;
  getWage: (
    companyId: number,
    tx: PayrollLockTx
  ) => Promise<WageConfig>;
  getCodes: (companyId: number, tx: PayrollLockTx) => Promise<string[]>;
  calculate: (
    range: PayrollDateRange,
    companyId: number,
    tx: PayrollLockTx,
    wage: WageConfig
  ) => Promise<PayrollLockRow[]>;
  lockAttendance: (
    input: PayrollLockInput,
    companyId: number,
    tx: PayrollLockTx,
    companyCodes: string[]
  ) => Promise<{ locked: number }>;
  writeAudit: (
    input: {
      range: PayrollDateRange;
      sourceSheetId?: string;
      companyId: number;
      wage: WageConfig;
      locked: number;
      snapshotsSaved: number;
      lockKey: string;
    },
    user: AuthUser,
    tx: PayrollLockTx
  ) => Promise<void>;
};

const defaultDependencies: PayrollLockDependencies = {
  transactionRunner: prisma,
  getWage: (companyId, tx) => getActiveWageConfig(companyId, tx),
  getCodes: (companyId, tx) => getCompanyEmployeeCodes(companyId, tx),
  calculate: (range, companyId, tx, wage) =>
    getPayrollSummaryLive(range, companyId, tx, wage),
  lockAttendance: (input, companyId, tx, companyCodes) =>
    lockPayrollPeriod(input, companyId, tx, companyCodes),
  writeAudit: async (input, user, tx) => {
    await logRequiredAudit(
      "payroll.lock",
      "payroll_period",
      {
        startDate: input.range.startDate,
        endDate: input.range.endDate,
        sourceSheetId: input.sourceSheetId,
        companyId: input.companyId,
      },
      user,
      {
        locked_attendance: input.locked,
        snapshots_saved: input.snapshotsSaved,
        lock_key: input.lockKey,
        company_id: input.companyId,
        wage_config_id: input.wage.id.toString(),
        daily_wage_used: input.wage.daily_wage.toFixed(),
        work_hours_used: input.wage.work_hours_per_day.toFixed(),
        ot1_multiplier: input.wage.ot1_multiplier.toFixed(),
        ot15_multiplier: input.wage.ot15_multiplier.toFixed(),
        ot2_multiplier: input.wage.ot2_multiplier.toFixed(),
        ot3_multiplier: input.wage.ot3_multiplier.toFixed(),
        per_company_wages_applied: true,
      },
      tx
    );
  },
};

export function requirePayrollLockCompany(user: AuthUser | null): number {
  if (
    !user ||
    user.companyId == null ||
    !Number.isSafeInteger(user.companyId) ||
    user.companyId <= 0
  ) {
    throw new PayrollLockError(
      "COMPANY_SCOPE_MISMATCH",
      "A company assignment is required to lock payroll.",
      403
    );
  }
  return user.companyId;
}

function resolveRange(input: PayrollLockInput): PayrollDateRange {
  const startDate = input.date ?? input.startDate;
  const endDate = input.date ?? input.endDate ?? startDate;
  if (!startDate || !endDate) {
    throw new PayrollLockError(
      "NO_ELIGIBLE_ATTENDANCE",
      "date or startDate is required",
      422
    );
  }
  return { startDate, endDate };
}

function snapshotData(
  rows: PayrollLockRow[],
  input: PayrollLockInput,
  range: PayrollDateRange,
  lockKey: string,
  user: AuthUser
) {
  return rows.map((row) => ({
    lock_key: lockKey,
    period_start: new Date(`${range.startDate}T00:00:00.000Z`),
    period_end: new Date(`${range.endDate}T00:00:00.000Z`),
    source_sheet_id: input.sourceSheetId ?? null,
    employee_code: row.employee_code ?? row.employeeCode ?? "",
    employee_name:
      row.employee_name ??
      row.employeeName ??
      row.employee_code ??
      row.employeeCode ??
      "",
    branch_code: row.branch_code ?? row.branchCode ?? null,
    work_days: Number(row.work_days ?? 0),
    total_ot1: Number(row.total_ot1 ?? 0),
    total_ot15: Number(row.total_ot15 ?? 0),
    total_ot2: Number(row.total_ot2 ?? 0),
    total_ot_hours: Number(row.total_ot_hours ?? 0),
    daily_wage_used: Number(row.daily_wage_used),
    work_hours_used: Number(row.work_hours_used),
    base_income: Number(row.base_income ?? 0),
    ot15_income: Number(row.ot15_income ?? 0),
    ot2_income: Number(row.ot2_income ?? 0),
    gross_income: Number(row.gross_income ?? 0),
    deduction_amount: Number(row.deduction_amount ?? 0),
    net_income: Number(row.net_income ?? 0),
    locked_by_user_id: user.id ? Number(user.id) : null,
    locked_by_username: user.username ?? null,
  }));
}

export async function executePayrollLock(
  input: PayrollLockInput,
  user: AuthUser,
  dependencies: PayrollLockDependencies = defaultDependencies
) {
  const companyId = requirePayrollLockCompany(user);
  const range = resolveRange(input);
  const lockKey = buildPayrollLockKey(companyId, range);

  return dependencies.transactionRunner.$transaction(async (tx) => {
    const wage = await dependencies.getWage(companyId, tx);
    const companyCodes = await dependencies.getCodes(companyId, tx);
    if (companyCodes.length === 0) {
      throw new PayrollLockError(
        "NO_ELIGIBLE_ATTENDANCE",
        "No eligible employees or approved attendance found in this company scope.",
        422
      );
    }

    const duplicate = await tx.payroll_snapshots.findFirst({
      where: {
        lock_key: {
          in: [lockKey, buildLegacyPayrollLockKey(range)],
        },
        employee_code: { in: companyCodes },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new PayrollLockError(
        "PAYROLL_ALREADY_LOCKED",
        "Payroll is already locked for this company and period.",
        409
      );
    }

    const rows = await dependencies.calculate(range, companyId, tx, wage);
    if (rows.length === 0) {
      throw new PayrollLockError(
        "NO_ELIGIBLE_ATTENDANCE",
        "No eligible employees or approved attendance found in this company scope.",
        422
      );
    }
    const missingProfileCodes = [
      ...new Set(
        rows
          .filter(
            (row) =>
              (row.employee_profile_status ?? row.employeeProfileStatus) !==
                "FOUND" || !isUsableEmployeeName(row.employee_name ?? row.employeeName)
          )
          .map((row) =>
            normalizeEmployeeCode(row.employee_code ?? row.employeeCode)
          )
          .filter(Boolean)
      ),
    ];
    if (missingProfileCodes.length > 0) {
      throw new PayrollLockError(
        "PAYROLL_EMPLOYEE_PROFILE_MISSING",
        "Payroll contains attendance records without a complete employee profile.",
        422,
        missingProfileCodes
      );
    }

    const lockResult = await dependencies.lockAttendance(
      input,
      companyId,
      tx,
      companyCodes
    );
    if (lockResult.locked === 0) {
      throw new PayrollLockError(
        "PAYROLL_ALREADY_LOCKED",
        "Payroll attendance was already locked or is no longer eligible.",
        409
      );
    }

    const created = await tx.payroll_snapshots.createMany({
      data: snapshotData(rows, input, range, lockKey, user),
    });
    await dependencies.writeAudit(
      {
        range,
        sourceSheetId: input.sourceSheetId,
        companyId,
        wage,
        locked: lockResult.locked,
        snapshotsSaved: created.count,
        lockKey,
      },
      user,
      tx
    );

    return {
      success: true,
      locked: lockResult.locked,
      snapshots_saved: created.count,
    };
  });
}
