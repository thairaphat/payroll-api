import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import type { AuthUser } from "../../middlewares/auth.middleware";
import { logRequiredAudit } from "../../services/audit.service";
import { getCompanyEmployeeCodes } from "../../services/company-scope.service";
import { getActiveWageConfig } from "../../services/wage-config.service";
import { getPayrollSummaryLive } from "../payroll/payroll.service";

export const PAYROLL_RUN_STATUS = {
  DRAFT: "DRAFT",
  CALCULATED: "CALCULATED",
  REVIEWED: "REVIEWED",
  APPROVED: "APPROVED",
  LOCKED: "LOCKED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type PayrollRunStatus =
  (typeof PAYROLL_RUN_STATUS)[keyof typeof PAYROLL_RUN_STATUS];

export class PayrollRunError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 422
  ) {
    super(message);
    this.name = "PayrollRunError";
  }
}

type RunTx = Prisma.TransactionClient;
type RunInput = {
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  idempotencyKey?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const decimal = (value: unknown) => new Prisma.Decimal(String(value ?? 0));
const actorId = (user: AuthUser) => Number(user.id);
const runIdValue = (value: string | number | bigint) => {
  try {
    const id = BigInt(value);
    if (id <= 0n) throw new Error();
    return id;
  } catch {
    throw new PayrollRunError("PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.", 404);
  }
};

export function validateRunPeriod(input: RunInput) {
  for (const value of [input.periodStart, input.periodEnd, input.paymentDate]) {
    if (!DATE_PATTERN.test(value) || Number.isNaN(date(value).getTime())) {
      throw new PayrollRunError(
        "PAYROLL_RUN_INVALID_PERIOD",
        "Payroll run dates must use YYYY-MM-DD.",
        422
      );
    }
  }
  if (input.periodStart > input.periodEnd) {
    throw new PayrollRunError(
      "PAYROLL_RUN_INVALID_PERIOD",
      "periodStart must not be after periodEnd.",
      422
    );
  }
}

export function activePeriodKey(companyId: number, start: string, end: string) {
  return `${companyId}:${start}:${end}`;
}

function publicRun<T extends Record<string, unknown>>(run: T) {
  return Object.fromEntries(
    Object.entries(run).map(([key, value]) => [
      key,
      typeof value === "bigint"
        ? value.toString()
        : value instanceof Prisma.Decimal
          ? value.toFixed(2)
          : value,
    ])
  );
}

async function scopedRun(
  db: RunTx | typeof prisma,
  runId: string | number | bigint,
  companyId: number
) {
  const run = await db.payroll_runs.findFirst({
    where: { id: runIdValue(runId), company_id: companyId },
  });
  if (!run) {
    throw new PayrollRunError("PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.", 404);
  }
  return run;
}

async function lockRunRow(tx: RunTx, runId: string, companyId: number) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM payroll_runs
      WHERE id = ${runIdValue(runId)} AND company_id = ${companyId}
      FOR UPDATE`
  );
}

async function audit(
  action: Parameters<typeof logRequiredAudit>[0],
  runId: bigint,
  companyId: number,
  user: AuthUser,
  db: RunTx,
  metadata?: Record<string, unknown>
) {
  await logRequiredAudit(
    action,
    "payroll_run",
    { companyId },
    user,
    { payroll_run_id: runId.toString(), ...metadata },
    db
  );
}

export async function listPayrollRuns(companyId: number, year?: number) {
  const rows = await prisma.payroll_runs.findMany({
    where: {
      company_id: companyId,
      ...(year
        ? {
            period_start: {
              gte: new Date(`${year}-01-01T00:00:00.000Z`),
              lte: new Date(`${year}-12-31T00:00:00.000Z`),
            },
          }
        : {}),
    },
    orderBy: [{ period_start: "desc" }, { id: "desc" }],
  });
  return rows.map(publicRun);
}

export async function getPayrollRun(runId: string, companyId: number) {
  return publicRun(await scopedRun(prisma, runId, companyId));
}

export async function getPayrollRunItems(runId: string, companyId: number) {
  const run = await scopedRun(prisma, runId, companyId);
  const rows = await prisma.payroll_run_items.findMany({
    where: { payroll_run_id: run.id, company_id: companyId },
    orderBy: { employee_code_snapshot: "asc" },
  });
  return rows.map(publicRun);
}

export async function createPayrollRun(
  companyId: number,
  input: RunInput,
  user: AuthUser
) {
  validateRunPeriod(input);
  const periodKey = activePeriodKey(companyId, input.periodStart, input.periodEnd);
  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    crypto.randomUUID();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`
    );
    const existingByRequest = await tx.payroll_runs.findUnique({
      where: { idempotency_key: idempotencyKey },
    });
    if (existingByRequest) {
      const matchesRequest =
        existingByRequest.company_id === companyId &&
        existingByRequest.period_start.getTime() === date(input.periodStart).getTime() &&
        existingByRequest.period_end.getTime() === date(input.periodEnd).getTime() &&
        existingByRequest.payment_date.getTime() === date(input.paymentDate).getTime();
      if (matchesRequest) return publicRun(existingByRequest);
      throw new PayrollRunError(
        "PAYROLL_RUN_ALREADY_EXISTS",
        "The idempotency key is already assigned to another payroll run request.",
        409
      );
    }

    const overlapping = await tx.payroll_runs.findFirst({
      where: {
        company_id: companyId,
        status: { not: PAYROLL_RUN_STATUS.CANCELLED },
        period_start: { lte: date(input.periodEnd) },
        period_end: { gte: date(input.periodStart) },
      },
    });
    if (overlapping) {
      throw new PayrollRunError(
        "PAYROLL_RUN_ALREADY_EXISTS",
        "An active payroll run already overlaps this period.",
        409
      );
    }
    const companyCodes = await getCompanyEmployeeCodes(companyId, tx);
    const attendanceCount =
      companyCodes.length === 0
        ? 0
        : await tx.attendance_records.count({
            where: {
              employee_code: { in: companyCodes },
              work_date: {
                gte: date(input.periodStart),
                lte: date(input.periodEnd),
              },
            },
          });
    if (attendanceCount === 0) {
      throw new PayrollRunError(
        "PAYROLL_RUN_EMPLOYEE_ERROR",
        "No attendance is available for this payroll run period.",
        422
      );
    }

    const created = await tx.payroll_runs.create({
      data: {
        company_id: companyId,
        period_start: date(input.periodStart),
        period_end: date(input.periodEnd),
        payment_date: date(input.paymentDate),
        active_period_key: periodKey,
        idempotency_key: idempotencyKey,
        created_by: actorId(user),
      },
    });
    await audit("payroll_run.created", created.id, companyId, user, tx);
    return publicRun(created);
  });
}

