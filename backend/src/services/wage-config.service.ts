import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { isWageSchemaError } from "../modules/company-wages/company-wage.policy";

export type WageConfig = {
  id: bigint;
  company_id: number;
  daily_wage: Prisma.Decimal;
  work_hours_per_day: Prisma.Decimal;
  ot1_multiplier: Prisma.Decimal;
  ot15_multiplier: Prisma.Decimal;
  ot2_multiplier: Prisma.Decimal;
  ot3_multiplier: Prisma.Decimal;
  is_active: boolean;
};

type WageQueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export class WageConfigError extends Error {
  constructor(
    public readonly code:
      | "COMPANY_WAGE_NOT_CONFIGURED"
      | "WAGE_SCHEMA_NOT_READY"
      | "COMPANY_REQUIRED",
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "WageConfigError";
  }
}

export async function getActiveWageConfig(
  companyId: number,
  db: WageQueryClient = prisma
): Promise<WageConfig> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new WageConfigError(
      "COMPANY_REQUIRED",
      "A valid company ID is required for payroll calculation",
      400
    );
  }

  try {
    const rows = await db.$queryRaw<WageConfig[]>`
      SELECT
        id, company_id, daily_wage, work_hours_per_day,
        ot1_multiplier, ot15_multiplier, ot2_multiplier, ot3_multiplier,
        is_active
      FROM payroll_company_wage_configs
      WHERE company_id = ${companyId} AND is_active = TRUE
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new WageConfigError(
        "COMPANY_WAGE_NOT_CONFIGURED",
        `Active wage configuration is required for company ID ${companyId}`,
        422
      );
    }
    return rows[0];
  } catch (error) {
    if (error instanceof WageConfigError) throw error;
    if (isWageSchemaError(error)) {
      throw new WageConfigError(
        "WAGE_SCHEMA_NOT_READY",
        "Company wage schema is not ready",
        503
      );
    }
    throw error;
  }
}
