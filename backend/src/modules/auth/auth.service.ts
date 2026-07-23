import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { normalizeRole, type AppRole } from "../../middlewares/auth.middleware";
import { validateUserRoleCompany } from "../../utils/user-policy";
export type LoginInput = {
  username: string;
  password: string;
};

export type LoginUser = {
  id: string;
  username: string;
  email: string | null;
  role: AppRole;
  roleId: number;
  companyId: number | null;
};

export async function validateLogin(input: LoginInput): Promise<LoginUser | null> {
  const identifier = input.username?.trim();
  if (!identifier || !input.password) {
    console.warn("[auth.login] Missing credentials", {
      hasUsername: Boolean(identifier),
      hasPassword: Boolean(input.password),
    });
    return null;
  }

  const user = await prisma.payroll_users.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }],
      is_active: true,
    },
    include: {
      payroll_roles: true,
    },
  });

  if (!user) {
    console.warn("[auth.login] Invalid credentials");
    return null;
  }

  // Use compareSync to bypass any async/Promise/Bun runtime issues with bcryptjs 3.x
  const passwordToCheck = String(input.password);
  const ok = bcrypt.compareSync(passwordToCheck, user.password_hash);
  if (!ok) {
    console.warn("[auth.login] Invalid credentials");
    return null;
  }

  if (!user.payroll_roles?.name) {
    console.warn("[auth.login] Login rejected", { userId: user.id });
    return null;
  }

  const normalizedRole = normalizeRole(user.payroll_roles.name);
  if (!normalizedRole) {
    console.warn("[auth.login] Login rejected", { userId: user.id });
    return null;
  }
  let assignment: ReturnType<typeof validateUserRoleCompany>;
  try {
    assignment = validateUserRoleCompany(normalizedRole, user.company_id);
  } catch {
    console.warn("[auth.login] Login rejected", { userId: user.id });
    return null;
  }

  return {
    id: String(user.id),
    username: user.username,
    email: user.email ?? null,
    role: assignment.role,
    roleId: user.role_id,
    companyId: assignment.companyId,
  };
}
