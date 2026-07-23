import { isIP } from "node:net";

export type LoginRateLimitPolicy = {
  maxAttempts: number;
  windowMs: number;
};

type Bucket = {
  attempts: number;
  resetAt: number;
};

export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(public readonly policy: LoginRateLimitPolicy) {
    if (
      !Number.isSafeInteger(policy.maxAttempts) ||
      policy.maxAttempts < 1 ||
      !Number.isSafeInteger(policy.windowMs) ||
      policy.windowMs < 1
    ) {
      throw new Error("Invalid login rate-limit policy");
    }
  }

  consume(ip: string, now = Date.now()) {
    const key = `ip:${ip}`;
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { attempts: 0, resetAt: now + this.policy.windowMs }
        : current;

    if (bucket.attempts >= this.policy.maxAttempts) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000)
        ),
      };
    }

    bucket.attempts += 1;
    this.buckets.set(key, bucket);
    return {
      allowed: true as const,
      remaining: this.policy.maxAttempts - bucket.attempts,
    };
  }

  reset(ip: string) {
    this.buckets.delete(`ip:${ip}`);
  }
}

function configuredPolicy(): LoginRateLimitPolicy {
  const production = process.env.NODE_ENV === "production";
  return production
    ? { maxAttempts: 5, windowMs: 15 * 60 * 1000 }
    : { maxAttempts: 20, windowMs: 5 * 60 * 1000 };
}

export const loginRateLimiter = new LoginRateLimiter(configuredPolicy());

function directAddress(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return isIP(text) ? text : "unknown";
}

/**
 * Proxy policy is fail-closed:
 * - direct socket address is always authoritative by default;
 * - X-Forwarded-For is considered only when TRUST_PROXY=true;
 * - the direct proxy address must appear in TRUSTED_PROXY_IPS;
 * - exactly one syntactically valid forwarded address is accepted.
 */
export function resolveLoginClientIp(
  request: Request,
  socketAddress: unknown,
  env: Record<string, string | undefined> = process.env
) {
  const directIp = directAddress(socketAddress);
  if (env.TRUST_PROXY !== "true") return directIp;

  const trustedProxies = new Set(
    (env.TRUSTED_PROXY_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => isIP(value))
  );
  if (!trustedProxies.has(directIp)) return directIp;

  const forwarded = request.headers.get("x-forwarded-for")?.trim() ?? "";
  if (!forwarded || forwarded.includes(",") || !isIP(forwarded)) {
    return directIp;
  }
  return forwarded;
}

export async function handleRateLimitedLogin<T extends { ok?: boolean }>({
  ip,
  now,
  limiter,
  login,
}: {
  ip: string;
  now?: number;
  limiter: LoginRateLimiter;
  login: () => Promise<T>;
}) {
  const decision = limiter.consume(ip, now);
  if (!decision.allowed) {
    return {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
      body: {
        ok: false,
        code: "TOO_MANY_REQUESTS",
        message: "Too many login attempts. Please try again later.",
      },
    };
  }

  const body = await login();
  if (body.ok) limiter.reset(ip);
  return { status: body.ok ? 200 : 401, headers: {}, body };
}
