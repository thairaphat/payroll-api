import type { Context } from "elysia";
import {
  getPayrollSummary,
  getPayrollByEmployeeCode,
} from "./payroll.service";

export const payrollSummaryController = async () => {
  const data = await getPayrollSummary();

  return {
    success: true,
    data,
  };
};

export const payrollByEmployeeController = async (context: Context) => {
  const employeeCode = context.params.employeeCode;

  if (!employeeCode) {
    context.set.status = 400;

    return {
      success: false,
      message: "employeeCode is required",
    };
  }

  const data = await getPayrollByEmployeeCode(employeeCode);

  if (!data) {
    context.set.status = 404;

    return {
      success: false,
      message: "Employee payroll not found",
    };
  }

  return {
    success: true,
    data,
  };
};