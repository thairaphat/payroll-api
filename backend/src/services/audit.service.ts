import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { AuthUser } from "../middlewares/auth.middleware";

export type AuditAction =
  | "attendance.sync"
  | "attendance.bulk"
  | "attendance.submit"
  | "attendance.approve"
  | "payroll.lock"
  | "payroll_run.created"
  | "payroll_run.calculated"
  | "payroll_run.review"
  | "payroll_run.approve"
  | "payroll_run.return"
  | "payroll_run.locked"
  | "payroll_run.paid"
  | "payroll_run.cancelled"
  | "company.scope.view"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ROLE_CHANGED"
  | "USER_COMPANY_CHANGED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "USER_PASSWORD_RESET"
  | "COMPANY_WAGE_CREATED"
  | "COMPANY_WAGE_UPDATED"
  | "COMPANY_WAGE_ACTIVATED"
  | "COMPANY_WAGE_DEACTIVATED"
  | "COMPANY_WAGE_ACCESS_DENIED"
  | "employee.auto_created"
  | "employee_master.import";

export type AuditEntityType =
  | "attendance_period"
  | "payroll_period"
  | "payroll_run"
  | "employee"
  | "employee_master_mapping"
  | "company"
  | "company_wage"
  | "user";

export interface AuditScope {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
  sourceSheetName?: string;
  companyId?: number;
  targetCompanyId?: number;
  endpoint?: string;
  method?: string;
  requestId?: string;
}

type AuditClient = Pick<Prisma.TransactionClient, "payroll_audit_logs">;

/**
 * Writes a structured audit entry to payroll_audit_logs.
 *
 * IMPORTANT: This function must NEVER throw. A failed audit write must not
 * block or roll back the business operation that triggered it.
 * All errors are swallowed and logged to stderr only.
 */
export async function logAudit(
  action: AuditAction,
  entityType: AuditEntityType,
  scope: AuditScope,
  user: AuthUser | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.payroll_audit_logs.create({
      data: {
        action,
        actor_user_id: user?.id ? Number(user.id) : null,
        actor_username: user?.username ?? null,
        actor_role: user?.role ?? null,
        entity_type: entityType,
        entity_scope: scope as Prisma.InputJsonValue,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log for action=%s:", action, err);
  }
}

/**
 * Writes a security-critical audit entry. Unlike normal operational audit
 * logging, callers must fail closed if this write cannot be persisted.
 */
export async function logRequiredAudit(
  action: AuditAction,
  entityType: AuditEntityType,
  scope: AuditScope,
  user: AuthUser | null,
  metadata?: Record<string, unknown>,
  db: AuditClient = prisma
): Promise<void> {
  await db.payroll_audit_logs.create({
    data: {
      action,
      actor_user_id: user?.id ? Number(user.id) : null,
      actor_username: user?.username ?? null,
      actor_role: user?.role ?? null,
      entity_type: entityType,
      entity_scope: scope as Prisma.InputJsonValue,
      metadata: metadata
        ? (metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}
