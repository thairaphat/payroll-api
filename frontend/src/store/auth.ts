import { create } from "zustand";
import type { Role } from "@/types/domain";
import { queryClient } from "@/lib/query-client";

export const STORAGE_KEY = "payroll_mock_session";

/**
 * Development/Cloudflare:
 * VITE_API_URL=/api
 *
 * หากไม่กำหนดค่า จะใช้ /api เป็นค่าเริ่มต้น
 */
const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

interface AuthUser {
  id: string;
  username: string;
  email?: string;
  role: Role | string;
  dbRole?: string;
  roleId?: number;
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

/**
 * อ่านข้อมูล session ที่บันทึกไว้ใน localStorage
 */
function readSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;

    if (
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      parsed.user &&
      typeof parsed.user === "object"
    ) {
      return parsed as AuthSession;
    }

    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

const initialSession = readSession();

export const useAuth = create<AuthState>((set) => ({
  user: initialSession?.user ?? null,
  token: initialSession?.token ?? null,

  /**
   * โหลด session ที่เคยบันทึกไว้กลับเข้าสู่ Zustand
   */
  init: () => {
    const session = readSession();

    if (session) {
      set({
        user: session.user,
        token: session.token,
      });

      return;
    }

    set({
      user: null,
      token: null,
    });
  },

  /**
   * เข้าสู่ระบบ
   */
  login: async (username, password) => {
    try {
      const cleanUsername = username.trim();

      if (!cleanUsername || !password) {
        return false;
      }

      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      if (!response.ok) {
        console.warn("[auth] Login failed:", response.status);
        return false;
      }

      const json = await response.json();

      if (
        json?.ok !== true ||
        typeof json?.token !== "string" ||
        !json?.user
      ) {
        console.warn("[auth] Invalid login response:", json);
        return false;
      }

      const session: AuthSession = {
        token: json.token,
        user: {
          id: String(json.user.id),
          username: json.user.username,
          email: json.user.email,
          role: json.user.role,
          dbRole: json.user.dbRole,
          roleId: json.user.roleId,
          employeeId: json.user.employeeId,
          companyId: json.user.companyId ?? null,
        },
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));

      set({
        user: session.user,
        token: session.token,
      });

      /**
       * ล้าง cache ของผู้ใช้เดิม เพื่อป้องกันข้อมูลบริษัทเดิม
       * แสดงต่อหลังจากเปลี่ยนบัญชี
       */
      queryClient.clear();

      await queryClient.invalidateQueries();

      return true;
    } catch (error) {
      console.error("[auth] Login request failed:", error);
      return false;
    }
  },

  /**
   * ออกจากระบบ
   */
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);

    set({
      user: null,
      token: null,
    });

    queryClient.clear();
  },
}));