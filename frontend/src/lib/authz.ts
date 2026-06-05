import { STORAGE_KEY } from "@/store/auth";
import type { Role } from "@/types/domain";

type MockSession = {
  token?: string;
  user?: {
    id?: string;
    username?: string;
    role?: Role | string;
  };
  id?: string;
  username?: string;
  role?: Role | string;
};

export function normalizeRole(role: string | undefined | null): Role | null {
  if (!role) return null;

  const normalized = role.trim().toLowerCase();
  if (
    normalized === "admin" ||
    normalized === "hr" ||
    normalized === "accounting" ||
    normalized === "field_staff" ||
    normalized === "viewer"
  ) {
    return normalized;
  }

  return null;
}

export function canAccessRole(
  role: string | undefined | null,
  allowedRoles?: Role[]
) {
  if (!allowedRoles?.length) return true;

  const normalized = normalizeRole(role);
  return normalized ? allowedRoles.includes(normalized) : false;
}

export function getMockSession(): MockSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getMockAuthHeaders(): HeadersInit {
  const session = getMockSession();
  const user = session?.user ?? session;
  const token = session?.token;

  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  if (!user?.role) return {};

  const role = normalizeRole(user.role);
  if (!role) return {};

  const tokenPayload = { ...user, role };

  return {
    Authorization: `Bearer ${btoa(JSON.stringify(tokenPayload))}`,
    "X-User-Role": role,
    ...(user.id ? { "X-User-Id": user.id } : {}),
    ...(user.username ? { "X-User-Name": user.username } : {}),
  };
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...getMockAuthHeaders(),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = "/login";
  }

  return res;
}
