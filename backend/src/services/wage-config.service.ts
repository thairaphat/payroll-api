import { prisma } from "../db";
import { DAILY_WAGE, WORK_HOURS } from "../constants/payroll";

export type WageConfig = {
  daily_wage: number;
  work_hours: number;
};

const FALLBACK: WageConfig = { daily_wage: DAILY_WAGE, work_hours: WORK_HOURS };

/**
 * Fetches the active wage config for a given company, with two levels of fallback.
 *
 * Lookup order:
 *   1. company-specific row  (company_id = companyId, is_active, effective_date <= today)
 *   2. global row            (company_id IS NULL,     is_active, effective_date <= today)
 *   3. hardcoded constant    (DAILY_WAGE / WORK_HOURS from src/constants/payroll.ts)
 *
 * Called without arguments returns the global/fallback config — backward-compatible
 * with all existing callers that don't yet pass a company_id.
 */
export async function getActiveWageConfig(companyId?: number | null): Promise<WageConfig> {
  try {
    // Step 1: company-specific config
    if (companyId != null) {
      const companyConfig = await prisma.payroll_wage_config.findFirst({
        where: {
          company_id: companyId,
          is_active: true,
          effective_date: { lte: new Date() },
        },
        orderBy: { effective_date: "desc" },
      });
      if (companyConfig) {
        return {
          daily_wage: Number(companyConfig.daily_wage),
          work_hours: Number(companyConfig.work_hours),
        };
      }
    }

    // Step 2: global config (company_id IS NULL)
    const globalConfig = await prisma.payroll_wage_config.findFirst({
      where: {
        company_id: null,
        is_active: true,
        effective_date: { lte: new Date() },
      },
      orderBy: { effective_date: "desc" },
    });

    if (!globalConfig) {
      console.warn(
        "[wage-config] No active config in payroll_wage_config (company_id=%s). " +
          "Using fallback constants — daily_wage=%s THB, work_hours=%s hrs.",
        companyId ?? "global",
        FALLBACK.daily_wage,
        FALLBACK.work_hours
      );
      return FALLBACK;
    }

    return {
      daily_wage: Number(globalConfig.daily_wage),
      work_hours: Number(globalConfig.work_hours),
    };
  } catch (err) {
    console.error("[wage-config] DB error reading wage config, using fallback:", err);
    return FALLBACK;
  }
}

/**
 * Batch-fetches wage configs for a list of company IDs in a single DB round-trip.
 *
 * Returns a Map<company_id | null, WageConfig> where:
 *   - key = numeric company_id   → company-specific rate
 *   - key = null                 → global fallback rate
 *
 * The null (global) key is ALWAYS present in the returned map — callers can
 * safely do `wageMap.get(companyId) ?? wageMap.get(null)` without further checks.
 *
 * Fallback order per key:
 *   1. Most-recent active row matching that company_id
 *   2. Most-recent active global row (company_id IS NULL) for all company keys
 *   3. Hardcoded constant (FALLBACK) if DB is unreachable or empty
 */
export async function getWageConfigsForCompanies(
  companyIds: (number | null)[]
): Promise<Map<number | null, WageConfig>> {
  const result = new Map<number | null, WageConfig>();

  // Raw SQL returns company_id as BigInt on some MySQL drivers — convert to Number
  // before passing to Prisma, which expects Int (not BigInt) for Int? fields.
  const uniqueCompanyIds = [
    ...new Set(
      companyIds
        .filter((id) => id != null)
        .map((id) => Number(id))
    ),
  ];

  try {
    // Build OR clause — always include global (company_id IS NULL)
    const orClauses: any[] = [{ company_id: null }];
    if (uniqueCompanyIds.length > 0) {
      orClauses.push({ company_id: { in: uniqueCompanyIds } });
    }

    const configs = await prisma.payroll_wage_config.findMany({
      where: {
        is_active: true,
        effective_date: { lte: new Date() },
        OR: orClauses,
      },
      orderBy: { effective_date: "desc" },
    });

    // For each key, keep only the most-recent row (configs are already desc by date)
    for (const config of configs) {
      const key = config.company_id ?? null;
      if (!result.has(key)) {
        result.set(key, {
          daily_wage: Number(config.daily_wage),
          work_hours: Number(config.work_hours),
        });
      }
    }
  } catch (err) {
    console.error("[wage-config] DB error fetching company wage configs:", err);
  }

  // Guarantee null key always present so callers need no extra null-check
  if (!result.has(null)) {
    console.warn(
      "[wage-config] No global active config found. Using constant fallback for all companies."
    );
    result.set(null, FALLBACK);
  }

  return result;
}
