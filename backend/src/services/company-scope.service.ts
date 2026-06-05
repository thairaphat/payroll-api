import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { AuthUser } from "../middlewares/auth.middleware";

/**
 * number = filter to this specific company_id
 * null   = no company filter (reserved for future super-admin cross-company access)
 * "deny" = user has no company_id assigned — reject with 403
 */
export type CompanyScope = number | null | "deny";

/**
 * Derives the company scope for a given authenticated user.
 *
 * Every role is scoped to its assigned company_id.
 * If no company_id is set, access is denied regardless of role.
 */
export function getCompanyScope(user: AuthUser): CompanyScope {
  const scope = user.companyId != null ? user.companyId : "deny";
  console.log(
    `[company.scope] user=${user.username ?? "(unknown)"}` +
    ` companyId=${user.companyId ?? "null"}` +
    ` role=${user.role}` +
    ` scope=${scope}`
  );
  return scope;
}

/**
 * Resolves all employee_code values (direct emp_codes + sheet-mapped codes)
 * that belong to the given company. Used to filter attendance_records, which
 * has no direct company_id column.
 *
 * Returns an empty array if the company has no employees — callers should
 * treat this as "nothing accessible" rather than "all records".
 */
export async function getCompanyEmployeeCodes(companyId: number): Promise<string[]> {
  const [profiles, mappings] = await Promise.all([
    prisma.employee_document_profiles.findMany({
      where: { company_id: companyId },
      select: { emp_code: true },
    }),
    prisma.employee_code_mapping.findMany({
      select: { sheet_employee_code: true, emp_code: true },
    }),
  ]);

  const empCodes = new Set<string>(
    profiles.map((p) => p.emp_code).filter((c): c is string => c != null)
  );

  // Also include sheet_employee_codes that map to this company's emp_codes
  for (const m of mappings) {
    if (empCodes.has(m.emp_code)) {
      empCodes.add(m.sheet_employee_code);
    }
  }

  return [...empCodes];
}

/**
 * Returns a Prisma.Sql fragment for raw SQL queries that already JOIN
 * employee_document_profiles as alias "e".
 *
 * Usage: insert ${companySqlFragment(scope)} into the WHERE clause.
 */
export function companySqlFragment(scope: number | null): Prisma.Sql {
  return scope != null
    ? Prisma.sql`AND e.company_id = ${scope}`
    : Prisma.empty;
}
