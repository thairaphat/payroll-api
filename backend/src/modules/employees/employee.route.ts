import { Elysia } from "elysia";
import {
  listEmployees,
  listEmployeesByCompany,
  listCompanies,
  createManualEmployee,
} from "./employee.controller";
import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import {
  CompanyScopeError,
  resolveCompanyScope,
} from "../../services/company-scope.service";
import { logRequiredAudit } from "../../services/audit.service";

const employeesAccess = requireRole(["cyd_admin", "admin", "hr"]);

function scopeError(error: unknown, set: { status?: number | string }) {
  if (error instanceof CompanyScopeError) {
    set.status = error.status;
    return { status: "error", message: error.message };
  }
  throw error;
}

export const employeeRoute = new Elysia({ prefix: "/employees" })
  .get(
    "/",
    async ({ request, jwt, set, query }: any) => {
      try {
        const user = await getAuthUser(request, jwt);
        if (!user) {
          set.status = 401;
          return { status: "error", message: "Authentication required" };
        }
        const scope = await resolveCompanyScope(user, query?.companyId, {
          endpoint: "/employees",
          method: "GET",
          requestId:
            request.headers.get("x-request-id") ?? crypto.randomUUID(),
        });
        return { status: "success", data: await listEmployees(scope) };
      } catch (error) {
        return scopeError(error, set);
      }
    },
    { beforeHandle: employeesAccess }
  )
  .get(
    "/companies",
    async ({ request, jwt, set }: any) => {
      try {
        const user = await getAuthUser(request, jwt);
        if (!user) {
          set.status = 401;
          return { ok: false, message: "Authentication required" };
        }
        if (user.role === "cyd_admin") {
          await logRequiredAudit(
            "company.scope.view",
            "company",
            {
              endpoint: "/employees/companies",
              method: "GET",
              requestId:
                request.headers.get("x-request-id") ?? crypto.randomUUID(),
            },
            user
          );
        }
        const companyId =
          user.role === "cyd_admin"
            ? undefined
            : await resolveCompanyScope(user);
        return { ok: true, data: await listCompanies(companyId) };
      } catch (error) {
        return scopeError(error, set);
      }
    },
    { beforeHandle: employeesAccess }
  )
  .get(
    "/company/:id",
    async ({ params, request, jwt, set }: any) => {
      try {
        const user = await getAuthUser(request, jwt);
        if (!user) {
          set.status = 401;
          return { status: "error", message: "Authentication required" };
        }
        const scope = await resolveCompanyScope(user, params.id, {
          endpoint: "/employees/company/:id",
          method: "GET",
          requestId:
            request.headers.get("x-request-id") ?? crypto.randomUUID(),
        });
        return {
          status: "success",
          data: await listEmployeesByCompany(String(scope)),
        };
      } catch (error) {
        return scopeError(error, set);
      }
    },
    { beforeHandle: employeesAccess }
  )
  .get(
    "/unmapped",
    ({ set }) => {
      set.status = 410;
      return {
        status: "deprecated",
        message:
          "Unmapped attendance is disabled until attendance_records has company_id.",
      };
    },
    { beforeHandle: employeesAccess }
  )
  .post(
    "/mapping",
    ({ set }) => {
      set.status = 410;
      return {
        status: "deprecated",
        message: "employee_code_mapping is no longer supported.",
      };
    },
    { beforeHandle: requireRole(["admin", "hr"]) }
  )
  .post(
    "/manual",
    async ({ body }: any) => ({
      status: "success",
      data: await createManualEmployee(body),
    }),
    { beforeHandle: employeesAccess }
  )
  .post(
    "/import-master",
    ({ set }) => {
      set.status = 410;
      return {
        status: "deprecated",
        message:
          "Google Sheets are attendance-only; employee master import is disabled.",
      };
    },
    { beforeHandle: requireRole(["admin", "hr"]) }
  );
