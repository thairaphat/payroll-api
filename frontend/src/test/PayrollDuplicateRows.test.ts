import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const payrollPage = readFileSync(
  path.resolve(process.cwd(), "src/pages/Payroll.tsx"),
  "utf8"
);

describe("Payroll duplicate row frontend contract", () => {
  it("PAY-DUP-012 renders one table row for each API payroll item", () => {
    expect(payrollPage).toContain("filteredRows.map((row) =>");
    expect(payrollPage).toContain('<tr key={row.employee_code}');
    expect(payrollPage).not.toContain("new Map(rows");
  });

  it("PAY-DUP-014 refetch replaces query data instead of appending it", () => {
    expect(payrollPage).toContain("data: rows = []");
    expect(payrollPage).not.toContain("setRows(");
    expect(payrollPage).not.toContain("rows.concat");
  });

  it("PAY-DUP-015 list, preview, and PDF use the same payroll item", () => {
    expect(payrollPage).toContain("setSelectedSlip(row)");
    expect(payrollPage).toContain("handleDownloadRow(row)");
    expect(payrollPage).toContain("renderSlipElementForPdf(filteredRows[i])");
  });
});
