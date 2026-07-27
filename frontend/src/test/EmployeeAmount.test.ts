import { describe, expect, it } from "vitest";
import {
  normalizeEmployeeDebtAmount,
  sumEmployeeDebt,
} from "@/lib/employee-amount";
import { formatTHB } from "@/services/payroll.service";

describe("Employees accumulated debt display", () => {
  it("EMP-AMOUNT-003 maps the API debt_amount field without renaming it", () => {
    const response = { debt_amount: "125.50" };
    expect(normalizeEmployeeDebtAmount(response.debt_amount)).toBe(125.5);
  });

  it("EMP-AMOUNT-004 formats a Decimal string as Thai baht", () => {
    expect(formatTHB(normalizeEmployeeDebtAmount("372.00"))).toBe("฿372.00");
  });

  it("EMP-AMOUNT-005 totals exactly the employee rows being displayed", () => {
    const employees = [
      { debt_amount: "100.25" },
      { debt_amount: 200 },
      { debt_amount: null },
    ];
    expect(sumEmployeeDebt(employees)).toBe(300.25);
  });

  it("EMP-AMOUNT-010 defines and tests the missing-field fallback", () => {
    expect(normalizeEmployeeDebtAmount(undefined)).toBe(0);
  });
});
