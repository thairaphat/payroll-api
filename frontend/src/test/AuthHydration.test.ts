import { afterEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "@/store/auth";

describe("authentication hydration", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("restores a valid session before protected routes render", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: "test-token",
        user: {
          id: "user-1",
          username: "admin39",
          role: "admin",
          companyId: 39,
        },
      })
    );

    vi.resetModules();
    const { useAuth } = await import("@/store/auth");

    expect(useAuth.getState().token).toBe("test-token");
    expect(useAuth.getState().user).toMatchObject({
      username: "admin39",
      role: "admin",
      companyId: 39,
    });
  });
});
