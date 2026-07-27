import { create } from "zustand";
import type { Role } from "@/types/domain";
import { queryClient } from "@/lib/query-client";

export const STORAGE_KEY = "payroll_mock_session";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

interface AuthUser {
  id: string;
  username: string;
  role: Role | string;
  dbRole?: string;
  employeeId?: string;
  companyId?: number | null;
}

interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  init: () => void;
}

function readSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.user) return parsed;

    return null;
  } catch {
    return null;
  }
}

const initialSession = readSession();

export const useAuth = create<AuthState>((set) => ({
  user: initialSession?.user ?? null,
  token: initialSession?.token ?? null,
  init: () => {
    const session = readSession();
    if (session) {
      set({ user: session.user, token: session.token });
    }
  },
  login: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    if (!json?.ok || !json?.token || !json?.user) return false;

    const session: AuthSession = {
      token: json.token,
      user: json.user,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    set({ user: session.user, token: session.token });

    // Clear the previous user's cached data so the new user always sees
    // fresh data scoped to their own company, not a previous user's company.
    queryClient.clear();
    await queryClient.invalidateQueries();

    return true;
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ user: null, token: null });
    queryClient.clear();
  },
}));
