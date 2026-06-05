export type AppRole = "admin" | "hr" | "accounting" | "field_staff" | "viewer";

export interface AuthUser {
  id?: string;
  username?: string;
  email?: string | null;
  role: AppRole;
  roleId?: number | null;
  dbRole?: string;
  companyId?: number | null;
}

const ROLES: AppRole[] = ["admin", "hr", "accounting", "field_staff", "viewer"];

function normalizeRole(value: string | null | undefined): AppRole | null {
  if (!value) return null;

  const role = value.trim().toLowerCase();

  return ROLES.includes(role as AppRole) ? (role as AppRole) : null;
}

type JwtVerifier = {
  verify: (token?: string) => Promise<any | false>;
};

function getBearerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function isDevBypassEnabled() {
  return process.env.ALLOW_DEV_AUTH_BYPASS === "true";
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
      return {
        id: payload.userId ? String(payload.userId) : undefined,
        username: payload.username ? String(payload.username) : undefined,
        email: payload.email ? String(payload.email) : null,
        role,
        roleId: payload.roleId != null ? Number(payload.roleId) : null,
        dbRole: payload.dbRole ? String(payload.dbRole) : undefined,
        companyId: payload.companyId != null ? Number(payload.companyId) : null,
      };
    }
  }

  if (!isDevBypassEnabled()) return null;

  const headerRole = request.headers.get("x-user-role");
  const role = normalizeRole(headerRole);

  if (!role) return null;

  return {
    id: request.headers.get("x-user-id") ?? undefined,
    username: request.headers.get("x-user-name") ?? undefined,
    role,
  };
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
