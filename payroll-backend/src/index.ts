import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { payrollRoute } from "./modules/payroll/payroll.route";
import { attendanceRoute } from "./modules/attendance/attendance.route";
import { employeeRoute } from "./modules/employees/employee.route";

const app = new Elysia();

app.use(cors({
  origin: "http://localhost:8080",
}));

app.use(attendanceRoute);
app.use(employeeRoute);
app.use(payrollRoute);
app.listen(3001);

console.log("Server running on http://localhost:3001");