function itemData(
  row: Record<string, unknown>,
  runId: bigint,
  companyId: number,
  wage: Awaited<ReturnType<typeof getActiveWageConfig>>
): Prisma.payroll_run_itemsCreateManyInput {
  const profileId = Number(row.employee_profile_id);
  const name = String(row.employee_name ?? "").trim();
  if (!Number.isSafeInteger(profileId) || profileId <= 0 || !name) {
    throw new PayrollRunError(
      "PAYROLL_RUN_EMPLOYEE_ERROR",
      "Every payroll item requires one company employee profile.",
      422
    );
  }
  const workDays = decimal(row.work_days);
  const hourlyRate = wage.daily_wage.div(wage.work_hours_per_day);
  const base = workDays.mul(wage.daily_wage);
  const ot = decimal(row.total_ot1)
    .mul(hourlyRate)
    .mul(wage.ot1_multiplier)
    .plus(
      decimal(row.total_ot15)
        .mul(hourlyRate)
        .mul(wage.ot15_multiplier)
    )
    .plus(
      decimal(row.total_ot2)
        .mul(hourlyRate)
        .mul(wage.ot2_multiplier)
    );
  const other = new Prisma.Decimal(0);
  const gross = base.plus(ot).plus(other);
  const deductions = decimal(row.deduction_amount);
  const net = gross.minus(deductions);
  if (net.isNegative()) {
    throw new PayrollRunError(
      "PAYROLL_RUN_EMPLOYEE_ERROR",
      "A payroll item has negative net income.",
      422
    );
  }
  return {
    payroll_run_id: runId,
    company_id: companyId,
    employee_profile_id: profileId,
    employee_code_snapshot: String(row.employee_code ?? ""),
    employee_name_snapshot: name,
    branch_code_snapshot: row.branch_code ? String(row.branch_code) : null,
    bank_account_snapshot: Prisma.JsonNull,
    wage_config_snapshot: {
      id: wage.id.toString(),
      dailyWage: wage.daily_wage.toFixed(),
      workHoursPerDay: wage.work_hours_per_day.toFixed(),
      ot1Multiplier: wage.ot1_multiplier.toFixed(),
      ot15Multiplier: wage.ot15_multiplier.toFixed(),
      ot2Multiplier: wage.ot2_multiplier.toFixed(),
    },
    calculation_input_snapshot: {
      workDays: decimal(row.work_days).toFixed(),
      ot1Hours: decimal(row.total_ot1).toFixed(),
      ot15Hours: decimal(row.total_ot15).toFixed(),
      ot2Hours: decimal(row.total_ot2).toFixed(),
    },
    calculation_result_snapshot: {
      baseIncome: base.toFixed(),
      overtimeIncome: ot.toFixed(),
      grossIncome: gross.toFixed(),
      totalDeductions: deductions.toFixed(),
      netIncome: net.toFixed(),
    },
    warnings: Prisma.JsonNull,
    work_days: workDays,
    ot1_hours: decimal(row.total_ot1),
    ot15_hours: decimal(row.total_ot15),
    ot2_hours: decimal(row.total_ot2),
    base_income: base,
    overtime_income: ot,
    other_income: other,
    gross_income: gross,
    total_deductions: deductions,
    net_income: net,
  };
}

