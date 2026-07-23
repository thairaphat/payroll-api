import { describe, expect, it } from "bun:test";
import {
  getAuthUser,
  requireRole,
  type AuthUser,
} from "../middlewares/auth.middleware";
import {
  CompanyScopeError,
  resolveCompanyScope,
} from "../services/company-scope.service";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/protected", { headers });
}

describe("verified JWT authentication boundary", () => {
  it("rejects a missing Authorization header", async () => {
    const jwt = { verify: async () => ({ role: "admin", companyId: 16 }) };
    expect(await getAuthUser(request(), jwt)).toBeNull();
  });

  it("ignores a development role-header spoof", async () => {
    const jwt = { verify: async () => ({ role: "cyd_admin", companyId: null }) };
    expect(
      await getAuthUser(request({ "x-role": "cyd_admin" }), jwt)
    ).toBeNull();
  });

  it("rejects malformed or unverifiable bearer tokens", async () => {
    const jwt = { verify: async () => false as const };
    expect(
      await getAuthUser(request({ authorization: "Bearer malformed" }), jwt)
    ).toBeNull();
  });

  it("rejects a JWT with inconsistent role and company assignment", async () => {
    const jwt = {
      verify: async () => ({
        userId: 1,
        username: "actor",
        role: "cyd_admin",
        companyId: 16,
      }),
    };
    expect(
      await getAuthUser(request({ authorization: "Bearer redacted" }), jwt)
    ).toBeNull();
  });

  it("accepts canonical company and global assignments from verified JWT payloads", async () => {
    const companyJwt = {
      verify: async () => ({
        userId: 2,
        username: "actor",
        role: "admin",
        companyId: 16,
      }),
    };
    const globalJwt = {
      verify: async () => ({
        userId: 1,
        username: "global-actor",
        role: "cyd_admin",
        companyId: null,
      }),
    };
    await expect(
      getAuthUser(request({ authorization: "Bearer redacted" }), companyJwt)
    ).resolves.toMatchObject({ role: "admin", companyId: 16 });
    await expect(
      getAuthUser(request({ authorization: "Bearer redacted" }), globalJwt)
    ).resolves.toMatchObject({ role: "cyd_admin", companyId: null });
  });

  it("returns 401/403 from the role guard without exposing a token", async () => {
    const unauthenticatedSet: { status?: number } = {};
    const unauthenticated = await requireRole(["admin"])({
      request: request(),
      set: unauthenticatedSet,
      jwt: { verify: async () => false as const },
    });
    expect(unauthenticatedSet.status).toBe(401);
    expect(JSON.stringify(unauthenticated)).not.toContain("Bearer");

    const forbiddenSet: { status?: number } = {};
    const forbidden = await requireRole(["admin"])({
      request: request({ authorization: "Bearer redacted" }),
      set: forbiddenSet,
      jwt: {
        verify: async () => ({
          userId: 3,
          role: "viewer",
          companyId: 16,
        }),
      },
    });
    expect(forbiddenSet.status).toBe(403);
    expect(JSON.stringify(forbidden)).not.toContain("redacted");
  });
});

describe("company scope fail-closed behavior", () => {
  const admin: AuthUser = {
    id: "2",
    username: "actor",
    role: "admin",
    companyId: 16,
  };

  it("uses the JWT company when no company query is supplied", async () => {
    await expect(resolveCompanyScope(admin)).resolves.toBe(16);
  });

  it("allows the same company ID and rejects a cross-company ID", async () => {
    await expect(resolveCompanyScope(admin, 16)).resolves.toBe(16);
    await expect(resolveCompanyScope(admin, 18)).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<CompanyScopeError>);
  });

  it("rejects a company role with an empty company assignment", async () => {
    await expect(
      resolveCompanyScope({ ...admin, companyId: null })
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<CompanyScopeError>);
  });
});
