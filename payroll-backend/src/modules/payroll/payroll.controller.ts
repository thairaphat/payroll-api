import type { Context } from "elysia";
import {
  getPayrollSummary,
  getPayrollByEmployeeCode,
  type PayrollDateRange,
} from "./payroll.service";
import { getAuthUser } from "../../middlewares/auth.middleware";

function currentMonthRange(): PayrollDateRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getRangeFromQuery(query: any): PayrollDateRange {
  if (query?.startDate && query?.endDate) {
    return {
      startDate: String(query.startDate),
      endDate: String(query.endDate),
    };
  }

  return currentMonthRange();
}

export const payrollSummaryController = async (context: Context) => {
  const user = await getAuthUser(context.request, (context as any).jwt);
  const includeDraftParam = context.query?.includeDraft === "true";
  
  // Rule: only admin/hr can use includeDraft=true
  const canSeeDraft = user?.role === "admin" || user?.role === "hr";
  const includeDraft = includeDraftParam && canSeeDraft;

  const range = getRangeFromQuery(context.query);
  const data = await getPayrollSummary(range, includeDraft);

  return {
    success: true,
    range,
    data,
    includeDraft,
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

  const user = await getAuthUser(context.request, (context as any).jwt);
  const includeDraftParam = context.query?.includeDraft === "true";
  
  // Rule: only admin/hr can use includeDraft=true
  const canSeeDraft = user?.role === "admin" || user?.role === "hr";
  const includeDraft = includeDraftParam && canSeeDraft;

  const range = getRangeFromQuery(context.query);
  const data = await getPayrollByEmployeeCode(employeeCode, range, includeDraft);

  if (!data) {
    context.set.status = 404;

    return {
      success: false,
      message: "Employee payroll not found",
    };
  }

  return {
    success: true,
    range,
    data,
    includeDraft,
  };
};
