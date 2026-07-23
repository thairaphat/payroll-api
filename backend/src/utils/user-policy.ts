export const CANONICAL_ROLES = [
  "cyd_admin",
  "admin",
  "hr",
  "accounting",
  "field_staff",
  "viewer",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

export const COMPANY_ROLES = [
  "admin",
  "hr",
  "accounting",
  "field_staff",
  "viewer",
] as const satisfies readonly CanonicalRole[];

export const COMPANY_ADMIN_CREATABLE_ROLES = [
  "hr",
  "accounting",
  "field_staff",
  "viewer",
] as const satisfies readonly CanonicalRole[];

export class UserPolicyError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
  }
}

export function normalizeCanonicalRole(value: unknown): CanonicalRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CANONICAL_ROLES.includes(normalized as CanonicalRole)
    ? (normalized as CanonicalRole)
    : null;
}

export function normalizeCompanyId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const companyId = Number(value);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new UserPolicyError("companyId must be a positive integer", "companyId");
  }
  return companyId;
}

export function validateUserRoleCompany(
  roleValue: unknown,
  companyIdValue: unknown
): { role: CanonicalRole; companyId: number | null } {
  const role = normalizeCanonicalRole(roleValue);
  if (!role) throw new UserPolicyError("Unknown role", "role");
  const companyId = normalizeCompanyId(companyIdValue);

  if (role === "cyd_admin" && companyId !== null) {
    throw new UserPolicyError("cyd_admin must not have a companyId", "companyId");
  }
  if (role !== "cyd_admin" && companyId === null) {
    throw new UserPolicyError(`${role} requires a companyId`, "companyId");
  }
  return { role, companyId };
}

export function validateEmail(value: unknown): string {
  if (typeof value !== "string") throw new UserPolicyError("Email is required", "email");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
    throw new UserPolicyError("Email format is invalid", "email");
  }
  return email;
}

export function validateUsername(value: unknown): string {
  if (typeof value !== "string") throw new UserPolicyError("Username is required", "username");
  const username = value.trim();
  if (!username || username.length > 80) {
    throw new UserPolicyError("Username must contain 1-80 characters", "username");
  }
  return username;
}

export function validatePasswordPolicy(value: unknown): string {
  if (typeof value !== "string") throw new UserPolicyError("Password is required", "password");
  if (
    value.length < 12 ||
    !/[A-Z]/.test(value) ||
    !/[a-z]/.test(value) ||
    !/[0-9]/.test(value) ||
    !/[^A-Za-z0-9]/.test(value)
  ) {
    throw new UserPolicyError(
      "Password must be at least 12 characters and include uppercase, lowercase, number and special character",
      "password"
    );
  }
  return value;
}