export async function calculatePayrollRun(
  runId: string,
  companyId: number,
  user: AuthUser
) {
  return prisma.$transaction(async (tx) => {
    await lockRunRow(tx, runId, companyId);
    const run = await scopedRun(tx, runId, companyId);
    if (
      run.status !== PAYROLL_RUN_STATUS.DRAFT &&
      run.status !== PAYROLL_RUN_STATUS.CALCULATED
    ) {
      throw new PayrollRunError(
        "PAYROLL_RUN_INVALID_STATUS",
        "Only a draft or calculated payroll run can be calculated.",
        409
      );
    }
    const wage = await getActiveWageConfig(companyId, tx);
    const rows = await getPayrollSummaryLive(
      {
        startDate: run.period_start.toISOString().slice(0, 10),
        endDate: run.period_end.toISOString().slice(0, 10),
      },
      companyId,
      tx,
      wage
    );
    if (rows.length === 0) {
      throw new PayrollRunError(
        "PAYROLL_RUN_EMPLOYEE_ERROR",
        "No approved attendance is available for this payroll run.",
        422
      );
    }
    const items = rows.map((row) => itemData(row, run.id, companyId, wage));
    if (new Set(items.map((item) => item.employee_profile_id)).size !== items.length) {
      throw new PayrollRunError(
        "PAYROLL_RUN_DUPLICATE_EMPLOYEE",
        "A duplicate employee exists in the payroll calculation.",
        409
      );
    }
    await tx.payroll_run_items.deleteMany({ where: { payroll_run_id: run.id } });
    await tx.payroll_run_items.createMany({ data: items });
    const sum = (field: keyof Prisma.payroll_run_itemsCreateManyInput) =>
      items.reduce(
        (total, item) => total.plus(decimal(item[field])),
        new Prisma.Decimal(0)
      );
    const updated = await tx.payroll_runs.update({
      where: { id: run.id },
      data: {
        status: PAYROLL_RUN_STATUS.CALCULATED,
        employee_count: items.length,
        base_income_total: sum("base_income"),
        overtime_income_total: sum("overtime_income"),
        other_income_total: sum("other_income"),
        gross_income_total: sum("gross_income"),
        deduction_total: sum("total_deductions"),
        net_income_total: sum("net_income"),
        calculated_at: new Date(),
        reviewed_by: null,
        reviewed_at: null,
        approved_by: null,
        approved_at: null,
        row_version: { increment: 1 },
      },
    });
    await audit("payroll_run.calculated", run.id, companyId, user, tx, {
      employee_count: items.length,
    });
    return publicRun(updated);
  });
}

const transitionRules: Record<string, PayrollRunStatus[]> = {
  review: [PAYROLL_RUN_STATUS.CALCULATED],
  approve: [PAYROLL_RUN_STATUS.REVIEWED],
  return: [PAYROLL_RUN_STATUS.REVIEWED, PAYROLL_RUN_STATUS.APPROVED],
};

