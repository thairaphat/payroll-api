import { describe, expect, it } from "bun:test";
import { resolveCompanyEmployeeProfiles } from "../services/employee-profile.service";
import { resolveProfileDisplayName } from "../utils/employee-profile";

const payrollSourceUrl = new URL(
  "../modules/payroll/payroll.service.ts",
  import.meta.url
);
const resolverSourceUrl = new URL(
  "../services/employee-profile.service.ts",
  import.meta.url
);

const mockProfile = (empCode: string) => ({
  emp_code: empCode,
  company_id: 39,
  first_name: "Employee",
  last_name: empCode,
  first_name_th: null,
  last_name_th: null,
  first_name_en: null,
  last_name_en: null,
});

const queryClient = (rows: ReturnType<typeof mockProfile>[]) => ({
  $queryRaw: async <T = unknown>() => rows as unknown as T,
});

describe("employee profile runtime schema compatibility", () => {
  it("EMP-SCHEMA-001 payroll SQL does not reference absent full-name columns", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).not.toMatch(/e\.full_name_(th|en)/);
  });

  it("EMP-SCHEMA-002 resolver query uses only real employee-name columns", async () => {
    const source = await Bun.file(resolverSourceUrl).text();
    expect(source).toContain("first_name, last_name");
    expect(source).toContain("first_name_th, last_name_th");
    expect(source).toContain("first_name_en, last_name_en");
    expect(source).not.toMatch(/full_name_(th|en)|employee_name|display_name/);
  });

  it("EMP-SCHEMA-003 profile name has priority over attendance UNKNOWN", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source.indexOf("MAX(e.first_name_th)")).toBeLessThan(
      source.indexOf("UPPER(TRIM(MAX(a.employee_name)))")
    );
  });

  it("EMP-SCHEMA-004 first and last name fallback works", () => {
    expect(resolveProfileDisplayName(mockProfile("CYD1096"))).toBe(
      "Employee CYD1096"
    );
  });

  it("EMP-SCHEMA-005 empty profile name returns null", () => {
    expect(
      resolveProfileDisplayName({
        first_name: "",
        last_name: "",
        first_name_th: null,
        last_name_th: null,
        first_name_en: null,
        last_name_en: null,
      })
    ).toBeNull();
  });

  it("EMP-SCHEMA-006 payroll join remains normalized and company scoped", async () => {
    const source = await Bun.file(payrollSourceUrl).text();
    expect(source).toContain(
      "UPPER(TRIM(a.employee_code)) = UPPER(TRIM(e.emp_code))"
    );
    expect(source).toContain("e.company_id = ${companyId}");
  });

  it("EMP-SCHEMA-007 CYD1096 mock profile resolves as FOUND", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1096"],
      queryClient([mockProfile("CYD1096")])
    );
    expect(result.get("CYD1096")?.status).toBe("FOUND");
  });

  it("EMP-SCHEMA-008 CYD1909 mock profile resolves as FOUND", async () => {
    const result = await resolveCompanyEmployeeProfiles(
      39,
      ["CYD1909"],
      queryClient([mockProfile("CYD1909")])
    );
    expect(result.get("CYD1909")?.status).toBe("FOUND");
  });

  it("EMP-SCHEMA-009 runtime employee resolution does not use legacy mapping", async () => {
    const source = [
      await Bun.file(payrollSourceUrl).text(),
      await Bun.file(resolverSourceUrl).text(),
    ].join("\n");
    expect(source).not.toContain("employee_code_mapping");
  });

  it("EMP-SCHEMA-010 raw queries preserve NOT_FOUND and normalized-code behavior", async () => {
    const payrollSource = await Bun.file(payrollSourceUrl).text();
    const resolverSource = await Bun.file(resolverSourceUrl).text();
    expect(payrollSource).toContain("AS employee_profile_status");
    expect(payrollSource).toContain("THEN 'NOT_FOUND'");
    expect(resolverSource).toContain("UPPER(TRIM(emp_code))");
    expect(resolverSource).toContain("WHERE company_id = ${companyId}");
  });
});
