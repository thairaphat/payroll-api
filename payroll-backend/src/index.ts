import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { fieldAttendanceRoute } from "./modules/attendance/field-attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";
import { dashboardRoute } from "./modules/dashboard/dashboard.route";
import { authRoute } from "./modules/auth/auth.route";
import { prisma } from "./db";

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
        "X-User-Role",
        "X-User-Id",
        "X-User-Name",
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
    try {
      await prisma.$queryRaw`SELECT 1 AS ok`;
      return { ok: true, result: { ok: 1 } };
    } catch (err) {
      console.error("❌ TEST DB ERROR:", err);
      return {
        ok: false,
        error: String(err),
      };
    }
  })

  .use(authRoute)
  .use(attendanceRoute)
  .use(fieldAttendanceRoute)
  .use(employeeRoute)
  .use(payrollRoute)
  .use(dashboardRoute)

  .onError(({ code, error, set, request }) => {
    const url = request.url;
    const err = error as Error;

    console.error("❌ API ERROR:", {
      url,
      code,
      message: err.message,
    });

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

    return {
      ok: false,
      url,
      code,
      message: err.message,
    };
  });

app.listen({
  port: 3001,
  idleTimeout: 180,
});

console.log("Server running on http://localhost:3001");
