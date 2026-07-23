import {
  validateEmail,
  validatePasswordPolicy,
  validateUsername,
  validateUserRoleCompany,
  type CanonicalRole,
} from "../src/utils/user-policy";

const DEVELOPMENT_DEFAULT_PASSWORD = "ChangeMe123!";

export const DEVELOPMENT_COMPANY_IDS = [
  16, 18, 21, 22, 23, 24, 25, 31, 37, 38, 39, 40, 41,
] as const;

const DEVELOPMENT_COMPANY_USER_ROLES = [
  { prefix: "admin", role: "admin" },
  { prefix: "hr", role: "hr" },
  { prefix: "accounting", role: "accounting" },
  { prefix: "field", role: "field_staff" },
  { prefix: "viewer", role: "viewer" },
] as const;

export type SeedUserConfig = {
  username: string;
  email: string;
  password?: string;
  updatePassword: boolean;
  role: CanonicalRole;
  companyId: number | null;
  fullName: string;
  isActive: boolean;
};

export type SeedConfiguration = {
  cydAdmin: SeedUserConfig;
  companyUsers: SeedUserConfig[];
  usedDevelopmentDefaults: boolean;
};

type SeedEnvironment = Partial<Record<
  "NODE_ENV" | "CYD_ADMIN_USERNAME" | "CYD_ADMIN_EMAIL" | "CYD_ADMIN_PASSWORD" | "PAYROLL_COMPANY_USERS_JSON",
  string
>>;

function createDevelopmentCompanyUsers(companyId: number) {
  return {
    companyId,
    users: DEVELOPMENT_COMPANY_USER_ROLES.map(({ prefix, role }) => {
      const username = `${prefix}${companyId}`;
      return {
        username,
        email: `${username}@payroll.local`,
        password: DEVELOPMENT_DEFAULT_PASSWORD,
        role,
        isActive: true,
      };
    }),
  };
}

export const defaultCompanyUsers = DEVELOPMENT_COMPANY_IDS.map(
  createDevelopmentCompanyUsers
);

type CompanyUsersJson = Array<{
  companyId?: unknown;
  users?: Array<Record<string, unknown>>;
}>;

function parseCompanyUsers(groups: CompanyUsersJson): SeedUserConfig[] {
  if (!Array.isArray(groups)) throw new Error("PAYROLL_COMPANY_USERS_JSON must be an array");
  const users: SeedUserConfig[] = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.users)) throw new Error("Each company entry must contain a users array");
    for (const input of group.users) {
      const assignment = validateUserRoleCompany(input.role, group.companyId);
      if (assignment.role === "cyd_admin") throw new Error("Company user configuration cannot contain cyd_admin");
      const username = validateUsername(input.username);
      const password = input.password == null || input.password === ""
        ? undefined
        : validatePasswordPolicy(input.password);
      if (input.updatePassword != null && typeof input.updatePassword !== "boolean") {
        throw new Error(`updatePassword must be boolean for configured user ${username}`);
      }
      if (input.isActive != null && typeof input.isActive !== "boolean") {
        throw new Error(`isActive must be boolean for configured user ${username}`);
      }
      users.push({
        username,
        email: validateEmail(input.email),
        password,
        updatePassword: input.updatePassword === true,
        role: assignment.role,
        companyId: assignment.companyId,
        fullName: typeof input.fullName === "string" && input.fullName.trim()
          ? input.fullName.trim().slice(0, 150)
          : username,
        isActive: input.isActive !== false,
      });
    }
  }
  return users;
}

function parseCompanyUsersJson(raw: string): SeedUserConfig[] {
  try {
    return parseCompanyUsers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("PAYROLL_COMPANY_USERS_JSON must be valid JSON");
    throw error;
  }
}

function assertNoConfigDuplicates(users: SeedUserConfig[]) {
  const usernames = new Set<string>();
  const emails = new Set<string>();
  for (const user of users) {
    const username = user.username.toLowerCase();
    const email = user.email.toLowerCase();
    if (usernames.has(username)) throw new Error(`Duplicate username in seed configuration: ${user.username}`);
    if (emails.has(email)) throw new Error(`Duplicate email in seed configuration: ${user.email}`);
    usernames.add(username);
    emails.add(email);
  }
}

export function resolveSeedConfiguration(env: SeedEnvironment): SeedConfiguration {
  const production = env.NODE_ENV === "production";
  if (production) {
    if (!env.CYD_ADMIN_USERNAME || !env.CYD_ADMIN_EMAIL || !env.CYD_ADMIN_PASSWORD) {
      throw new Error("CYD admin environment configuration is required when seeding production");
    }
    if (!env.PAYROLL_COMPANY_USERS_JSON) {
      throw new Error("PAYROLL_COMPANY_USERS_JSON is required when seeding production");
    }
  }

  const usedCydDefaults = !env.CYD_ADMIN_USERNAME || !env.CYD_ADMIN_EMAIL || !env.CYD_ADMIN_PASSWORD;
  const cydPassword = env.CYD_ADMIN_PASSWORD ?? DEVELOPMENT_DEFAULT_PASSWORD;
  const cydAdmin: SeedUserConfig = {
    username: validateUsername(env.CYD_ADMIN_USERNAME ?? "admincyd"),
    email: validateEmail(env.CYD_ADMIN_EMAIL ?? "admincyd@payroll.local"),
    password: validatePasswordPolicy(cydPassword),
    updatePassword: Boolean(env.CYD_ADMIN_PASSWORD),
    role: "cyd_admin",
    companyId: null,
    fullName: "CYD Administrator",
    isActive: true,
  };

  const usedCompanyDefaults = !env.PAYROLL_COMPANY_USERS_JSON;
  const companyUsers = env.PAYROLL_COMPANY_USERS_JSON
    ? parseCompanyUsersJson(env.PAYROLL_COMPANY_USERS_JSON)
    : parseCompanyUsers(defaultCompanyUsers as unknown as CompanyUsersJson);

  if (production) {
    const usesForbiddenDefault = cydAdmin.password === DEVELOPMENT_DEFAULT_PASSWORD ||
      companyUsers.some((user) => user.password === DEVELOPMENT_DEFAULT_PASSWORD);
    if (usesForbiddenDefault) throw new Error("Development default credentials are not allowed when seeding production");
  }

  assertNoConfigDuplicates([cydAdmin, ...companyUsers]);
  return {
    cydAdmin,
    companyUsers,
    usedDevelopmentDefaults: !production && (usedCydDefaults || usedCompanyDefaults),
  };
}

export function shouldHashSeedPassword(existingUser: boolean, user: SeedUserConfig): boolean {
  return !existingUser || user.updatePassword;
}

export function findMissingCompanyIds(configuredIds: number[], existingIds: number[]): number[] {
  const existing = new Set(existingIds);
  return [...new Set(configuredIds)].filter((id) => !existing.has(id));
}

export function assertAllConfiguredCompaniesExist(
  configuredIds: number[],
  existingIds: number[]
): void {
  const missingCompanyIds = findMissingCompanyIds(configuredIds, existingIds);
  if (missingCompanyIds.length > 0) {
    throw new Error(`Configured company IDs not found: ${missingCompanyIds.join(", ")}`);
  }
}

export function formatSeedUserLog(
  user: Pick<SeedUserConfig, "username" | "role" | "companyId">,
  status: "created" | "updated" | "skipped"
): string {
  return `[seed] user=${user.username} role=${user.role} companyId=${user.companyId ?? "null"} status=${status}`;
}
