import { Elysia, t } from "elysia";
import {
  payrollSummaryController,
  payrollByEmployeeController,
} from "./payroll.controller";
import { requireRole, getAuthUser } from "../../middlewares/auth.middleware";
import { getCompanyScope } from "../../services/company-scope.service";
import { lockPayrollPeriod } from "../attendance/approval.service";
import { getPayrollSummaryLive, type PayrollDateRange } from "./payroll.service";
import { getActiveWageConfig, WageConfigError } from "../../services/wage-config.service";
import { logAudit } from "../../services/audit.service";
import { prisma } from "../../db";

const payrollLockBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

export const payrollRoute = new Elysia({ prefix: "/payroll" })
  .post("/lock", async (context: any) => {
    const { body, set, request, jwt } = context;
    try {
      const input = body as {
        date?: string;
        startDate?: string;
        endDate?: string;
        sourceSheetId?: string;
      };

      // Resolve period range from input
      const periodStart = input.date ?? input.startDate;
      const periodEnd = input.date ?? input.endDate;

      if (!periodStart) {
        set.status = 400;
        return { success: false, message: "date or startDate is required" };
      }

      const range: PayrollDateRange = {
        startDate: periodStart,
        endDate: periodEnd ?? periodStart,
      };

      // Step 1: Get current user and derive company scope
      const user = await getAuthUser(request, jwt);
      const lockScope = user ? getCompanyScope(user) : null;
      if (lockScope === "deny" || lockScope === null) {
        set.status = 403;
        return { success: false, message: "A company assignment is required to lock payroll." };
      }
      const lockCompanyId = lockScope;

      // Step 2: Fail before locking when this company has no active wage config.
      const companyWageConfig = await getActiveWageConfig(lockCompanyId);

      // Step 3: Calculate payroll BEFORE locking (per-company wages applied internally).
      const payrollRows = await getPayrollSummaryLive(range, lockCompanyId);
      if (payrollRows.length === 0) {
        set.status = 422;
        return { success: false, message: "No eligible employees or approved attendance found in this company scope." };
      }

      // Step 4: Lock attendance records (sets payroll_locked_at on APPROVED records)
      const lockResult = await lockPayrollPeriod(input, lockCompanyId);

      // Step 5: Persist immutable payroll snapshot if any records were locked
      let snapshotsSaved = 0;
      if (lockResult.locked > 0 && payrollRows.length > 0) {
        // Always derive lock_key from the normalized range so it matches
        // the key used by getPayrollSummary/getPayrollByEmployeeCode on read.
        const lockKey = `${range.startDate}_${range.endDate}`;

        const snapshotData = payrollRows.map((row) => ({
          lock_key: lockKey,
          period_start: new Date(`${range.startDate}T00:00:00.000Z`),
          period_end: new Date(`${range.endDate}T00:00:00.000Z`),
          source_sheet_id: input.sourceSheetId ?? null,
          employee_code: row.employee_code ?? (row as any).employeeCode ?? "",
          // Fallback chain: snake_case → camelCase → employee_code (never blank in snapshot)
          employee_name: row.employee_name || (row as any).employeeName || row.employee_code || (row as any).employeeCode || "",
          branch_code: row.branch_code ?? (row as any).branchCode ?? null,
          work_days: Number(row.work_days ?? 0),
          total_ot1: Number(row.total_ot1 ?? 0),
          total_ot15: Number(row.total_ot15 ?? 0),
          total_ot2: Number(row.total_ot2 ?? 0),
          total_ot_hours: Number(row.total_ot_hours ?? 0),
          // Per-company wage applied to this specific employee row
          daily_wage_used: Number((row as any).daily_wage_used),
          work_hours_used: Number((row as any).work_hours_used),
          base_income: Number(row.base_income ?? 0),
          ot15_income: Number(row.ot15_income ?? 0),
          ot2_income: Number(row.ot2_income ?? 0),
          gross_income: Number(row.gross_income ?? 0),
          deduction_amount: Number(row.deduction_amount ?? 0),
          net_income: Number(row.net_income ?? 0),
          locked_by_user_id: user?.id ? Number(user.id) : null,
          locked_by_username: user?.username ?? null,
        }));

        const createResult = await prisma.payroll_snapshots.createMany({
          data: snapshotData,
          skipDuplicates: true,
        });
        snapshotsSaved = createResult.count;
      }

      // Step 6: Audit log (non-blocking — errors are swallowed inside logAudit)
      await logAudit(
        "payroll.lock",
        "payroll_period",
        {
          startDate: range.startDate,
          endDate: range.endDate,
          sourceSheetId: input.sourceSheetId,
        },
        user,
        {
          locked_attendance: lockResult.locked,
          snapshots_saved: snapshotsSaved,
          // Exact company wage active at lock time.
          company_id: lockCompanyId,
          wage_config_id: companyWageConfig.id.toString(),
          daily_wage_used: companyWageConfig.daily_wage.toFixed(),
          work_hours_used: companyWageConfig.work_hours_per_day.toFixed(),
          ot1_multiplier: companyWageConfig.ot1_multiplier.toFixed(),
          ot15_multiplier: companyWageConfig.ot15_multiplier.toFixed(),
          ot2_multiplier: companyWageConfig.ot2_multiplier.toFixed(),
          ot3_multiplier: companyWageConfig.ot3_multiplier.toFixed(),
          per_company_wages_applied: true,
        }
      );

      return {
        success: true,
        locked: lockResult.locked,
        snapshots_saved: snapshotsSaved,
      };
    } catch (error) {
      set.status = error instanceof WageConfigError ? error.status : 400;
      return {
        success: false,
        ...(error instanceof WageConfigError ? { code: error.code } : {}),
        message: error instanceof Error ? error.message : "Lock payroll failed",
      };
    }
  }, {
    beforeHandle: requireRole(["admin", "accounting"]),
    body: payrollLockBody,
  })
  .get("/", payrollSummaryController, {
    beforeHandle: requireRole(["cyd_admin", "admin", "hr", "accounting"]),
  })
  .get("/:employeeCode", payrollByEmployeeController, {
    beforeHandle: requireRole(["cyd_admin", "admin", "hr", "accounting"]),
  });
