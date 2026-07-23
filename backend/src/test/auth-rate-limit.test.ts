import { describe, expect, it } from "bun:test";
import {
  handleRateLimitedLogin,
  LoginRateLimiter,
  resolveLoginClientIp,
} from "../modules/auth/login-rate-limit";

function request(forwarded?: string) {
  return new Request("http://localhost/auth/login", {
    headers: forwarded ? { "x-forwarded-for": forwarded } : {},
  });
}

describe("login rate limiting", () => {
  it("AUTH-RATE-001 allows requests below the limit", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const result = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 1,
      limiter,
      login: async () => ({ ok: false }),
    });
    expect(result.status).toBe(401);
  });

  it("AUTH-RATE-002 returns 429 after the limit", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 1,
      limiter,
      login: async () => ({ ok: false }),
    });
    const result = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 2,
      limiter,
      login: async () => ({ ok: false }),
    });
    expect(result.status).toBe(429);
  });

  it("AUTH-RATE-003 includes Retry-After", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 10_000 });
    limiter.consume("192.0.2.1", 1);
    const result = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 2,
      limiter,
      login: async () => ({ ok: false }),
    });
    expect(Number(result.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("AUTH-RATE-004 applies one generic policy to all failed credentials", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    for (const now of [1, 2]) {
      await handleRateLimitedLogin({
        ip: "192.0.2.1",
        now,
        limiter,
        login: async () => ({ ok: false, message: "Invalid credentials" }),
      });
    }
    const result = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 3,
      limiter,
      login: async () => ({ ok: false }),
    });
    expect(result.body).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many login attempts. Please try again later.",
    });
  });

  it("AUTH-RATE-005 never logs password or token material", async () => {
    const source = await Bun.file(
      new URL("../modules/auth/login-rate-limit.ts", import.meta.url)
    ).text();
    expect(source).not.toMatch(/console\.(log|warn|error)/);
    expect(source).not.toContain("Authorization");
  });

  it("AUTH-RATE-006 blocks before the login/password verifier runs", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.consume("192.0.2.1", 1);
    let verifierCalls = 0;
    await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 2,
      limiter,
      login: async () => {
        verifierCalls += 1;
        return { ok: false };
      },
    });
    expect(verifierCalls).toBe(0);
  });

  it("AUTH-RATE-007 keeps separate IP buckets", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.consume("192.0.2.1", 1);
    expect(limiter.consume("192.0.2.2", 2).allowed).toBe(true);
  });

  it("AUTH-RATE-008 malformed forwarded IP cannot bypass the direct IP bucket", () => {
    expect(
      resolveLoginClientIp(request("bad, 203.0.113.1"), "10.0.0.10", {
        TRUST_PROXY: "true",
        TRUSTED_PROXY_IPS: "10.0.0.10",
      })
    ).toBe("10.0.0.10");
    expect(
      resolveLoginClientIp(request("203.0.113.1"), "10.0.0.11", {
        TRUST_PROXY: "true",
        TRUSTED_PROXY_IPS: "10.0.0.10",
      })
    ).toBe("10.0.0.11");
  });

  it("AUTH-RATE-009 resets the bucket after successful login", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    const success = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 1,
      limiter,
      login: async () => ({ ok: true }),
    });
    const next = limiter.consume("192.0.2.1", 2);
    expect(success.status).toBe(200);
    expect(next.allowed).toBe(true);
  });

  it("AUTH-RATE-010 uses a generic response that prevents enumeration", async () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.consume("192.0.2.1", 1);
    const result = await handleRateLimitedLogin({
      ip: "192.0.2.1",
      now: 2,
      limiter,
      login: async () => ({ ok: false }),
    });
    expect(JSON.stringify(result.body)).not.toMatch(/username|account|password/i);
  });
});
