import { Elysia } from "elysia";
import { prisma } from "../../db";
export const dashboardRoute = new Elysia().get(
  "/dashboard/summary",
  async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        employee_code,
        employee_name,
        COUNT(DISTINCT work_date) AS work_days,
        SUM(ot_hours) AS total_ot
      FROM attendance_records
      GROUP BY employee_code, employee_name
      ORDER BY employee_code ASC
    `);

    const employees = rows.map((r) => {
      const workDays = Number(r.work_days ?? 0);
      const ot = Number(r.total_ot ?? 0);

      const dailyWage = 400;
      const otRate = 75;

      const totalIncome = workDays * dailyWage + ot * otRate;

      return {
        code: r.employee_code,
        name: r.employee_name,
        department: "CYD",
        workDays,
        ot,
        totalIncome,
      };
    });

    return {
      totalEmployees: employees.length,
      totalSalary: employees.reduce((sum, e) => sum + e.totalIncome, 0),
      totalOt: employees.reduce((sum, e) => sum + e.ot, 0),
      notIssuedPayslip: employees.length,
      employees,
    };
  }
);