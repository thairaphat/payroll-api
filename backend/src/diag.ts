/**
 * diag.ts — Temporary diagnostic logging utilities.
 *
 * Purpose: surface DB errors, company-scope issues, and query failures
 * without modifying any SQL, schema, or business logic.
 *
 * Remove this file (and its imports) once root-cause analysis is complete.
 */

import type { AuthUser } from "./middlewares/auth.middleware";

// ─── URL masking ──────────────────────────────────────────────────────────────

export function maskDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    // Not a valid URL — redact anything between : and @ that looks like a password
    return raw.replace(/(:)[^:@]+(@)/, "$1***$2");
  }
}

// ─── JWT payload extraction (NO verification — for logging only) ──────────────

export interface DiagJwtContext {
  username: string;
  companyId: string;
  role: string;
}

export function extractJwtContext(request: Request): DiagJwtContext {
  const fallback: DiagJwtContext = { username: "(unauthenticated)", companyId: "n/a", role: "n/a" };
  try {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return fallback;

    const parts = token.split(".");
    if (parts.length !== 3) return { username: "(bad-token)", companyId: "n/a", role: "n/a" };

    // JWT uses base64url — replace - → + and _ → / before decoding
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

    return {
      username: String(payload.username ?? "(unknown)"),
      companyId: payload.companyId != null ? String(payload.companyId) : "null",
      role: String(payload.role ?? "(unknown)"),
    };
  } catch {
    return { username: "(jwt-parse-error)", companyId: "n/a", role: "n/a" };
  }
}

// ─── Structured log helpers ───────────────────────────────────────────────────

export function logRouteEnter(
  endpoint: string,
  user: AuthUser | null
): void {
  console.log(
    `[route.enter] endpoint=${endpoint}` +
    ` user=${user?.username ?? "(unauthenticated)"}` +
    ` companyId=${user?.companyId ?? "null"}` +
    ` role=${user?.role ?? "(none)"}`
  );
}

export function logApiError(
  endpoint: string,
  user: AuthUser | null,
  error: unknown,
  context?: string
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const lines = [
    `[api.error]`,
    `  endpoint=${endpoint}`,
    `  user=${user?.username ?? "(unauthenticated)"}`,
    `  companyId=${user?.companyId ?? "null"}`,
    `  role=${user?.role ?? "(none)"}`,
  ];
  if (context) lines.push(`  context=${context}`);
  lines.push(`  error=${err.message}`);
  lines.push(`  stack=${err.stack ?? "(no stack)"}`);
  console.error(lines.join("\n"));
}
