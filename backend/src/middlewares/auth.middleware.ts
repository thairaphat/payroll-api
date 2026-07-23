import {
  normalizeCanonicalRole,
  validateUserRoleCompany,
  type CanonicalRole,
} from "../utils/user-policy";

export type AppRole = CanonicalRole;

export interface AuthUser {
  id?: string;
  username?: string;
  email?: string | null;
  role: AppRole;
  roleId?: number | null;
  dbRole?: string;
  companyId?: number | null;
}

export function normalizeRole(value: string | null | undefined): AppRole | null {
  return normalizeCanonicalRole(value);
}

type JwtVerifier = {
  verify: (token?: string) => Promise<any | false>;
};

function getBearerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function getAuthUser(
  request: Request,
  jwt?: JwtVerifier
): Promise<AuthUser | null> {
  const token = getBearerToken(request.headers.get("authorization"));

  if (token && jwt) {
    const payload = await jwt.verify(token);
    const role = normalizeRole(payload && String(payload.role ?? ""));

    if (payload && role) {
      let assignment: ReturnType<typeof validateUserRoleCompany>;
      try {
        assignment = validateUserRoleCompany(role, payload.companyId ?? null);
      } catch {
        return null;
      }
      return {
        id: payload.userId ? String(payload.userId) : undefined,
        username: payload.username ? String(payload.username) : undefined,
        email: payload.email ? String(payload.email) : null,
        role: assignment.role,
        roleId: payload.roleId != null ? Number(payload.roleId) : null,
        dbRole: payload.dbRole ? String(payload.dbRole) : undefined,
        companyId: assignment.companyId,
      };
    }
  }

  return null;
}

export async function requireAuth({ request, set, jwt }: any) {
  const user = await getAuthUser(request, jwt);

  if (!user) {
    set.status = 401;
    return {
      ok: false,
      message: "Authentication required",
    };
  }
}

export function requireRole(allowedRoles: AppRole[]) {
  return async ({ request, set, jwt }: any) => {
    const user = await getAuthUser(request, jwt);

    if (!user) {
      set.status = 401;
      return {
        ok: false,
        message: "Authentication required",
      };
    }

    if (!allowedRoles.includes(user.role)) {
      set.status = 403;
      return {
        ok: false,
        message: "Access denied",
        requiredRoles: allowedRoles,
      };
    }
  };
}
