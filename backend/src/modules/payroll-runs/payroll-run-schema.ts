import { Prisma } from "@prisma/client";
import { prisma } from "../../db";

export const PAYROLL_RUN_TABLES = [
  "payroll_runs",
  "payroll_run_items",
  "payroll_run_attendance_links",
] as const;

export type PayrollRunTable = (typeof PAYROLL_RUN_TABLES)[number];

const PAYROLL_RUN_TABLE_SET = new Set<string>(PAYROLL_RUN_TABLES);

function normalizePrismaTableName(value: unknown) {
  if (typeof value !== "string") return null;
  const segments = value
    .replace(/[`"]/g, "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function nestedAdapterTable(meta: Record<string, unknown> | undefined) {
  const adapter = meta?.driverAdapterError;
  if (!adapter || typeof adapter !== "object") return null;
  const cause = (adapter as Record<string, unknown>).cause;
  if (!cause || typeof cause !== "object") return null;
  return (cause as Record<string, unknown>).table;
}

export function getPayrollRunMissingTableFromError(
  error: unknown
): PayrollRunTable | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code !== "P2021") return null;
  const table = normalizePrismaTableName(
    error.meta?.table ?? nestedAdapterTable(error.meta)
  );
  return table !== null && PAYROLL_RUN_TABLE_SET.has(table)
    ? (table as PayrollRunTable)
    : null;
}

export function isPayrollRunSchemaNotInitialized(error: unknown) {
  return getPayrollRunMissingTableFromError(error) !== null;
}

export async function withPayrollRunSchemaFallback<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T> | T
) {
  try {
    return await operation();
  } catch (error) {
    if (!isPayrollRunSchemaNotInitialized(error)) throw error;
    return fallback();
  }
}

export const PAYROLL_RUN_SCHEMA_NOT_INITIALIZED = {
  code: "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED",
  message:
    "Monthly Payroll Run schema is not initialized. Apply the approved migration before using Payroll Runs.",
} as const;

export class PayrollRunSchemaNotInitializedError extends Error {
  readonly code = PAYROLL_RUN_SCHEMA_NOT_INITIALIZED.code;
  readonly status = 503;

  constructor(public readonly missingTables: readonly PayrollRunTable[]) {
    super(PAYROLL_RUN_SCHEMA_NOT_INITIALIZED.message);
    this.name = "PayrollRunSchemaNotInitializedError";
  }
}

type ReadinessClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function getPayrollRunSchemaReadiness(
  db: ReadinessClient = prisma
) {
  const rows = await db.$queryRaw<Array<{ tableName: string }>>(Prisma.sql`
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'payroll_runs',
        'payroll_run_items',
        'payroll_run_attendance_links'
      )
  `);
  const existing = new Set(rows.map((row) => row.tableName));
  const missingTables = PAYROLL_RUN_TABLES.filter(
    (table) => !existing.has(table)
  );
  return {
    initialized: missingTables.length === 0,
    missingTables,
  };
}

export async function withPayrollRunReadinessGate<T>(
  operation: () => Promise<T>,
  db: ReadinessClient = prisma
) {
  const readiness = await getPayrollRunSchemaReadiness(db);
  if (!readiness.initialized) {
    throw new PayrollRunSchemaNotInitializedError(readiness.missingTables);
  }
  return operation();
}
