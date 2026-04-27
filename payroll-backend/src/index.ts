import { Elysia } from "elysia";
import { attendanceRoute } from "./modules/attendance/attendance.route";

const app = new Elysia();

app.use(attendanceRoute);

app.listen(3001);

console.log("Server running on http://localhost:3001");