import type { Context } from "elysia";
import {
  getPayrollSummary,
  getPayrollByEmployeeCode,
  PayrollDataIntegrityError,
  type PayrollDateRange,
} from "./payroll.service";
import { getAuthUser } from "../../middlewares/auth.middleware";
import { CompanyScopeError, resolveCompanyScope } from "../../services/company-scope.service";
import { logRouteEnter, logApiError } from "../../diag";
import { WageConfigError } from "../../services/wage-config.service";

export function companyWageErrorPayload(
  error: WageConfigError,
  companyId: number
) {
  return {
    code: error.code,
    message: error.message,
    companyId,
  };
}

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

export function canIncludeDraftPayroll(role: string | undefined) {
  return role === "cyd_admin" || role === "admin" || role === "hr";
}

export const payrollSummaryController = async (context: Context) => {
  const user = await getAuthUser(context.request, (context as any).jwt);
  logRouteEnter("/payroll", user);

  if (!user) { (context as any).set.status = 401; return { success: false, message: "Authentication required" }; }
  let scope: number;
  try {
    scope = await resolveCompanyScope(user, context.query?.companyId as string | undefined, {
      endpoint: "/payroll", method: "GET",
      requestId: context.request.headers.get("x-request-id") ?? crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof CompanyScopeError) { (context as any).set.status = error.status; return { success: false, message: error.message }; }
    throw error;
  }

  const includeDraftParam = context.query?.includeDraft === "true";
  const canSeeDraft = canIncludeDraftPayroll(user?.role);
  const includeDraft = includeDraftParam && canSeeDraft;

  const range = getRangeFromQuery(context.query);
  console.log(`[payroll] step=getPayrollSummary startDate=${range.startDate} endDate=${range.endDate} includeDraft=${includeDraft} companyId=${scope}`);

  let data: any;
  try {
    data = await getPayrollSummary(range, includeDraft, scope);
    console.log(`[payroll] step=getPayrollSummary rowCount=${Array.isArray(data) ? data.length : "?"}`);
  } catch (err) {
    logApiError("/payroll", user, err, `step=getPayrollSummary startDate=${range.startDate} endDate=${range.endDate} companyId=${scope}`);
    if (err instanceof WageConfigError) {
      (context as any).set.status = err.status;
      return companyWageErrorPayload(err, scope);
    }
    if (err instanceof PayrollDataIntegrityError) {
      (context as any).set.status = err.status;
      return {
        success: false,
        code: err.code,
        message: err.message,
        employeeCodes: err.employeeCodes,
      };
    }
    throw err;
  }

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
    return { success: false, message: "employeeCode is required" };
  }

  const user = await getAuthUser(context.request, (context as any).jwt);
  if (!user) { (context as any).set.status = 401; return { success: false, message: "Authentication required" }; }
  let scope: number;
  try {
    scope = await resolveCompanyScope(user, context.query?.companyId as string | undefined, {
      endpoint: "/payroll/:employeeCode", method: "GET",
      requestId: context.request.headers.get("x-request-id") ?? crypto.randomUUID(),
    });
  } catch (error) {
    if (error instanceof CompanyScopeError) { (context as any).set.status = error.status; return { success: false, message: error.message }; }
    throw error;
  }

  const includeDraftParam = context.query?.includeDraft === "true";
  const canSeeDraft = canIncludeDraftPayroll(user?.role);
  const includeDraft = includeDraftParam && canSeeDraft;

  const range = getRangeFromQuery(context.query);
  let data: Awaited<ReturnType<typeof getPayrollByEmployeeCode>>;
  try {
    data = await getPayrollByEmployeeCode(employeeCode, range, includeDraft, scope);
  } catch (error) {
    if (error instanceof WageConfigError) {
      (context as any).set.status = error.status;
      return companyWageErrorPayload(error, scope);
    }
    if (error instanceof PayrollDataIntegrityError) {
      (context as any).set.status = error.status;
      return {
        success: false,
        code: error.code,
        message: error.message,
        employeeCodes: error.employeeCodes,
      };
    }
    throw error;
  }

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
