import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { requireRole } from "../../middlewares/auth.middleware";
import { DAILY_WAGE, HOURLY_RATE } from "../../constants/payroll";
import {
  TEST_CODE_PREFIX_FIELD,
  TEST_CODE_PREFIX_MVP,
  TEST_EMPLOYEE_NAME,
} from "../../constants/attendance";

export const dashboardRoute = new Elysia().get(
  "/dashboard/summary",
  async () => {
    const totalEmployeeProfiles = await prisma.employee_document_profiles.count();

    // ANY_VALUE(branch_code) picks one branch per employee group (avoids GROUP BY branch_code
    // which would split employees who have records in multiple branches).
    // ot15 and ot2 are the paid OT types — matches payroll.service.ts income formula.
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        employee_code,
        employee_name,
        ANY_VALUE(branch_code)         AS branch_code,
        COUNT(DISTINCT work_date)      AS work_days,
        SUM(ot_hours)                  AS total_ot,
        SUM(COALESCE(ot15, 0))         AS total_ot15,
        SUM(COALESCE(ot2, 0))          AS total_ot2
      FROM attendance_records
      WHERE employee_code NOT LIKE ${TEST_CODE_PREFIX_FIELD}
        AND employee_code NOT LIKE ${TEST_CODE_PREFIX_MVP}
        AND employee_name <> ${TEST_EMPLOYEE_NAME}
      GROUP BY employee_code, employee_name
      ORDER BY employee_code ASC
    `);

    const employees = rows.map((r) => {
      const workDays = Number(r.work_days ?? 0);
      const ot = Number(r.total_ot ?? 0);
      const ot15 = Number(r.total_ot15 ?? 0);
      const ot2 = Number(r.total_ot2 ?? 0);

      // Mirror payroll.service.ts: base + ot1.5 + ot2 (ot1 is not a paid type)
      const totalIncome =
        workDays * DAILY_WAGE +
        ot15 * HOURLY_RATE * 1.5 +
        ot2 * HOURLY_RATE * 2;

      return {
        code: r.employee_code,
        name: r.employee_name,
        department: r.branch_code ?? null,
        workDays,
        ot,
        totalIncome,
      };
    });

    return {
      totalEmployeeProfiles,
      totalEmployees: employees.length,
      totalSalary: employees.reduce((sum, e) => sum + e.totalIncome, 0),
      totalOt: employees.reduce((sum, e) => sum + e.ot, 0),
      notIssuedPayslip: employees.length,
      employees,
    };
  },
  { beforeHandle: requireRole(["admin", "viewer"]) }
);
