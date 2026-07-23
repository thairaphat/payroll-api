import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { fieldAttendanceRoute } from "./modules/attendance/field-attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";
import { dashboardRoute } from "./modules/dashboard/dashboard.route";
import { authRoute } from "./modules/auth/auth.route";
import { userManagementRoute } from "./modules/users/user-management.route";
import { prisma } from "./db";
import { maskDatabaseUrl, extractJwtContext } from "./diag";

// Fail fast if JWT_SECRET is missing or insecure — prevents silent token forgery
const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret || _jwtSecret === "payroll-local-dev-secret") {
  console.error("FATAL: JWT_SECRET is not set or is using the insecure default value.");
  console.error("Add a strong JWT_SECRET to your .env file and restart the server.");
  console.error("Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"");
  process.exit(1);
}

const app = new Elysia()
  .use(
    cors({
      origin: (process.env.ALLOWED_ORIGINS ?? "http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080,http://127.0.0.1:8081")
        .split(",")
        .map((o) => o.trim()),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-Id",
      ],
      credentials: true,
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET!,
      exp: "8h",
    })
  )

  .get("/", () => ({
    ok: true,
    message: "Payroll backend is running",
  }))

  .get("/test-db", async () => {
    // Disabled in production — use health check (GET /) instead
    if (process.env.NODE_ENV === "production") {
      return { ok: false, message: "Not available in production" };
    }
    try {
      await prisma.$queryRaw`SELECT 1 AS ok`;
      return { ok: true, result: { ok: 1 } };
    } catch (err) {
      console.error("❌ TEST DB ERROR:", err);
      return { ok: false, error: String(err) };
    }
  })

  .use(authRoute)
  .use(attendanceRoute)
  .use(fieldAttendanceRoute)
  .use(employeeRoute)
  .use(payrollRoute)
  .use(dashboardRoute)
  .use(userManagementRoute)

  .onError(({ code, error, set, request }) => {
    const url = new URL(request.url).pathname;
    const err = error as Error;
    const ctx = extractJwtContext(request);

    // Structured error log — includes endpoint, authenticated user, and full stack
    console.error(
      `[api.error]\n` +
      `  endpoint=${url}\n` +
      `  user=${ctx.username}\n` +
      `  companyId=${ctx.companyId}\n` +
      `  role=${ctx.role}\n` +
      `  code=${code}\n` +
      `  error=${err.message}\n` +
      `  stack=${err.stack ?? "(no stack)"}`
    );

    switch (code) {
      case "NOT_FOUND":
        set.status = 404;
        break;
      case "VALIDATION":
        set.status = 400;
        break;
      case "INTERNAL_SERVER_ERROR":
        set.status = 500;
        break;
      default:
        set.status =
          code === "UNKNOWN" && err.message.includes("ซิงค์") ? 423 : 500;
        break;
    }

    // Never expose internal error details (DB errors, stack traces) to clients in production
    const safeMessage =
      code === "INTERNAL_SERVER_ERROR" && process.env.NODE_ENV === "production"
        ? "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง"
        : err.message;

    return {
      ok: false,
      code,
      message: safeMessage,
    };
  });

app.listen({
  port: 3001,
  idleTimeout: 180,
});

console.log("Server running on http://localhost:3001");

// ── Startup DB diagnostics ─────────────────────────────────────────────────
// Runs once after the server starts. Logs environment, database identity,
// and MariaDB version so errors can be correlated to the correct DB instance.
async function runStartupDiagnostics() {
  const rawUrl = process.env.DATABASE_URL ?? "(not set)";
  console.log(`[env] NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`);
  console.log(`[db]  DATABASE_URL=${maskDatabaseUrl(rawUrl)}`);
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT DATABASE() AS current_db, VERSION() AS version, @@hostname AS host
    `;
    const r = rows[0];
    console.log(`[db]  current_database=${r?.current_db ?? "(null)"}`);
    console.log(`[db]  version=${r?.version ?? "(null)"}`);
    console.log(`[db]  host=${r?.host ?? "(null)"}`);
  } catch (err) {
    console.error("[db]  Startup diagnostics query FAILED:", String(err));
  }
}

runStartupDiagnostics();
