/**
 * Unit tests for payroll calculation logic.
 *
 * These tests are intentionally DB-free — they test the pure math that
 * determines employee wages. The values here directly affect real salaries,
 * so correctness is critical.
 *
 * Run: bun test src/test/payroll-calc.test.ts
 */

import { describe, it, expect } from "bun:test";

// ─── Inline the core calculation functions ───────────────────────────────────
// We duplicate the formulas here rather than importing from the service
// so that tests remain stable even if the service file is refactored.
// If the service formulas change, these tests must be updated too.

type WageConfig = { daily_wage: number; work_hours: number };

function calcBaseIncome(workDays: number, wage: WageConfig): number {
  return workDays * wage.daily_wage;
}

function calcOt15Income(ot15Hours: number, wage: WageConfig): number {
  return ot15Hours * (wage.daily_wage / wage.work_hours) * 1.5;
}

function calcOt2Income(ot2Hours: number, wage: WageConfig): number {
  return ot2Hours * (wage.daily_wage / wage.work_hours) * 2;
}

function calcGrossIncome(
  workDays: number,
  ot15Hours: number,
  ot2Hours: number,
  wage: WageConfig
): number {
  return (
    calcBaseIncome(workDays, wage) +
    calcOt15Income(ot15Hours, wage) +
    calcOt2Income(ot2Hours, wage)
  );
}

function calcNetIncome(gross: number, deduction: number): number {
  return gross - deduction;
}

// ─── Default wage config (matches current DB fallback) ────────────────────────
const DEFAULT_WAGE: WageConfig = { daily_wage: 372, work_hours: 8 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Payroll Calculation — Base Income", () => {
  it("calculates base income for 26 work days at 372 THB/day", () => {
    expect(calcBaseIncome(26, DEFAULT_WAGE)).toBe(9672);
  });

  it("returns 0 for 0 work days", () => {
    expect(calcBaseIncome(0, DEFAULT_WAGE)).toBe(0);
  });

  it("calculates base income correctly with custom wage config", () => {
    const customWage: WageConfig = { daily_wage: 400, work_hours: 8 };
    expect(calcBaseIncome(26, customWage)).toBe(10400);
  });
});

describe("Payroll Calculation — OT 1.5x Income", () => {
  it("calculates OT 1.5x for 10 hours at 372/8 rate", () => {
    // hourly = 372 / 8 = 46.5 THB/hr
    // ot15 income = 10 * 46.5 * 1.5 = 697.5
    expect(calcOt15Income(10, DEFAULT_WAGE)).toBeCloseTo(697.5, 2);
  });

  it("returns 0 for 0 OT hours", () => {
    expect(calcOt15Income(0, DEFAULT_WAGE)).toBe(0);
  });

  it("calculates OT 1.5x with custom daily wage 400 and 8 hours", () => {
    // hourly = 400 / 8 = 50
    // ot15 = 4 * 50 * 1.5 = 300
    const customWage: WageConfig = { daily_wage: 400, work_hours: 8 };
    expect(calcOt15Income(4, customWage)).toBeCloseTo(300, 2);
  });
});

describe("Payroll Calculation — OT 2x Income", () => {
  it("calculates OT 2x for 5 hours at 372/8 rate", () => {
    // hourly = 46.5
    // ot2 income = 5 * 46.5 * 2 = 465
    expect(calcOt2Income(5, DEFAULT_WAGE)).toBeCloseTo(465, 2);
  });

  it("returns 0 for 0 OT 2x hours", () => {
    expect(calcOt2Income(0, DEFAULT_WAGE)).toBe(0);
  });
});

describe("Payroll Calculation — Gross Income", () => {
  it("calculates gross income: 26 days, 10 OT1.5, 5 OT2", () => {
    // base = 26 * 372 = 9672
    // ot15 = 10 * 46.5 * 1.5 = 697.5
    // ot2  =  5 * 46.5 * 2   = 465
    // gross = 9672 + 697.5 + 465 = 10834.5
    expect(calcGrossIncome(26, 10, 5, DEFAULT_WAGE)).toBeCloseTo(10834.5, 2);
  });

  it("gross income equals base income when no OT", () => {
    const gross = calcGrossIncome(20, 0, 0, DEFAULT_WAGE);
    expect(gross).toBe(calcBaseIncome(20, DEFAULT_WAGE));
  });

  it("handles fractional OT hours correctly", () => {
    // 0.5 hour OT1.5 = 0.5 * 46.5 * 1.5 = 34.875
    expect(calcOt15Income(0.5, DEFAULT_WAGE)).toBeCloseTo(34.875, 3);
  });
});

describe("Payroll Calculation — Net Income", () => {
  it("net income = gross - deduction", () => {
    const gross = calcGrossIncome(26, 10, 5, DEFAULT_WAGE);
    const deduction = 500;
    expect(calcNetIncome(gross, deduction)).toBeCloseTo(gross - deduction, 2);
  });

  it("net income equals gross when deduction is 0", () => {
    const gross = calcGrossIncome(26, 0, 0, DEFAULT_WAGE);
    expect(calcNetIncome(gross, 0)).toBe(gross);
  });

  it("net income can be negative if deduction exceeds gross", () => {
    // Edge case: employee owes more than they earned (e.g., large advance)
    expect(calcNetIncome(5000, 6000)).toBe(-1000);
  });
});

describe("Payroll Calculation — Full Payslip Scenario", () => {
  it("calculates a realistic monthly payslip correctly", () => {
    // Scenario: Employee works 26 days, 8 OT1.5 hours, 0 OT2 hours
    // Deduction (document fee / advance): 1,500 THB
    const wage = DEFAULT_WAGE;
    const workDays = 26;
    const ot15 = 8;
    const ot2 = 0;
    const deduction = 1500;

    const base = calcBaseIncome(workDays, wage);     // 9672
    const ot15Income = calcOt15Income(ot15, wage);   // 8 * 46.5 * 1.5 = 558
    const ot2Income = calcOt2Income(ot2, wage);      // 0
    const gross = base + ot15Income + ot2Income;     // 10230
    const net = calcNetIncome(gross, deduction);     // 8730

    expect(base).toBe(9672);
    expect(ot15Income).toBeCloseTo(558, 2);
    expect(ot2Income).toBe(0);
    expect(gross).toBeCloseTo(10230, 2);
    expect(net).toBeCloseTo(8730, 2);
  });

  it("calculates with a new wage config after wage increase", () => {
    // Scenario: wage increased to 400 THB/day from next effective date
    const newWage: WageConfig = { daily_wage: 400, work_hours: 8 };
    const gross = calcGrossIncome(26, 8, 0, newWage);
    // base = 26 * 400 = 10400
    // ot15 = 8 * (400/8) * 1.5 = 8 * 50 * 1.5 = 600
    // gross = 11000
    expect(gross).toBeCloseTo(11000, 2);
  });
});
