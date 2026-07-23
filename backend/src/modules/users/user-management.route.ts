import { Elysia, t } from "elysia";

import { getAuthUser, requireRole } from "../../middlewares/auth.middleware";
import { logRequiredAudit } from "../../services/audit.service";
import {
  COMPANY_ADMIN_USER_ROLES,
  UserManagementError,
  createManagedUser,
  listManagedUsers,
  updateManagedUser,
} from "./user-management.service";

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function handleError(error: unknown, set: { status?: number | string }) {
  if (error instanceof UserManagementError) {
    set.status = error.status;
    return { ok: false, message: error.message };
  }
  throw error;
}

const createBody = t.Object({
  username: t.String(),
  email: t.String(),
  password: t.String(),
  role: t.String(),
  companyId: t.Optional(t.Number()),
  fullName: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
});

export const userManagementRoute = new Elysia()
  .get("/admin/users", async ({ request, jwt, query, set }: any) => {
    try {
      const actor = await getAuthUser(request, jwt);
      if (!actor) { set.status = 401; return { ok: false, message: "Authentication required" }; }
      const id = requestId(request);
      await logRequiredAudit("company.scope.view", "user", {
        targetCompanyId: query.companyId ? Number(query.companyId) : undefined,
        endpoint: "/admin/users",
        method: "GET",
        requestId: id,
      }, actor);
      return { ok: true, data: await listManagedUsers(query.companyId) };
    } catch (error) {
      return handleError(error, set);
    }
  }, { beforeHandle: requireRole(["cyd_admin"]) })

  .post("/admin/users", async ({ request, jwt, body, set }: any) => {
    try {
      const actor = await getAuthUser(request, jwt);
      if (!actor) { set.status = 401; return { ok: false, message: "Authentication required" }; }
      return { ok: true, data: await createManagedUser(body, actor, requestId(request)) };
    } catch (error) {
      return handleError(error, set);
    }
  }, { body: createBody, beforeHandle: requireRole(["cyd_admin"]) })

  .patch("/admin/users/:id", async ({ request, jwt, params, body, set }: any) => {
    try {
      const actor = await getAuthUser(request, jwt);
      if (!actor) { set.status = 401; return { ok: false, message: "Authentication required" }; }
      return { ok: true, data: await updateManagedUser(params.id, body, actor, requestId(request)) };
    } catch (error) {
      return handleError(error, set);
    }
  }, {
    body: t.Object({
      email: t.Optional(t.String()),
      password: t.Optional(t.String()),
      role: t.Optional(t.String()),
      companyId: t.Optional(t.Number()),
      isActive: t.Optional(t.Boolean()),
    }),
    beforeHandle: requireRole(["cyd_admin"]),
  })

  .get("/company/users", async ({ request, jwt, set }: any) => {
    try {
      const actor = await getAuthUser(request, jwt);
      if (!actor?.companyId) { set.status = 403; return { ok: false, message: "Company assignment is required" }; }
      return { ok: true, data: await listManagedUsers(actor.companyId) };
    } catch (error) {
      return handleError(error, set);
    }
  }, { beforeHandle: requireRole(["admin"]) })

  .post("/company/users", async ({ request, jwt, body, set }: any) => {
    try {
      const actor = await getAuthUser(request, jwt);
      if (!actor?.companyId) { set.status = 403; return { ok: false, message: "Company assignment is required" }; }
      return {
        ok: true,
        data: await createManagedUser(body, actor, requestId(request), {
          forcedCompanyId: actor.companyId,
          allowedRoles: COMPANY_ADMIN_USER_ROLES,
        }),
      };
    } catch (error) {
      return handleError(error, set);
    }
  }, {
    body: t.Object({
      username: t.String(),
      email: t.String(),
      password: t.String(),
      role: t.String(),
      fullName: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean()),
    }),
    beforeHandle: requireRole(["admin"]),
  });
