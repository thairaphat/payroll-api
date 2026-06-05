import { Elysia } from "elysia";
import {
  listEmployees,
  listEmployeesByCompany,
  listCompanies,
  listUnmappedAttendance,
  createMapping,
  createManualEmployee,
} from "./employee.controller";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import { getCompanyScope } from "../../services/company-scope.service";

const employeesAccess = requireRole(["admin", "hr"]);

export const employeeRoute = new Elysia({ prefix: "/employees" })

  .get("/", async ({ request, jwt, set }: any) => {
    try {
      const user = await getAuthUser(request, jwt);
      const scope = user ? getCompanyScope(user) : "deny";
      if (scope === "deny") {
        set.status = 403;
        return { status: "error", message: "No company assigned to your account. Contact your administrator." };
      }
      return {
        status: "success",
        data: await listEmployees(scope !== null ? scope : undefined),
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
  }, { beforeHandle: employeesAccess })

  .get("/companies", async () => {
    try {
      return {
        ok: true,
        data: await listCompanies(),
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลบริษัทไม่สำเร็จ",
      };
    }
  }, { beforeHandle: employeesAccess })

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
  }, { beforeHandle: employeesAccess })

  .get("/unmapped", async () => {
    try {
      return {
        status: "success",
        data: await listUnmappedAttendance(),
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "โหลดข้อมูล Attendance ที่ยังไม่ได้ Map ไม่สำเร็จ",
      };
    }
  }, { beforeHandle: employeesAccess })

  .post("/mapping", async ({ body }) => {
    try {
      return {
        status: "success",
        data: await createMapping(body as any),
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "สร้าง Mapping ไม่สำเร็จ",
      };
    }
  }, { beforeHandle: employeesAccess })

  .post("/manual", async ({ body, set }) => {
    try {
      return {
        status: "success",
        data: await createManualEmployee(body as any),
      };
    } catch (error: any) {
      if (error.status) set.status = error.status;
      return {
        status: "error",
        message: error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ",
      };
    }
  }, { beforeHandle: employeesAccess })
  
  ;
