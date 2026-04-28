import { Elysia } from "elysia";
import {
  listEmployees,
  listEmployeesByCompany,
} from "./employee.controller";

export const employeeRoute = new Elysia({ prefix: "/employees" })

  .get("/", async () => {
    try {
      return {
        status: "success",
        data: await listEmployees(),
      };
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลพนักงานไม่สำเร็จ",
      };
    }
  })

  .get("/company/:id", async ({ params }) => {
    try {
      return {
        status: "success",
        data: await listEmployeesByCompany(params.id),
      };
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลพนักงานตามบริษัทไม่สำเร็จ",
      };
    }
  })
  
  ;