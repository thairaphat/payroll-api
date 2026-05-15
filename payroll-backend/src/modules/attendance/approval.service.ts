import { prisma } from "../../db";
import type { AuthUser } from "../../middlewares/auth.middleware";

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

export async function submitAttendance(input: DateRangeInput, user: AuthUser) {
  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      approval_status: "draft",
      payroll_locked_at: null,
      ...(user.role === "field_staff" ? { created_by: Number(user.id) } : {}),
    },
    data: {
      approval_status: "submitted",
    },
  });

  return { success: true, updated: result.count };
}

export async function approveAttendance(input: DateRangeInput, user: AuthUser) {
  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      approval_status: "submitted",
      payroll_locked_at: null,
    },
    data: {
      approval_status: "approved",
      approved_by: user.id ? Number(user.id) : null,
      approved_at: new Date(),
    },
  });

  return { success: true, updated: result.count };
}

export async function lockPayrollPeriod(input: DateRangeInput) {
  const result = await prisma.attendance_records.updateMany({
    where: {
      ...buildScopeWhere(input),
      approval_status: "approved",
      payroll_locked_at: null,
    },
    data: {
      payroll_locked_at: new Date(),
    },
  });

  return { success: true, locked: result.count };
}
