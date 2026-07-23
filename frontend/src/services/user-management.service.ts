import { authFetch } from "@/lib/authz";
import type { Role } from "@/types/domain";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type ManagedUser = {
  id: number;
  username: string;
  email: string | null;
  role: Role;
  companyId: number;
  companyName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateManagedUserInput = {
  username: string;
  email: string;
  password: string;
  role: Exclude<Role, "cyd_admin">;
  companyId: number;
};

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.message ?? "User management request failed");
  return json.data as T;
}

export async function fetchManagedUsers(companyId: number): Promise<ManagedUser[]> {
  const response = await authFetch(`${API_URL}/admin/users?companyId=${companyId}`);
  return readResponse<ManagedUser[]>(response);
}

export async function createManagedUser(input: CreateManagedUserInput): Promise<ManagedUser> {
  const response = await authFetch(`${API_URL}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse<ManagedUser>(response);
}

export async function updateManagedUser(
  id: number,
  input: Partial<Pick<ManagedUser, "email" | "companyId" | "isActive">> & {
    role?: Exclude<Role, "cyd_admin">;
    password?: string;
  }
): Promise<ManagedUser> {
  const response = await authFetch(`${API_URL}/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse<ManagedUser>(response);
}
