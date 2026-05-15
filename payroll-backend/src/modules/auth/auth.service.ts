import bcrypt from "bcryptjs";
import { prisma } from "../../db";
export type LoginInput = {
  username: string;
  password: string;
};

export type LoginUser = {
  id: string;
  username: string;
  role: string;
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
    console.warn("[auth.login] Payroll user not found or inactive", {
      identifier,
    });
    return null;
  }

  const ok = await bcrypt.compare(input.password, user.password_hash);
  if (!ok) {
    console.warn("[auth.login] Invalid password for payroll user", {
      userId: user.id,
      username: user.username,
    });
    return null;
  }

  if (!user.payroll_roles?.name) {
    console.warn("[auth.login] Payroll user has no role", {
      userId: user.id,
      username: user.username,
    });
    return null;
  }

  return {
    id: String(user.id),
    username: user.username,
    role: user.payroll_roles.name,
  };
}
