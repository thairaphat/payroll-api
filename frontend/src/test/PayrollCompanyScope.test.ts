import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  canViewAllPayrollRecords,
  parsePayrollCompanyId,
  payrollQueryKey,
} from "@/services/payroll.service";

const payrollSourcePath = path.resolve(process.cwd(), "src/pages/Payroll.tsx");
const readPayrollSource = () => readFile(payrollSourcePath, "utf8");

describe("cyd_admin payroll company selection", () => {
  it("CYD-PAY-005 changes the query key when company changes", () => {
    const base = {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      scope: "ready" as const,
      language: "dual",
      paymentDate: "2026-07-31",
    };
    expect(payrollQueryKey({ ...base, companyId: "16" })).not.toEqual(
      payrollQueryKey({ ...base, companyId: "18" })
    );
  });

  it("CYD-PAY-006 refetches through a company-specific React Query key", async () => {
    const source = await readPayrollSource();
    expect(source).toContain("queryKey: payrollQueryKey({");
    expect(source).toContain("companyId: selectedCompanyId");
    expect(source).toContain("companyId: isCydAdmin ? selectedCompanyNumber : undefined");
  });

  it("CYD-PAY-009 exposes All Records and the informative draft-only state", async () => {
    expect(canViewAllPayrollRecords("cyd_admin")).toBe(true);
    const source = await readPayrollSource();
    expect(source).toContain("ยังไม่มีรายการที่พร้อมทำเงินเดือน พบรายการฉบับร่างจำนวน");
    expect(source).toContain("กรุณาอนุมัติหรือเปลี่ยน Scope เป็น All Records");
  });

  it("CYD-PAY-010 parses a selected company string as an integer", () => {
    expect(parsePayrollCompanyId("40")).toBe(40);
  });

  it("CYD-PAY-011 rejects invalid selected company values", () => {
    expect(parsePayrollCompanyId("")).toBeUndefined();
    expect(parsePayrollCompanyId("NaN")).toBeUndefined();
    expect(parsePayrollCompanyId("0")).toBeUndefined();
    expect(parsePayrollCompanyId("-1")).toBeUndefined();
  });

  it("CYD-PAY-012 creates all PDFs only from the scoped list rows", async () => {
    const source = await readPayrollSource();
    expect(source).toContain("for (let i = 0; i < filteredRows.length; i++)");
    expect(source).toContain("renderSlipElementForPdf(filteredRows[i])");
  });

  it("CYD-PAY-013 opens payslip detail only from a scoped table row", async () => {
    const source = await readPayrollSource();
    expect(source).toContain("filteredRows.map((row)");
    expect(source).toContain("setSelectedSlip(row)");
    expect(source).toContain(
      "setSelectedSlip(null);\n    setIsPreviewOpen(false);"
    );
  });

  it("CYD-PAY-014 renders an API error and retry instead of a silent zero", async () => {
    const source = await readPayrollSource();
    expect(source).toContain("<PayrollErrorNotice error={payrollError}");
    expect(source).toContain("onClick={() => refetchPayroll()}");
    expect(source).toContain("ลองใหม่");
  });

  it("CYD-PAY-015 prevents an old company response from sharing the new key", () => {
    const companyA = payrollQueryKey({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      scope: "all",
      companyId: "16",
      language: "dual",
      paymentDate: "2026-07-31",
    });
    const companyB = payrollQueryKey({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      scope: "all",
      companyId: "18",
      language: "dual",
      paymentDate: "2026-07-31",
    });
    expect(companyA[4]).toBe("16");
    expect(companyB[4]).toBe("18");
    expect(companyA).not.toEqual(companyB);
  });
});
