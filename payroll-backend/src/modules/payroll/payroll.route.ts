import { Elysia } from "elysia";
import {
  payrollSummaryController,
  payrollByEmployeeController,
} from "./payroll.controller";

export const payrollRoute = new Elysia({ prefix: "/payroll" })
  .get("/", payrollSummaryController)
  .get("/:employeeCode", payrollByEmployeeController);