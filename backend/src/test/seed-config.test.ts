import { describe, expect, it } from "bun:test";
import {
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
    expect(config.companyUsers.map((user) => [user.username, user.role, user.companyId])).toEqual([
      ["admindynamic", "admin", 25],
      ["hrdynamic", "hr", 25],
      ["accountingdynamic", "accounting", 25],
      ["fielddynamic", "field_staff", 25],
      ["viewerdynamic", "viewer", 25],
    ]);
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
  });

  it("formats logs without password or hash data", () => {
    const user = resolveSeedConfiguration({ NODE_ENV: "development" }).companyUsers[0];
    const output = formatSeedUserLog(user, "skipped");
    expect(output).toContain("user=admindynamic");
    expect(output).not.toContain(user.password!);
    expect(output.toLowerCase()).not.toContain("hash");
    expect(output.toLowerCase()).not.toContain("password");
  });
});
