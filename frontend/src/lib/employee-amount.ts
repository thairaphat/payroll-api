export type EmployeeDebtValue = number | string | null | undefined;

export type EmployeeWithDebt = {
  debt_amount?: EmployeeDebtValue;
};

/**
 * The Employees screen displays profile debt, not payroll income.
 * MariaDB DECIMAL values can arrive as either JSON numbers or strings.
 */
export function normalizeEmployeeDebtAmount(value: EmployeeDebtValue): number {
  if (value == null || value === "") return 0;

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function sumEmployeeDebt(employees: readonly EmployeeWithDebt[]): number {
  return employees.reduce(
    (total, employee) =>
      total + normalizeEmployeeDebtAmount(employee.debt_amount),
    0
  );
}