export async function transitionPayrollRun(
  runId: string,
  companyId: number,
  action: "review" | "approve" | "return",
  user: AuthUser
) {
  return prisma.$transaction(async (tx) => {
    await lockRunRow(tx, runId, companyId);
    const run = await scopedRun(tx, runId, companyId);
    if (!transitionRules[action].includes(run.status as PayrollRunStatus)) {
      throw new PayrollRunError(
        "PAYROLL_RUN_INVALID_STATUS",
        `Payroll run cannot ${action} from ${run.status}.`,
        409
      );
    }
    const now = new Date();
    const data =
      action === "review"
        ? { status: PAYROLL_RUN_STATUS.REVIEWED, reviewed_by: actorId(user), reviewed_at: now }
        : action === "approve"
          ? { status: PAYROLL_RUN_STATUS.APPROVED, approved_by: actorId(user), approved_at: now }
          : {
              status: PAYROLL_RUN_STATUS.CALCULATED,
              reviewed_by: null,
              reviewed_at: null,
              approved_by: null,
              approved_at: null,
            };
    const updated = await tx.payroll_runs.update({
      where: { id: run.id },
      data: { ...data, row_version: { increment: 1 } },
    });
    await audit(`payroll_run.${action}` as never, run.id, companyId, user, tx);
    return publicRun(updated);
  });
}

async function canonicalAttendance(tx: RunTx, run: { id: bigint; period_start: Date; period_end: Date }, companyId: number) {
  const codes = await getCompanyEmployeeCodes(companyId, tx);
  if (codes.length === 0) return [];
  return tx.$queryRaw<Array<{ id: number; employee_profile_id: number }>>(Prisma.sql`
    SELECT ranked.id, ranked.employee_profile_id
    FROM (
      SELECT a.id, e.id AS employee_profile_id,
        ROW_NUMBER() OVER (
          PARTITION BY e.id, a.work_date
          ORDER BY a.updated_at DESC, a.id DESC
        ) canonical_rank
      FROM attendance_records a
      INNER JOIN employee_document_profiles e
        ON UPPER(TRIM(a.employee_code)) = UPPER(TRIM(e.emp_code))
       AND e.company_id = ${companyId}
      WHERE a.work_date BETWEEN ${run.period_start} AND ${run.period_end}
        AND a.approval_status = 'approved'
        AND a.payroll_locked_at IS NULL
        AND UPPER(TRIM(a.employee_code)) IN (${Prisma.join(codes.map((code) => code.trim().toUpperCase()))})
    ) ranked
    WHERE ranked.canonical_rank = 1
  `);
}

export async function lockPayrollRun(
  runId: string,
  companyId: number,
  idempotencyKey: string,
  user: AuthUser
) {
  if (!idempotencyKey.trim()) {
    throw new PayrollRunError("PAYROLL_RUN_INVALID_STATUS", "Idempotency key is required.", 422);
  }
  return prisma.$transaction(async (tx) => {
    await lockRunRow(tx, runId, companyId);
    const run = await scopedRun(tx, runId, companyId);
    if (run.status === PAYROLL_RUN_STATUS.LOCKED && run.lock_key === idempotencyKey) {
      return publicRun(run);
    }
    if (run.status !== PAYROLL_RUN_STATUS.APPROVED) {
      throw new PayrollRunError("PAYROLL_RUN_NOT_APPROVED", "Payroll run must be approved before lock.", 409);
    }
    if (await tx.payroll_run_items.count({ where: { payroll_run_id: run.id } }) === 0) {
      throw new PayrollRunError("PAYROLL_RUN_NOT_CALCULATED", "Payroll run has no calculated items.", 409);
    }
    const wage = await getActiveWageConfig(companyId, tx);
    const currentRows = await getPayrollSummaryLive(
      {
        startDate: run.period_start.toISOString().slice(0, 10),
        endDate: run.period_end.toISOString().slice(0, 10),
      },
      companyId,
      tx,
      wage
    );
    const currentItems = currentRows.map((row) =>
      itemData(row, run.id, companyId, wage)
    );
    const approvedItems = await tx.payroll_run_items.findMany({
      where: { payroll_run_id: run.id, company_id: companyId },
      orderBy: { employee_profile_id: "asc" },
    });
    currentItems.sort(
      (left, right) => left.employee_profile_id - right.employee_profile_id
    );
    const calculationChanged =
      currentItems.length !== approvedItems.length ||
      currentItems.some((item, index) => {
        const approved = approvedItems[index];
        return (
          item.employee_profile_id !== approved?.employee_profile_id ||
          !decimal(item.base_income).equals(approved.base_income) ||
          !decimal(item.overtime_income).equals(approved.overtime_income) ||
          !decimal(item.gross_income).equals(approved.gross_income) ||
          !decimal(item.total_deductions).equals(approved.total_deductions) ||
          !decimal(item.net_income).equals(approved.net_income)
        );
      });
    if (calculationChanged) {
      throw new PayrollRunError(
        "PAYROLL_RUN_NOT_CALCULATED",
        "Payroll inputs changed after approval; recalculate and approve again.",
        409
      );
    }
    const attendance = await canonicalAttendance(tx, run, companyId);
    if (attendance.length === 0) {
      throw new PayrollRunError("PAYROLL_RUN_EMPLOYEE_ERROR", "No approved attendance is available to lock.", 422);
    }
    const updatedAttendance = await tx.attendance_records.updateMany({
      where: { id: { in: attendance.map((row) => row.id) }, payroll_locked_at: null },
      data: { payroll_locked_at: new Date() },
    });
    if (updatedAttendance.count !== attendance.length) {
      throw new PayrollRunError("PAYROLL_RUN_ALREADY_LOCKED", "Attendance changed while locking payroll.", 409);
    }
    await tx.payroll_run_attendance_links.createMany({
      data: attendance.map((row) => ({
        payroll_run_id: run.id,
        company_id: companyId,
        employee_profile_id: row.employee_profile_id,
        attendance_record_id: row.id,
        active_attendance_key: String(row.id),
      })),
    });
    const updated = await tx.payroll_runs.update({
      where: { id: run.id },
      data: {
        status: PAYROLL_RUN_STATUS.LOCKED,
        lock_key: idempotencyKey,
        locked_by: actorId(user),
        locked_at: new Date(),
        row_version: { increment: 1 },
      },
    });
    await audit("payroll_run.locked", run.id, companyId, user, tx, {
      attendance_count: attendance.length,
    });
    return publicRun(updated);
  });
}

