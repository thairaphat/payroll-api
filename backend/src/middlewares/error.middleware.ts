export const INTERNAL_ERROR_PAYLOAD = {
  code: "INTERNAL_SERVER_ERROR",
  message: "เกิดข้อผิดพลาดภายในระบบ",
} as const;

const PUBLIC_BUSINESS_CODES = new Set([
  "COMPANY_WAGE_NOT_CONFIGURED",
  "COMPANY_NOT_FOUND",
  "COMPANY_SCOPE_MISMATCH",
  "COMPANY_WAGE_ALREADY_EXISTS",
  "COMPANY_WAGE_NOT_FOUND",
  "COMPANY_REQUIRED",
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN_WAGE_MUTATION",
  "NO_ELIGIBLE_ATTENDANCE",
  "PAYROLL_ALREADY_LOCKED",
  "PAYROLL_EMPLOYEE_PROFILE_MISSING",
  "DUPLICATE_ATTENDANCE",
  "UNKNOWN_EMPLOYEE",
  "ATTENDANCE_LOCKED",
  "BATCH_LIMIT_EXCEEDED",
  "TOO_MANY_REQUESTS",
]);

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
  stack?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? (error as ErrorLike) : {};
}

export function redactDiagnostic(value: unknown) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /(password|password_hash|token|authorization|database_url)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]"
    )
    .replace(/(?:mysql|mariadb):\/\/[^\s]+/gi, "database://[REDACTED]");
}

export function logInternalError({
  error,
  requestId,
  endpoint,
  nodeEnv = process.env.NODE_ENV,
  logger = console.error,
}: {
  error: unknown;
  requestId: string;
  endpoint: string;
  nodeEnv?: string;
  logger?: (message: string) => void;
}) {
  const details = asErrorLike(error);
  const name =
    typeof details.name === "string" ? details.name : "UnknownError";
  const diagnostic =
    nodeEnv === "development"
      ? redactDiagnostic(details.stack ?? details.message ?? error)
      : name;
  logger(
    `[api.error] requestId=${requestId} endpoint=${endpoint} error=${diagnostic}`
  );
}

export function safeErrorResponse({
  error,
  frameworkCode,
}: {
  error: unknown;
  frameworkCode?: string;
}) {
  const details = asErrorLike(error);
  const status = Number(details.status);
  const code = typeof details.code === "string" ? details.code : "";
  const message =
    typeof details.message === "string" ? details.message : "Invalid request";

  if (
    Number.isInteger(status) &&
    status >= 400 &&
    status < 500 &&
    PUBLIC_BUSINESS_CODES.has(code)
  ) {
    return { status, payload: { code, message } };
  }
  if (frameworkCode === "VALIDATION") {
    return {
      status: 400,
      payload: { code: "INVALID_INPUT", message: "Invalid request" },
    };
  }
  if (frameworkCode === "NOT_FOUND") {
    return {
      status: 404,
      payload: { code: "NOT_FOUND", message: "Resource not found" },
    };
  }
  return { status: 500, payload: { ...INTERNAL_ERROR_PAYLOAD } };
}
