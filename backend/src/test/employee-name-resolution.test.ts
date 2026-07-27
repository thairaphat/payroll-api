import { describe, expect, it } from "bun:test";
import { resolveCompanyEmployeeProfiles } from "../services/employee-profile.service";
import {
  isUsableEmployeeName,
  normalizeEmployeeCode,
  resolveProfileDisplayName,
} from "../utils/employee-profile";

const profile = {
  emp_code: " cyd1096 ",
  company_id: 39,
  first_name: "Base",
  last_name: "Name",
  first_name_th: "ชื่อ",
  last_name_th: "พนักงาน",
  first_name_en: "English",
  last_name_en: "Name",
};

function queryClient(rows: typeof profile[]) {
  return {
    $queryRaw: async <T = unknown>() => rows as unknown as T,
  };
}

describe("employee name resolution", () => {
  it("EMP-NAME-001 prefers the current-company profile name over attendance UNKNOWN", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([profile])
    );
    expect(result.get("CYD1096")).toEqual({
      employeeCode: "CYD1096",
      employeeName: "ชื่อ พนักงาน",
      status: "FOUND",
    });
    expect(isUsableEmployeeName("UNKNOWN")).toBe(false);
  });

  it("EMP-NAME-002 normalizes whitespace and case consistently", () => {
    expect(normalizeEmployeeCode("  cyd1909\u00a0")).toBe("CYD1909");
  });

  it("EMP-NAME-003 resolves the matching company when codes are reused", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([profile])
    );
    expect(result.get("CYD1096")?.employeeName).toBe("ชื่อ พนักงาน");
  });

  it("EMP-NAME-004 never falls back to a profile from another company", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([{ ...profile, company_id: 16 }])
    );
    expect(result.get("CYD1096")?.status).toBe("NOT_FOUND");
  });

  it("uses Thai, English, then base name priority", () => {
    expect(resolveProfileDisplayName(profile)).toBe("ชื่อ พนักงาน");
    expect(
      resolveProfileDisplayName({
        ...profile,
        first_name_th: null,
        last_name_th: null,
      })
    ).toBe("English Name");
  });

  it("EMP-NAME-005 returns null and NOT_FOUND when no profile exists", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([])
    );
    expect(result.get("CYD1096")).toMatchObject({
      employeeName: null,
      status: "NOT_FOUND",
    });
  });

  it("rejects ambiguous normalized profiles", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([profile, { ...profile, emp_code: "CYD1096" }])
    );
    expect(result.get("CYD1096")?.status).toBe("NOT_FOUND");
  });

  it("EMP-NAME-010 scopes the query by company and normalized employee code", async () => {
    const source = await Bun.file(
      new URL("../services/employee-profile.service.ts", import.meta.url)
    ).text();
    expect(source).toContain("WHERE company_id = ${companyId}");
    expect(source).toContain("UPPER(TRIM(emp_code))");
    expect(source).toContain("Prisma.join(normalizedCodes)");
  });
});
