import { describe, expect, it } from "bun:test";
import {
  normalizeCanonicalRole,
  validateEmail,
  validatePasswordPolicy,
  validateUserRoleCompany,
} from "../utils/user-policy";

describe("user role and company policy", () => {
  it("normalizes the six canonical roles", () => {
    expect(normalizeCanonicalRole(" CYD_ADMIN ")).toBe("cyd_admin");
    expect(normalizeCanonicalRole("admin")).toBe("admin");
    expect(normalizeCanonicalRole("superadmin")).toBeNull();
  });

  it("allows cyd_admin only without a company", () => {
    expect(validateUserRoleCompany("cyd_admin", null)).toEqual({ role: "cyd_admin", companyId: null });
    expect(() => validateUserRoleCompany("cyd_admin", 25)).toThrow("must not have a companyId");
  });

  it("requires every company role to have a company", () => {
    for (const role of ["admin", "hr", "accounting", "field_staff", "viewer"] as const) {
      expect(validateUserRoleCompany(role, 25)).toEqual({ role, companyId: 25 });
      expect(() => validateUserRoleCompany(role, null)).toThrow("requires a companyId");
    }
  });

  it("rejects unknown roles and invalid company IDs", () => {
    expect(() => validateUserRoleCompany("owner", 25)).toThrow("Unknown role");
    expect(() => validateUserRoleCompany("admin", 0)).toThrow("positive integer");
    expect(() => validateUserRoleCompany("admin", "abc")).toThrow("positive integer");
  });
});

describe("credential input policy", () => {
  it("accepts a password meeting every minimum requirement", () => {
    expect(validatePasswordPolicy("StrongPass12!")).toBe("StrongPass12!");
  });

  it("rejects passwords missing each required character class", () => {
    for (const password of ["Short1!", "lowercase12!", "UPPERCASE12!", "NoNumbers!!xx", "NoSpecial12xx"]) {
      expect(() => validatePasswordPolicy(password)).toThrow("Password must be at least 12 characters");
    }
  });

  it("normalizes valid email and rejects malformed email", () => {
    expect(validateEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(() => validateEmail("not-an-email")).toThrow("Email format is invalid");
  });
});
