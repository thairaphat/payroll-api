import { describe, expect, it } from "bun:test";
import {
  assertAllConfiguredCompaniesExist,
  DEVELOPMENT_COMPANY_IDS,
  findMissingCompanyIds,
  formatSeedUserLog,
  resolveSeedConfiguration,
  shouldHashSeedPassword,
} from "../../prisma/seed-config";

const productionCompanyJson = JSON.stringify([
  {
    companyId: 25,
    users: [
      {
        username: "productionadmin",
        email: "productionadmin@payroll.local",
        password: "Production12!",
        role: "admin",
      },
    ],
  },
]);

describe("development seed defaults", () => {
  it("uses the requested local users when environment variables are absent", () => {
    const config = resolveSeedConfiguration({ NODE_ENV: "development" });
    expect(config.usedDevelopmentDefaults).toBe(true);
    expect(config.cydAdmin).toMatchObject({
      username: "admincyd",
      email: "admincyd@payroll.local",
      role: "cyd_admin",
      companyId: null,
      isActive: true,
      updatePassword: false,
    });
    expect(config.companyUsers).toHaveLength(65);
  });

  it("generates five canonical company users for each of the 13 companies", () => {
    const config = resolveSeedConfiguration({ NODE_ENV: "development" });
    expect(DEVELOPMENT_COMPANY_IDS).toEqual([
      16, 18, 21, 22, 23, 24, 25, 31, 37, 38, 39, 40, 41,
    ]);
    for (const companyId of DEVELOPMENT_COMPANY_IDS) {
      const users = config.companyUsers.filter((user) => user.companyId === companyId);
      expect(users).toHaveLength(5);
      expect(users.map((user) => user.role)).toEqual([
        "admin", "hr", "accounting", "field_staff", "viewer",
      ]);
      expect(users.map((user) => user.username)).toEqual([
        `admin${companyId}`,
        `hr${companyId}`,
        `accounting${companyId}`,
        `field${companyId}`,
        `viewer${companyId}`,
      ]);
      for (const user of users) {
        expect(user.email).toBe(`${user.username}@payroll.local`);
        expect(user.companyId).toBe(companyId);
        expect(user.updatePassword).toBe(false);
      }
    }
  });

  it("generates unique usernames and emails across all development users", () => {
    const config = resolveSeedConfiguration({ NODE_ENV: "development" });
    const allUsers = [config.cydAdmin, ...config.companyUsers];
    expect(new Set(allUsers.map((user) => user.username.toLowerCase())).size).toBe(66);
    expect(new Set(allUsers.map((user) => user.email.toLowerCase())).size).toBe(66);
    expect(new Set(allUsers.map((user) => user.password))).toEqual(new Set(["ChangeMe123!"]));
    expect(config.companyUsers.filter((user) => user.companyId === 39).map((user) => user.email)).toEqual([
      "admin39@payroll.local",
      "hr39@payroll.local",
      "accounting39@payroll.local",
      "field39@payroll.local",
      "viewer39@payroll.local",
    ]);
  });

  it("keeps the development cyd_admin global and active", () => {
    const config = resolveSeedConfiguration({ NODE_ENV: "development" });
    expect(config.cydAdmin).toMatchObject({
      username: "admincyd",
      email: "admincyd@payroll.local",
      role: "cyd_admin",
      companyId: null,
      isActive: true,
      updatePassword: false,
    });
  });

  it("lets environment configuration override development defaults", () => {
    const config = resolveSeedConfiguration({
      NODE_ENV: "development",
      CYD_ADMIN_USERNAME: "customcyd",
      CYD_ADMIN_EMAIL: "customcyd@payroll.local",
      CYD_ADMIN_PASSWORD: "CustomSecret12!",
      PAYROLL_COMPANY_USERS_JSON: JSON.stringify([{ companyId: 26, users: [{ username: "customadmin", email: "customadmin@payroll.local", password: "CustomAdmin12!", role: "admin" }] }]),
    });
    expect(config.usedDevelopmentDefaults).toBe(false);
    expect(config.cydAdmin.username).toBe("customcyd");
    expect(config.cydAdmin.updatePassword).toBe(true);
    expect(config.companyUsers[0]).toMatchObject({ username: "customadmin", companyId: 26 });
  });
});

describe("production seed safety", () => {
  it("fails when required production environment is absent", () => {
    expect(() => resolveSeedConfiguration({ NODE_ENV: "production" })).toThrow("environment configuration is required");
  });

  it("rejects development default credentials even when explicitly supplied", () => {
    expect(() => resolveSeedConfiguration({
      NODE_ENV: "production",
      CYD_ADMIN_USERNAME: "admincyd",
      CYD_ADMIN_EMAIL: "admincyd@payroll.local",
      CYD_ADMIN_PASSWORD: "ChangeMe123!",
      PAYROLL_COMPANY_USERS_JSON: productionCompanyJson,
    })).toThrow("Development default credentials are not allowed");
  });
});

describe("idempotent password and company behavior", () => {
  it("does not reset an existing default-development user password", () => {
    const user = resolveSeedConfiguration({ NODE_ENV: "development" }).companyUsers[0];
    expect(shouldHashSeedPassword(true, user)).toBe(false);
    expect(shouldHashSeedPassword(false, user)).toBe(true);
  });

  it("updates an existing password only when updatePassword is true", () => {
    const user = resolveSeedConfiguration({
      NODE_ENV: "development",
      PAYROLL_COMPANY_USERS_JSON: JSON.stringify([{ companyId: 25, users: [{ username: "admin", email: "admin@payroll.local", password: "UpdatedSecret12!", updatePassword: true, role: "admin" }] }]),
    }).companyUsers[0];
    expect(shouldHashSeedPassword(true, user)).toBe(true);
  });

  it("detects a missing configured company without creating it", () => {
    expect(findMissingCompanyIds([25, 26, 25], [26])).toEqual([25]);
    expect(() => assertAllConfiguredCompaniesExist(
      [...DEVELOPMENT_COMPANY_IDS],
      DEVELOPMENT_COMPANY_IDS.filter((id) => id !== 39)
    )).toThrow("Configured company IDs not found: 39");
  });

  it("formats logs without password or hash data", () => {
    const user = resolveSeedConfiguration({ NODE_ENV: "development" }).companyUsers[0];
    const output = formatSeedUserLog(user, "skipped");
    expect(output).toContain("user=admin16");
    expect(output).not.toContain(user.password!);
    expect(output.toLowerCase()).not.toContain("hash");
    expect(output.toLowerCase()).not.toContain("password");
  });
});
