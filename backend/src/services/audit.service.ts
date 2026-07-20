import { prisma } from "../db";
import type { AuthUser } from "../middlewares/auth.middleware";

export type AuditAction =
  | "attendance.sync"
  | "attendance.submit"
  | "attendance.approve"
  | "payroll.lock"
  | "employee.auto_created"
  | "employee_master.import";

export type AuditEntityType =
  | "attendance_period"
  | "payroll_period"
  | "employee"
  | "employee_master_mapping";

export interface AuditScope {
  date?: string;
  startDate?: string;
  endDate?: string;
  sourceSheetId?: string;
  sourceSheetName?: string;
}

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
        entity_scope: scope as any,
        metadata: (metadata ?? null) as any,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log for action=%s:", action, err);
  }
}
