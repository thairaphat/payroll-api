import { Elysia, t } from "elysia";
import {
  getAuthUser,
  requireRole,
} from "../../middlewares/auth.middleware";
import { logRequiredAudit } from "../../services/audit.service";
import {
  CompanyScopeError,
  resolveCompanyScope,
} from "../../services/company-scope.service";
import { CompanyWageError } from "./company-wage.policy";
import {
  createCompanyWage,
  getCompanyWage,
  listCompanyWages,
  updateCompanyWage,
} from "./company-wage.service";

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function handleError(error: unknown, set: { status?: number | string }) {
  if (error instanceof CompanyWageError) {
    set.status = error.status;
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof CompanyScopeError) {
    set.status = error.status;
    const code =
      error.status === 404
        ? "COMPANY_NOT_FOUND"
        : error.status === 403
          ? "COMPANY_SCOPE_MISMATCH"
          : "COMPANY_REQUIRED";
    return { ok: false, code, message: error.message };
  }
  throw error;
}

async function requireWageMutation({
  request,
  set,
  jwt,
  params,
  body,
}: any) {
  const actor = await getAuthUser(request, jwt);
  if (!actor) {
    set.status = 401;
    return {
      ok: false,
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication required",
    };
  }
  if (actor.role === "cyd_admin") return;

  const targetCompanyId = Number(params?.companyId ?? body?.companyId);
  const requestId = getRequestId(request);
  await logRequiredAudit(
    "COMPANY_WAGE_ACCESS_DENIED",
    "company_wage",
    {
      targetCompanyId: Number.isInteger(targetCompanyId)
        ? targetCompanyId
        : undefined,
      endpoint: new URL(request.url).pathname,
      method: request.method,
      requestId,
    },
    actor,
    {
      actorUserId: actor.id ?? null,
      actorRole: actor.role,
      targetCompanyId: Number.isInteger(targetCompanyId)
        ? targetCompanyId
        : null,
      requestId,
      timestamp: new Date().toISOString(),
    }
  );
  set.status = 403;
  return {
    ok: false,
    code: "FORBIDDEN_WAGE_MUTATION",
    message: "Only cyd_admin can change company wage configuration",
  };
}

const decimalValue = t.Union([t.String(), t.Number()]);
const wageFields = {
  dailyWage: decimalValue,
  workHoursPerDay: t.Optional(decimalValue),
  ot1Multiplier: t.Optional(decimalValue),
  ot15Multiplier: t.Optional(decimalValue),
  ot2Multiplier: t.Optional(decimalValue),
  ot3Multiplier: t.Optional(decimalValue),
  isActive: t.Optional(t.Boolean()),
};

export const companyWageRoute = new Elysia()
  .get(
    "/admin/company-wages",
    async ({ set }: any) => {
      try {
        return { ok: true, data: { items: await listCompanyWages() } };
      } catch (error) {
        return handleError(error, set);
      }
    },
    { beforeHandle: requireRole(["cyd_admin"]) }
  )
  .get(
    "/admin/company-wages/:companyId",
    async ({ request, jwt, params, set }: any) => {
      try {
        const actor = await getAuthUser(request, jwt);
        if (!actor) {
          set.status = 401;
          return {
            ok: false,
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication required",
          };
        }
        const companyId = await resolveCompanyScope(actor, params.companyId, {
          endpoint: "/admin/company-wages/:companyId",
          method: "GET",
          requestId: getRequestId(request),
        });
        return { ok: true, data: await getCompanyWage(companyId) };
      } catch (error) {
        return handleError(error, set);
      }
    },
    { beforeHandle: requireRole(["cyd_admin", "admin", "accounting"]) }
  )
  .post(
    "/admin/company-wages",
    async ({ request, jwt, body, set }: any) => {
      try {
        const actor = await getAuthUser(request, jwt);
        if (!actor) {
          set.status = 401;
          return {
            ok: false,
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication required",
          };
        }
        const data = await createCompanyWage(
          body.companyId,
          body,
          actor,
          getRequestId(request)
        );
        set.status = 201;
        return { ok: true, data };
      } catch (error) {
        return handleError(error, set);
      }
    },
    {
      body: t.Object({ companyId: t.Number(), ...wageFields }),
      beforeHandle: requireWageMutation,
    }
  )
  .patch(
    "/admin/company-wages/:companyId",
    async ({ request, jwt, params, body, set }: any) => {
      try {
        const actor = await getAuthUser(request, jwt);
        if (!actor) {
          set.status = 401;
          return {
            ok: false,
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication required",
          };
        }
        return {
          ok: true,
          data: await updateCompanyWage(
            params.companyId,
            body,
            actor,
            getRequestId(request)
          ),
        };
      } catch (error) {
        return handleError(error, set);
      }
    },
    {
      body: t.Object({
        dailyWage: t.Optional(decimalValue),
        workHoursPerDay: t.Optional(decimalValue),
        ot1Multiplier: t.Optional(decimalValue),
        ot15Multiplier: t.Optional(decimalValue),
        ot2Multiplier: t.Optional(decimalValue),
        ot3Multiplier: t.Optional(decimalValue),
        isActive: t.Optional(t.Boolean()),
      }),
      beforeHandle: requireWageMutation,
    }
  );
