import bcrypt from "bcryptjs";
import { prisma } from "../../db";
export type LoginInput = {
  username: string;
  password: string;
};

export type LoginUser = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  roleId: number;
  companyId: number | null;
};

export async function validateLogin(input: LoginInput): Promise<LoginUser | null> {
  // --- debug: confirm what the body actually contains ---
  console.log("[auth.debug] body keys:", Object.keys(input));
  console.log("[auth.debug] username:", input.username);
  console.log("[auth.debug] password length:", input.password?.length);
  console.log("[auth.debug] password type:", typeof input.password);
  if (process.env.NODE_ENV !== "production") {
    // show raw bytes in dev so invisible chars are visible
    console.log("[auth.debug] password raw:", JSON.stringify(input.password));
    console.log("[auth.debug] password charCodes:", [...String(input.password ?? "")].map(c => c.charCodeAt(0)));
  }

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

  // --- debug: confirm the hash from DB ---
  console.log("[auth.debug] found user id:", user.id, "username:", user.username);
  console.log("[auth.debug] hash prefix (first 7 chars):", user.password_hash?.slice(0, 7));
  console.log("[auth.debug] hash length:", user.password_hash?.length);

  // Use compareSync to bypass any async/Promise/Bun runtime issues with bcryptjs 3.x
  const passwordToCheck = String(input.password);
  const ok = bcrypt.compareSync(passwordToCheck, user.password_hash);
  console.log("[auth.debug] compareSync result:", ok);

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
    email: user.email ?? null,
    role: user.payroll_roles.name,
    roleId: user.role_id,
    companyId: user.company_id ?? null,
  };
}
