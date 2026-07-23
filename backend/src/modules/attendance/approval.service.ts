import { prisma } from "../../db";
import { APPROVAL_STATUS } from "../../constants/attendance";
import type { AuthUser } from "../../middlewares/auth.middleware";
import { logAudit } from "../../services/audit.service";
import { getCompanyEmployeeCodes } from "../../services/company-scope.service";

type DateRangeInput = {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function buildDateWhere(input: DateRangeInput) {
  if (input.date) {
    return { work_date: toDate(input.date) };
  }

  if (input.startDate && input.endDate) {
    return {
      work_date: {
        gte: toDate(input.startDate),
        lte: toDate(input.endDate),
      },
    };
  }

  throw new Error("date or startDate/endDate is required");
}

function buildScopeWhere(input: DateRangeInput) {
  return {
    ...buildDateWhere(input),
    ...(input.sourceSheetId ? { source_sheet_id: input.sourceSheetId } : {}),
  };
}

export async function submitAttendance(input: DateRangeInput, user: AuthUser, companyId: number) {
  const codes = await getCompanyEmployeeCodes(companyId);
  if (codes.length === 0) throw new Error("No employees are available in this company scope.");
  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      approval_status: APPROVAL_STATUS.DRAFT,
      payroll_locked_at: null,
      employee_code: { in: codes },
      ...(user.role === "field_staff" ? { created_by: Number(user.id) } : {}),
    },
    data: {
      approval_status: APPROVAL_STATUS.SUBMITTED,
    },
  });

  await logAudit("attendance.submit", "attendance_period", input, user, {
    updated: result.count,
  });

  return { success: true, updated: result.count };
}

export async function approveAttendance(input: DateRangeInput, user: AuthUser, companyId: number) {
  const codes = await getCompanyEmployeeCodes(companyId);
  if (codes.length === 0) throw new Error("No employees are available in this company scope.");
  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      approval_status: APPROVAL_STATUS.SUBMITTED,
      payroll_locked_at: null,
      employee_code: { in: codes },
    },
    data: {
      approval_status: APPROVAL_STATUS.APPROVED,
      approved_by: user.id ? Number(user.id) : null,
      approved_at: new Date(),
    },
  });

  await logAudit("attendance.approve", "attendance_period", input, user, {
    updated: result.count,
  });

  return { success: true, updated: result.count };
}

export async function lockPayrollPeriod(input: DateRangeInput, companyId?: number | null) {
  let codeFilter: { in: string[] } | undefined;
  if (companyId != null) {
    const codes = await getCompanyEmployeeCodes(companyId);
    codeFilter = { in: codes };
  }

  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      ...(codeFilter ? { employee_code: codeFilter } : {}),
      approval_status: APPROVAL_STATUS.APPROVED,
      payroll_locked_at: null,
    },
    data: {
      payroll_locked_at: new Date(),
    },
  });

  return { success: true, locked: result.count };
}
