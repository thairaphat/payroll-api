import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import type { AuthUser } from "../../middlewares/auth.middleware";
import type { AuditAction } from "../../services/audit.service";
import {
  COMPANY_ADMIN_CREATABLE_ROLES,
  COMPANY_ROLES,
  normalizeCompanyId,
  normalizeCanonicalRole,
  validateEmail,
  validatePasswordPolicy,
  validateUsername,
  validateUserRoleCompany,
  UserPolicyError,
  type CanonicalRole,
} from "../../utils/user-policy";

export class UserManagementError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409) {
    super(message);
  }
}

export type CreateManagedUserInput = {
  username?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  companyId?: unknown;
  fullName?: unknown;
  isActive?: unknown;
};

export type UpdateManagedUserInput = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  companyId?: unknown;
  isActive?: unknown;
};

const managedUserInclude = {
  payroll_roles: { select: { name: true } },
  companies: { select: { company_name: true } },
} satisfies Prisma.payroll_usersInclude;

type ManagedUserRow = Prisma.payroll_usersGetPayload<{ include: typeof managedUserInclude }>;

function toPublicUser(user: ManagedUserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.payroll_roles.name,
    companyId: user.company_id,
    companyName: user.companies?.company_name ?? null,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function safeState(user: ManagedUserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.payroll_roles.name,
    companyId: user.company_id,
    isActive: user.is_active,
  };
}

function auditData(
  action: AuditAction,
  actor: AuthUser,
  targetUserId: number,
  targetCompanyId: number | null,
  requestId: string,
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null
): Prisma.payroll_audit_logsUncheckedCreateInput {
  return {
    action,
    actor_user_id: actor.id ? Number(actor.id) : null,
    actor_username: actor.username ?? null,
    actor_role: actor.role,
    entity_type: "user",
    entity_scope: { targetUserId, targetCompanyId, requestId },
    metadata: { beforeData, afterData } as Prisma.InputJsonValue,
  };
}

async function assertCompanyExists(companyId: number) {
  const company = await prisma.companies.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new UserManagementError("Company not found", 404);
}

async function assertIdentityAvailable(username: string, email: string, excludeId?: number) {
  const conflict = await prisma.payroll_users.findFirst({
    where: {
      OR: [{ username }, { email }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, username: true, email: true },
  });
  if (conflict) throw new UserManagementError("Username or email is already in use", 409);
}

function normalizeInputError(error: unknown): never {
  if (error instanceof UserManagementError) throw error;
  if (error instanceof UserPolicyError) throw new UserManagementError(error.message, 400);
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new UserManagementError("Username or email is already in use", 409);
  }
  throw error;
}

export async function listManagedUsers(companyIdValue?: unknown) {
  let companyId: number | null;
  try {
    companyId = normalizeCompanyId(companyIdValue);
  } catch (error) {
    return normalizeInputError(error);
  }
  if (companyId != null) await assertCompanyExists(companyId);
  const users = await prisma.payroll_users.findMany({
    where: companyId == null ? { company_id: { not: null } } : { company_id: companyId },
    include: managedUserInclude,
    orderBy: [{ company_id: "asc" }, { username: "asc" }],
  });
  return users.map(toPublicUser);
}

