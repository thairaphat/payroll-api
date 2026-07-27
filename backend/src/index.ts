import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { payrollRunRoute } from "./modules/payroll-runs/payroll-run.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { fieldAttendanceRoute } from "./modules/attendance/field-attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";
import { dashboardRoute } from "./modules/dashboard/dashboard.route";
import { authRoute } from "./modules/auth/auth.route";
import { userManagementRoute } from "./modules/users/user-management.route";
import { companyWageRoute } from "./modules/company-wages/company-wage.route";
import { prisma } from "./db";
import { maskDatabaseUrl } from "./diag";
import {
  logInternalError,
  safeErrorResponse,
} from "./middlewares/error.middleware";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === "payroll-local-dev-secret") {
  console.error(
    "FATAL: JWT_SECRET is not set or is using the insecure default value."
  );
  console.error("Add a strong JWT_SECRET to your environment and restart.");
  process.exit(1);
}

const app = new Elysia()
  .use(
    cors({
      origin: (
        process.env.ALLOWED_ORIGINS ??
        "http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080,http://127.0.0.1:8081"
      )
        .split(",")
        .map((origin) => origin.trim()),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      credentials: true,
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: jwtSecret,
      exp: "8h",
    })
  )
  .get("/", () => ({
    ok: true,
    message: "Payroll backend is running",
  }))
  .get("/test-db", async () => {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, message: "Not available in production" };
    }
    try {
      await prisma.$queryRaw`SELECT 1 AS ok`;
      return { ok: true, result: { ok: 1 } };
    } catch (error) {
      console.error("[test-db] Query failed");
      return { ok: false, error: "Database test failed" };
    }
  })
  .use(authRoute)
  .use(attendanceRoute)
  .use(fieldAttendanceRoute)
  .use(employeeRoute)
  .use(payrollRunRoute)
  .use(payrollRoute)
  .use(dashboardRoute)
  .use(userManagementRoute)
  .use(companyWageRoute)
  .onError(({ code, error, set, request }) => {
    const endpoint = new URL(request.url).pathname;
    const requestId =
      request.headers.get("x-request-id") ?? crypto.randomUUID();
    const safe = safeErrorResponse({
      error,
      frameworkCode: String(code),
    });

    logInternalError({ error, requestId, endpoint });
    set.status = safe.status;
    return { ok: false, ...safe.payload };
  });

app.listen({
  port: Number(process.env.PORT ?? 3001),
  idleTimeout: 180,
});

console.log(`Server running on http://localhost:${app.server?.port ?? 3001}`);

async function runStartupDiagnostics() {
  const rawUrl = process.env.DATABASE_URL ?? "(not set)";
  console.log(`[env] NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`);
  console.log(`[db] DATABASE_URL=${maskDatabaseUrl(rawUrl)}`);
  try {
    const rows = await prisma.$queryRaw<
      Array<{ current_db?: string; version?: string; host?: string }>
    >`SELECT DATABASE() AS current_db, VERSION() AS version, @@hostname AS host`;
    const row = rows[0];
    console.log(`[db] current_database=${row?.current_db ?? "(null)"}`);
    console.log(`[db] version=${row?.version ?? "(null)"}`);
    console.log(`[db] host=${row?.host ?? "(null)"}`);
  } catch {
    console.error("[db] Startup diagnostics query failed");
  }
}

runStartupDiagnostics();
