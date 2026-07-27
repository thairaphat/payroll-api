import { Elysia, t } from "elysia";
import { getAuthUser, requireRole, type AuthUser } from "../../middlewares/auth.middleware";
import {
  CompanyScopeError,
  resolveCompanyScope,
} from "../../services/company-scope.service";
import { WageConfigError } from "../../services/wage-config.service";
import { PayrollDataIntegrityError } from "../payroll/payroll.service";
import {
  PAYROLL_RUN_SCHEMA_NOT_INITIALIZED,
  PayrollRunSchemaNotInitializedError,
  getPayrollRunMissingTableFromError,
  getPayrollRunSchemaReadiness,
  isPayrollRunSchemaNotInitialized,
  withPayrollRunReadinessGate,
} from "./payroll-run-schema";
import {
  PayrollRunError,
  calculatePayrollRun,
  cancelPayrollRun,
  createPayrollRun,
  getPayrollRun,
  getPayrollRunItems,
  listPayrollRuns,
  lockPayrollRun,
  markPayrollRunPaid,
  transitionPayrollRun,
} from "./payroll-run.service";

const readRoles = requireRole(["cyd_admin", "admin", "hr", "accounting"]);
const hrRoles = requireRole(["admin", "hr"]);
const approvalRoles = requireRole(["admin", "accounting"]);
const adminOnly = requireRole(["admin"]);

const companyField = { companyId: t.Optional(t.Number()) };
const createBody = t.Object({
  ...companyField,
  periodStart: t.String(),
  periodEnd: t.String(),
  paymentDate: t.String(),
  idempotencyKey: t.Optional(t.String()),
});

async function actorAndScope(context: any, requestedCompanyId?: unknown) {
  const actor = await getAuthUser(context.request, context.jwt);
  if (!actor) {
    throw new PayrollRunError("PAYROLL_RUN_COMPANY_SCOPE_DENIED", "Authentication required.", 403);
  }
  const companyId = await resolveCompanyScope(
    actor,
    requestedCompanyId as string | number | undefined,
    {
      endpoint: new URL(context.request.url).pathname,
      method: context.request.method,
      requestId: context.request.headers.get("x-request-id") ?? crypto.randomUUID(),
    }
  );
  return { actor, companyId };
}

function routeError(error: unknown, set: { status?: number | string }) {
  if (error instanceof PayrollRunSchemaNotInitializedError) {
    set.status = error.status;
    return {
      success: false,
      code: error.code,
      message: error.message,
      missingTables: error.missingTables,
    };
  }
  if (isPayrollRunSchemaNotInitialized(error)) {
    const missingTable = getPayrollRunMissingTableFromError(error);
    set.status = 503;
    return {
      success: false,
      ...PAYROLL_RUN_SCHEMA_NOT_INITIALIZED,
      missingTables: missingTable ? [missingTable] : [],
    };
  }
  if (error instanceof WageConfigError) {
    set.status = error.status;
    return {
      success: false,
      code:
        error.code === "COMPANY_WAGE_NOT_CONFIGURED"
          ? "PAYROLL_RUN_MISSING_WAGE"
          : error.code,
      message: error.message,
    };
  }
  if (error instanceof PayrollDataIntegrityError) {
    set.status = error.status;
    return {
      success: false,
      code: "PAYROLL_RUN_DUPLICATE_EMPLOYEE",
      message: error.message,
    };
  }
  if (error instanceof PayrollRunError || error instanceof CompanyScopeError) {
    set.status = error.status;
    return {
      success: false,
      code:
        error instanceof PayrollRunError
          ? error.code
          : "PAYROLL_RUN_COMPANY_SCOPE_DENIED",
      message: error.message,
    };
  }
  throw error;
}

async function scopedAction<T>(
  context: any,
  operation: (input: { actor: AuthUser; companyId: number }) => Promise<T>,
  requestedCompanyId?: unknown
) {
  try {
    return {
      success: true,
      data: await operation(await actorAndScope(context, requestedCompanyId)),
    };
  } catch (error) {
    return routeError(error, context.set);
  }
}