export async function createManagedUser(
  input: CreateManagedUserInput,
  actor: AuthUser,
  requestId: string,
  options: { forcedCompanyId?: number; allowedRoles?: readonly CanonicalRole[] } = {}
) {
  try {
    const username = validateUsername(input.username);
    const email = validateEmail(input.email);
    const password = validatePasswordPolicy(input.password);
    const requestedCompanyId = options.forcedCompanyId ?? input.companyId;
    const assignment = validateUserRoleCompany(input.role, requestedCompanyId);
    const allowedRoles = options.allowedRoles ?? COMPANY_ROLES;
    if (assignment.role === "cyd_admin" || !allowedRoles.includes(assignment.role)) {
      throw new UserManagementError("Role is not allowed for company user creation", 403);
    }
    if (input.isActive != null && typeof input.isActive !== "boolean") {
      throw new UserManagementError("isActive must be boolean", 400);
    }
    await assertCompanyExists(assignment.companyId!);
    await assertIdentityAvailable(username, email);
    const role = await prisma.payroll_roles.findUnique({ where: { name: assignment.role }, select: { id: true } });
    if (!role) throw new UserManagementError("Role not found", 400);
    const passwordHash = await bcrypt.hash(password, 12);
    const fullName = typeof input.fullName === "string" && input.fullName.trim()
      ? input.fullName.trim().slice(0, 150)
      : username;

    return await prisma.$transaction(async (tx) => {
      const created = await tx.payroll_users.create({
        data: {
          username,
          email,
          full_name: fullName,
          password_hash: passwordHash,
          role_id: role.id,
          company_id: assignment.companyId,
          is_active: input.isActive !== false,
        },
        include: managedUserInclude,
      });
      await tx.payroll_audit_logs.create({
        data: auditData("USER_CREATED", actor, created.id, created.company_id, requestId, null, safeState(created)),
      });
      return toPublicUser(created);
    });
  } catch (error) {
    return normalizeInputError(error);
  }
}

export async function updateManagedUser(
  idValue: unknown,
  input: UpdateManagedUserInput,
  actor: AuthUser,
  requestId: string
) {
  try {
    const id = Number(idValue);
    if (!Number.isInteger(id) || id <= 0) throw new UserManagementError("Invalid user id", 400);
    const target = await prisma.payroll_users.findUnique({ where: { id }, include: managedUserInclude });
    if (!target) throw new UserManagementError("User not found", 404);
    if (target.payroll_roles.name === "cyd_admin") {
      throw new UserManagementError("cyd_admin accounts cannot be edited through the company user API", 403);
    }

    const roleName = input.role === undefined ? target.payroll_roles.name : normalizeCanonicalRole(input.role);
    const companyId = input.companyId === undefined ? target.company_id : input.companyId;
    const assignment = validateUserRoleCompany(roleName, companyId);
    if (assignment.role === "cyd_admin" || !COMPANY_ROLES.includes(assignment.role as (typeof COMPANY_ROLES)[number])) {
      throw new UserManagementError("Role is not allowed for company users", 403);
    }
    await assertCompanyExists(assignment.companyId!);
    const email = input.email === undefined ? target.email! : validateEmail(input.email);
    await assertIdentityAvailable(target.username, email, target.id);
    if (input.isActive != null && typeof input.isActive !== "boolean") {
      throw new UserManagementError("isActive must be boolean", 400);
    }
    const nextIsActive = input.isActive === undefined ? target.is_active : input.isActive as boolean;
    const role = await prisma.payroll_roles.findUnique({ where: { name: assignment.role }, select: { id: true } });
    if (!role) throw new UserManagementError("Role not found", 400);
    const passwordHash = input.password == null || input.password === ""
      ? undefined
      : await bcrypt.hash(validatePasswordPolicy(input.password), 12);

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.payroll_users.update({
        where: { id: target.id },
        data: {
          email,
          role_id: role.id,
          company_id: assignment.companyId,
          is_active: nextIsActive,
          ...(passwordHash ? { password_hash: passwordHash } : {}),
        },
        include: managedUserInclude,
      });
      const beforeData = safeState(target);
      const afterData = safeState(updated);
      const actions: AuditAction[] = [];
      if (target.payroll_roles.name !== updated.payroll_roles.name) actions.push("USER_ROLE_CHANGED");
      if (target.company_id !== updated.company_id) actions.push("USER_COMPANY_CHANGED");
      if (target.is_active !== updated.is_active) actions.push(updated.is_active ? "USER_ACTIVATED" : "USER_DEACTIVATED");
      if (passwordHash) actions.push("USER_PASSWORD_RESET");
      if (target.email !== updated.email || actions.length === 0) actions.push("USER_UPDATED");
      for (const action of actions) {
        await tx.payroll_audit_logs.create({
          data: auditData(action, actor, updated.id, updated.company_id, requestId, beforeData, afterData),
        });
      }
      return toPublicUser(updated);
    });
  } catch (error) {
    return normalizeInputError(error);
  }
}

export const COMPANY_ADMIN_USER_ROLES = COMPANY_ADMIN_CREATABLE_ROLES;
