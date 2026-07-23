import { Prisma } from "@prisma/client";
import type {
  CompanyWageInput,
  CompanyWagePatch,
} from "./company-wage.types";

export class CompanyWageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "CompanyWageError";
  }
}

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimal(
  value: unknown,
  code: string,
  label: string,
  maximum: string
): Prisma.Decimal {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!DECIMAL_PATTERN.test(raw)) {
    throw new CompanyWageError(code, `${label} must be a positive decimal`);
  }

  const parsed = new Prisma.Decimal(raw);
  if (parsed.lte(0) || parsed.gt(new Prisma.Decimal(maximum))) {
    throw new CompanyWageError(code, `${label} is outside the allowed range`);
  }
  return parsed;
}

export function parseCompanyId(value: unknown): number {
  const companyId = Number(value);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new CompanyWageError(
      "COMPANY_REQUIRED",
      "A valid company ID is required"
    );
  }
  return companyId;
}

export function validateCreateInput(input: CompanyWageInput) {
  return {
    dailyWage: decimal(
      input.dailyWage,
      "INVALID_DAILY_WAGE",
      "Daily wage",
      "99999999.99"
    ),
    workHoursPerDay: decimal(
      input.workHoursPerDay ?? "8",
      "INVALID_WORK_HOURS",
      "Work hours per day",
      "24"
    ),
    ot1Multiplier: decimal(
      input.ot1Multiplier ?? "1",
      "INVALID_OT_MULTIPLIER",
      "OT 1 multiplier",
      "99.99"
    ),
    ot15Multiplier: decimal(
      input.ot15Multiplier ?? "1.5",
      "INVALID_OT_MULTIPLIER",
      "OT 1.5 multiplier",
      "99.99"
    ),
    ot2Multiplier: decimal(
      input.ot2Multiplier ?? "2",
      "INVALID_OT_MULTIPLIER",
      "OT 2 multiplier",
      "99.99"
    ),
    ot3Multiplier: decimal(
      input.ot3Multiplier ?? "3",
      "INVALID_OT_MULTIPLIER",
      "OT 3 multiplier",
      "99.99"
    ),
    isActive: input.isActive === undefined ? true : input.isActive === true,
  };
}

export function validatePatchInput(input: CompanyWagePatch) {
  if (!input || Object.keys(input).length === 0) {
    throw new CompanyWageError(
      "INVALID_DAILY_WAGE",
      "At least one wage field is required"
    );
  }
  const result: Record<string, Prisma.Decimal | boolean> = {};
  if (input.dailyWage !== undefined) {
    result.dailyWage = decimal(
      input.dailyWage,
      "INVALID_DAILY_WAGE",
      "Daily wage",
      "99999999.99"
    );
  }
  if (input.workHoursPerDay !== undefined) {
    result.workHoursPerDay = decimal(
      input.workHoursPerDay,
      "INVALID_WORK_HOURS",
      "Work hours per day",
      "24"
    );
  }
  for (const [key, value, label] of [
    ["ot1Multiplier", input.ot1Multiplier, "OT 1 multiplier"],
    ["ot15Multiplier", input.ot15Multiplier, "OT 1.5 multiplier"],
    ["ot2Multiplier", input.ot2Multiplier, "OT 2 multiplier"],
    ["ot3Multiplier", input.ot3Multiplier, "OT 3 multiplier"],
  ] as const) {
    if (value !== undefined) {
      result[key] = decimal(
        value,
        "INVALID_OT_MULTIPLIER",
        label,
        "99.99"
      );
    }
  }
  if (input.isActive !== undefined) result.isActive = input.isActive === true;
  return result;
}

export function isWageSchemaError(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    message?: string;
    meta?: { code?: string | number; message?: string };
  };
  const databaseCode = String(candidate?.meta?.code ?? "");
  const message = `${candidate?.message ?? ""} ${candidate?.meta?.message ?? ""}`;
  return (
    (candidate?.code === "P2010" &&
      (databaseCode === "1054" || databaseCode === "1146")) ||
    /unknown column|doesn't exist|does not exist/i.test(message)
  );
}

export function toSchemaReadyError(error: unknown): never {
  if (isWageSchemaError(error)) {
    throw new CompanyWageError(
      "WAGE_SCHEMA_NOT_READY",
      "Company wage schema is not ready",
      503
    );
  }
  throw error;
}