async function guardedScopedAction<T>(
  context: any,
  operation: (input: { actor: AuthUser; companyId: number }) => Promise<T>,
  requestedCompanyId?: unknown
) {
  try {
    return await withPayrollRunReadinessGate(() =>
      scopedAction(context, operation, requestedCompanyId)
    );
  } catch (error) {
    if (error instanceof PayrollRunSchemaNotInitializedError) {
      console.info(
        "[payroll-run] schema_gate=blocked endpoint=%s monthly_model_invocations=0 missing_tables=%s",
        new URL(context.request.url).pathname,
        error.missingTables.join(",")
      );
    }
    return routeError(error, context.set);
  }
}

export const payrollRunRoute = new Elysia({ prefix: "/payroll/runs" })
  .get(
    "/readiness",
    () => getPayrollRunSchemaReadiness(),
    { beforeHandle: readRoles }
  )
  .get(
    "/",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) =>
          listPayrollRuns(
            companyId,
            context.query?.year ? Number(context.query.year) : undefined
          ),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .post(
    "/",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          createPayrollRun(companyId, context.body, actor),
        context.body.companyId
      ),
    { beforeHandle: hrRoles, body: createBody }
  )
  .get(
    "/:runId",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) => getPayrollRun(context.params.runId, companyId),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .get(
    "/:runId/items",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) => getPayrollRunItems(context.params.runId, companyId),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .get(
    "/:runId/summary",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) => getPayrollRun(context.params.runId, companyId),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .get(
    "/:runId/export",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) => getPayrollRunItems(context.params.runId, companyId),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .get(
    "/:runId/payslips",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId }) => getPayrollRunItems(context.params.runId, companyId),
        context.query?.companyId
      ),
    { beforeHandle: readRoles }
  )
  .post(
    "/:runId/calculate",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          calculatePayrollRun(context.params.runId, companyId, actor),
        context.body.companyId
      ),
    { beforeHandle: hrRoles, body: t.Object(companyField) }
  )
  .post(
    "/:runId/review",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          transitionPayrollRun(context.params.runId, companyId, "review", actor),
        context.body.companyId
      ),
    { beforeHandle: hrRoles, body: t.Object(companyField) }
  )
  .post(
    "/:runId/approve",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          transitionPayrollRun(context.params.runId, companyId, "approve", actor),
        context.body.companyId
      ),
    { beforeHandle: approvalRoles, body: t.Object(companyField) }
  )
  .post(
    "/:runId/return",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          transitionPayrollRun(context.params.runId, companyId, "return", actor),
        context.body.companyId
      ),
    { beforeHandle: hrRoles, body: t.Object(companyField) }
  )
  .post(
    "/:runId/lock",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          lockPayrollRun(
            context.params.runId,
            companyId,
            context.body.idempotencyKey,
            actor
          ),
        context.body.companyId
      ),
    {
      beforeHandle: approvalRoles,
      body: t.Object({ ...companyField, idempotencyKey: t.String() }),
    }
  )
  .post(
    "/:runId/mark-paid",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          markPayrollRunPaid(context.params.runId, companyId, context.body, actor),
        context.body.companyId
      ),
    {
      beforeHandle: approvalRoles,
      body: t.Object({
        ...companyField,
        paymentReference: t.Optional(t.String()),
        bankBatchReference: t.Optional(t.String()),
      }),
    }
  )
  .post(
    "/:runId/cancel",
    (context: any) =>
      guardedScopedAction(
        context,
        ({ companyId, actor }) =>
          cancelPayrollRun(
            context.params.runId,
            companyId,
            context.body.reason,
            actor
          ),
        context.body.companyId
      ),
    {
      beforeHandle: adminOnly,
      body: t.Object({ ...companyField, reason: t.String() }),
    }
  );
