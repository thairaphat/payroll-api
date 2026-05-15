import { Elysia, t } from "elysia";
import {
  payrollSummaryController,
  payrollByEmployeeController,
} from "./payroll.controller";
import { requireRole } from "../../middlewares/auth.middleware";
import { lockPayrollPeriod } from "../attendance/approval.service";

const payrollLockBody = t.Object({
  date: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  endDate: t.Optional(t.String()),
  sourceSheetId: t.Optional(t.String()),
});

export const payrollRoute = new Elysia({ prefix: "/payroll" })
  .post("/lock", async ({ body, set }) => {
    try {
      return await lockPayrollPeriod(body as any);
    } catch (error) {
      set.status = 400;
      return {
        success: false,
        message: error instanceof Error ? error.message : "Lock payroll failed",
      };
    }
  }, {
    beforeHandle: requireRole(["admin", "accounting"]),
    body: payrollLockBody,
  })
  .get("/", payrollSummaryController, {
    beforeHandle: requireRole(["admin", "hr", "accounting"]),
  })
  .get("/:employeeCode", payrollByEmployeeController, {
    beforeHandle: requireRole(["admin", "hr", "accounting"]),
  });
