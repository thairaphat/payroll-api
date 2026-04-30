import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";
import { dashboardRoute } from "./modules/dashboard/dashboard.route";
import { prisma } from "./db";

const app = new Elysia()
  .use(
    cors({
      origin: "http://localhost:8080",
    })
  )

  // ✅ route test ว่า backend ยังรัน
  .get("/", () => ({
    ok: true,
    message: "Payroll backend is running",
  }))

  // ✅ route test database
  .get("/test-db", async () => {
    try {
      const result = await prisma.$queryRawUnsafe("SELECT 1 AS ok");
      return { ok: true, result };
    } catch (err) {
      console.error("❌ TEST DB ERROR:", err);
      return {
        ok: false,
        error: String(err),
      };
    }
  })

  // ✅ จับ error ทุก route
  .onError(({ code, error, set, request }) => {
  const url = request.url;
   const err = error as Error;
  console.error("❌ API ERROR:", {
    url,
    code,
    message: err.message,
    stack: err.stack,
  });

  set.status = 500;

  return {
    ok: false,
    url,
    code,
    message: err.message,
  };
})

  .use(attendanceRoute)
  .use(employeeRoute)
  .use(payrollRoute)
  .use(dashboardRoute);

app.listen(3001);

console.log("Server running on http://localhost:3001");