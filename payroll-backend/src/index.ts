import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { fieldAttendanceRoute } from "./modules/attendance/field-attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";
import { dashboardRoute } from "./modules/dashboard/dashboard.route";
import { prisma } from "./db";

const app = new Elysia()
  .use(
    cors({
      origin: "http://localhost:8081",
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
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
    });

    // กำหนด Status Code ตามความเหมาะสม
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
        // ถ้าเป็น Error ทั่วไปที่เรา throw เอง เช่น "ระบบกำลังซิงค์"
        set.status = code === "UNKNOWN" && err.message.includes("ซิงค์") ? 423 : 500;
        break;
    }

    return {
      ok: false,
      url,
      code,
      message: err.message,
    };
  })

  .use(attendanceRoute)
  .use(fieldAttendanceRoute)
  .use(employeeRoute)
  .use(payrollRoute)
  .use(dashboardRoute);

app.listen({
  port: 3001,
  idleTimeout: 180,
});

console.log("Server running on http://localhost:3001");