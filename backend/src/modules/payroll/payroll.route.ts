import { Elysia, t } from "elysia";
import {
  payrollSummaryController,
  payrollByEmployeeController,
} from "./payroll.controller";
import { requireRole, getAuthUser } from "../../middlewares/auth.middleware";
import {
  executePayrollLock,
  PayrollLockError,
} from "./payroll-lock.service";
import { WageConfigError } from "../../services/wage-config.service";

const payrollLockBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

export const payrollRoute = new Elysia({ prefix: "/payroll" })
  .post(
    "/lock",
    async ({ body, set, request, jwt }: any) => {
      const user = await getAuthUser(request, jwt);
      if (!user) {
        set.status = 401;
        return {
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required",
        };
      }

      try {
        return await executePayrollLock(body, user);
      } catch (error) {
        if (
          error instanceof PayrollLockError ||
          error instanceof WageConfigError
        ) {
          set.status = error.status;
          return {
            success: false,
            code: error.code,
            message: error.message,
          };
        }
        throw error;
      }
    },
    {
      beforeHandle: requireRole(["admin", "accounting"]),
      body: payrollLockBody,
    }
  )
  .get("/", payrollSummaryController, {
    beforeHandle: requireRole(["cyd_admin", "admin", "hr", "accounting"]),
  })
  .get("/:employeeCode", payrollByEmployeeController, {
    beforeHandle: requireRole(["cyd_admin", "admin", "hr", "accounting"]),
  });