export async function markPayrollRunPaid(
  runId: string,
  companyId: number,
  input: { paymentReference?: string; bankBatchReference?: string },
  user: AuthUser
) {
  return prisma.$transaction(async (tx) => {
    await lockRunRow(tx, runId, companyId);
    const run = await scopedRun(tx, runId, companyId);
    if (run.status === PAYROLL_RUN_STATUS.PAID) return publicRun(run);
    if (run.status !== PAYROLL_RUN_STATUS.LOCKED) {
      throw new PayrollRunError("PAYROLL_RUN_ALREADY_PAID", "Only a locked payroll run can be paid.", 409);
    }
    const updated = await tx.payroll_runs.update({
      where: { id: run.id },
      data: {
        status: PAYROLL_RUN_STATUS.PAID,
        paid_by: actorId(user),
        paid_at: new Date(),
        payment_reference: input.paymentReference?.trim() || null,
        bank_batch_reference: input.bankBatchReference?.trim() || null,
        row_version: { increment: 1 },
      },
    });
    await audit("payroll_run.paid", run.id, companyId, user, tx);
    return publicRun(updated);
  });
}

export async function cancelPayrollRun(
  runId: string,
  companyId: number,
  reason: string,
  user: AuthUser
) {
  if (!reason.trim()) {
    throw new PayrollRunError("PAYROLL_RUN_CANNOT_CANCEL", "Cancellation reason is required.", 422);
  }
  return prisma.$transaction(async (tx) => {
    await lockRunRow(tx, runId, companyId);
    const run = await scopedRun(tx, runId, companyId);
    if (run.status === PAYROLL_RUN_STATUS.PAID || run.status === PAYROLL_RUN_STATUS.CANCELLED) {
      throw new PayrollRunError("PAYROLL_RUN_CANNOT_CANCEL", "This payroll run cannot be cancelled.", 409);
    }
    const links = await tx.payroll_run_attendance_links.findMany({
      where: { payroll_run_id: run.id, status: "ACTIVE" },
      select: { id: true, attendance_record_id: true },
    });
    if (links.length > 0) {
      await tx.attendance_records.updateMany({
        where: { id: { in: links.map((link) => link.attendance_record_id) } },
        data: { payroll_locked_at: null },
      });
      await tx.payroll_run_attendance_links.updateMany({
        where: { id: { in: links.map((link) => link.id) } },
        data: { status: "RELEASED", active_attendance_key: null, released_at: new Date() },
      });
    }
    const updated = await tx.payroll_runs.update({
      where: { id: run.id },
      data: {
        status: PAYROLL_RUN_STATUS.CANCELLED,
        active_period_key: null,
        cancelled_by: actorId(user),
        cancelled_at: new Date(),
        cancellation_reason: reason.trim(),
        row_version: { increment: 1 },
      },
    });
    await audit("payroll_run.cancelled", run.id, companyId, user, tx, {
      released_attendance: links.length,
    });
    return publicRun(updated);
  });
}
