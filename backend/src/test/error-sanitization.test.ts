import { describe, expect, it } from "bun:test";
import {
  logInternalError,
  safeErrorResponse,
} from "../middlewares/error.middleware";

describe("error sanitization", () => {
  it("ERR-001 production 500 does not return the internal message", () => {
    const result = safeErrorResponse({
      error: new Error("internal failure"),
      frameworkCode: "UNKNOWN",
    });
    expect(result).toEqual({
      status: 500,
      payload: {
        code: "INTERNAL_SERVER_ERROR",
        message: "เกิดข้อผิดพลาดภายในระบบ",
      },
    });
  });

  it("ERR-002 production 500 has no stack field", () => {
    const result = safeErrorResponse({ error: new Error("failure") });
    expect(result.payload).not.toHaveProperty("stack");
  });

  it("ERR-003 sanitizes Prisma errors", () => {
    const result = safeErrorResponse({
      error: { name: "PrismaClientKnownRequestError", message: "P2002 table users" },
    });
    expect(JSON.stringify(result)).not.toContain("P2002");
    expect(JSON.stringify(result)).not.toContain("users");
  });

  it("ERR-004 sanitizes SQL errors", () => {
    const result = safeErrorResponse({
      error: new Error("SELECT failed on database.internal"),
    });
    expect(JSON.stringify(result)).not.toMatch(/SELECT|database\.internal/);
  });

  it("ERR-005 does not leak local file paths", () => {
    const result = safeErrorResponse({
      error: new Error("C:\\private\\backend\\src\\index.ts"),
    });
    expect(JSON.stringify(result)).not.toContain("C:\\private");
  });

  it("ERR-006 preserves an allowlisted business 422 error", () => {
    const result = safeErrorResponse({
      error: {
        status: 422,
        code: "COMPANY_WAGE_NOT_CONFIGURED",
        message: "Active wage configuration is required for company ID 16",
      },
    });
    expect(result).toMatchObject({
      status: 422,
      payload: { code: "COMPANY_WAGE_NOT_CONFIGURED" },
    });
  });

  it("ERR-007 preserves established 401 and 403 business behavior", () => {
    expect(
      safeErrorResponse({
        error: { status: 401, code: "UNAUTHORIZED", message: "Authentication required" },
      }).status
    ).toBe(401);
    expect(
      safeErrorResponse({
        error: { status: 403, code: "FORBIDDEN", message: "Access denied" },
      }).status
    ).toBe(403);
  });

  it("ERR-008 development logs include correlation ID with redaction", () => {
    const logs: string[] = [];
    logInternalError({
      error: new Error("password=unsafe"),
      requestId: "request-123",
      endpoint: "/payroll",
      nodeEnv: "development",
      logger: (message) => logs.push(message),
    });
    expect(logs[0]).toContain("requestId=request-123");
    expect(logs[0]).not.toContain("unsafe");
  });

  it("ERR-009 response never includes credential or token fields", () => {
    const result = safeErrorResponse({
      error: new Error("token=unsafe password=unsafe"),
    });
    expect(JSON.stringify(result)).not.toMatch(/token|password|unsafe/i);
  });

  it("ERR-010 maps every unknown error to INTERNAL_SERVER_ERROR", () => {
    expect(safeErrorResponse({ error: "unknown" }).payload.code).toBe(
      "INTERNAL_SERVER_ERROR"
    );
  });
});
