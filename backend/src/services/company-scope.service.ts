import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { AuthUser } from "../middlewares/auth.middleware";
import { logRequiredAudit } from "./audit.service";

/**
 * number = filter to this specific company_id
 * null   = no company filter (reserved for future super-admin cross-company access)
 * "deny" = user has no company_id assigned — reject with 403
 */
export type CompanyScope = number | null | "deny";

export class CompanyScopeError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404) {
    super(message);
  }
}

export async function resolveCompanyScope(
  user: AuthUser,
  requestedCompanyId?: string | number | null,
  context?: { endpoint?: string; method?: string; requestId?: string }
): Promise<number> {
  if (user.role !== "cyd_admin") {
    if (user.companyId == null) throw new CompanyScopeError("Company assignment is required.", 403);
    if (requestedCompanyId != null && String(requestedCompanyId) !== String(user.companyId)) {
      throw new CompanyScopeError("Cannot access another company.", 403);
    }
    return user.companyId;
  }

  if (requestedCompanyId == null || requestedCompanyId === "") {
    throw new CompanyScopeError("companyId is required", 400);
  }
  const companyId = Number(requestedCompanyId);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new CompanyScopeError("companyId must be a positive integer", 400);
  }
  const company = await prisma.companies.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new CompanyScopeError("Company not found", 404);

  await logRequiredAudit("company.scope.view", "company", {
    companyId,
    endpoint: context?.endpoint,
    method: context?.method,
    requestId: context?.requestId,
  }, user);
  return companyId;
}

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
  // Profiles are the sole employee source of truth. Until attendance has its
  // own company_id, duplicate codes are excluded because ownership is ambiguous.
  const profiles = await prisma.employee_document_profiles.findMany({
    where: { company_id: companyId, emp_code: { not: null } },
    select: { emp_code: true },
  });
  const companyCodes = [...new Set(profiles.map((p) => p.emp_code).filter((c): c is string => Boolean(c)))];
  if (companyCodes.length === 0) return [];

  const matchingProfiles = await prisma.employee_document_profiles.findMany({
    where: { emp_code: { in: companyCodes }, company_id: { not: null } },
    select: { emp_code: true, company_id: true },
  });
  const ownersByCode = new Map<string, Set<number>>();
  for (const profile of matchingProfiles) {
    if (profile.emp_code == null || profile.company_id == null) continue;
    const owners = ownersByCode.get(profile.emp_code) ?? new Set<number>();
    owners.add(profile.company_id);
    ownersByCode.set(profile.emp_code, owners);
  }
  const ambiguous = new Set(
    [...ownersByCode.entries()].filter(([, owners]) => owners.size > 1).map(([code]) => code)
  );
  return companyCodes.filter((code) => !ambiguous.has(code));
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
