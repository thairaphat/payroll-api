import { describe, expect, it } from "bun:test";
import {
  employeeProfileWhere,
  serializeEmployeeDebtAmount,
} from "../modules/employees/employee.service";

const employeeServiceUrl = new URL(
  "../modules/employees/employee.service.ts",
  import.meta.url
);

describe("employee accumulated debt contract", () => {
  it("EMP-AMOUNT-001 serializes a real non-zero profile debt", () => {
    expect(serializeEmployeeDebtAmount("372.00")).toBe(372);
  });

  it("EMP-AMOUNT-002 serializes a nullable debt as zero", () => {
    expect(serializeEmployeeDebtAmount(null)).toBe(0);
  });

  it("EMP-AMOUNT-006 keeps the employee profile query company scoped", () => {
    expect(employeeProfileWhere(39)).toEqual({ company_id: 39 });
    expect(employeeProfileWhere(null)).toEqual({});
  });

  it("EMP-AMOUNT-007 reads debt from the full employee profile identity", async () => {
    const source = await Bun.file(employeeServiceUrl).text();
    const employeeListPath = source.slice(
      source.indexOf("export async function getAllEmployees"),
      source.indexOf("export async function getEmployeesByCompany")
    );
    expect(employeeListPath).toContain(
      "prisma.employee_document_profiles.findMany"
    );
    expect(employeeListPath).toContain("debt_amount: true");
    expect(employeeListPath).not.toContain("employee_code_mapping");
    expect(employeeListPath).not.toContain(".slice(");
  });

  it("EMP-AMOUNT-008 does not mix draft payroll into profile debt", async () => {
    const source = await Bun.file(employeeServiceUrl).text();
    expect(source).not.toContain("approval_status");
    expect(source).not.toContain("includeDraft");
  });

  it("EMP-AMOUNT-009 does not substitute approved payroll income for debt", async () => {
    const source = await Bun.file(employeeServiceUrl).text();
    expect(source).not.toContain("payroll_snapshots");
    expect(source).not.toContain("net_income");
    expect(source).not.toContain("net_pay");
  });
});
