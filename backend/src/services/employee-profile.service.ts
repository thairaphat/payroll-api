import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  normalizeEmployeeCode,
  resolveProfileDisplayName,
  type EmployeeProfileStatus,
} from "../utils/employee-profile";

type ProfileQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

type ProfileRow = {
  emp_code: string;
  company_id: number;
  first_name: string | null;
  last_name: string | null;
  first_name_th: string | null;
  last_name_th: string | null;
  first_name_en: string | null;
  last_name_en: string | null;
};

export type EmployeeProfileResolution = {
  employeeCode: string;
  employeeName: string | null;
  status: EmployeeProfileStatus;
};

export async function resolveCompanyEmployeeProfiles(
  companyId: number,
  employeeCodes: string[],
  db: ProfileQueryClient = prisma
) {
  const normalizedCodes = [
    ...new Set(employeeCodes.map(normalizeEmployeeCode).filter(Boolean)),
  ];
  const result = new Map<string, EmployeeProfileResolution>();
  for (const code of normalizedCodes) {
    result.set(code, { employeeCode: code, employeeName: null, status: "NOT_FOUND" });
  }
  if (normalizedCodes.length === 0) return result;

  const rows = await db.$queryRaw<ProfileRow[]>(Prisma.sql`
    SELECT
      emp_code, company_id,
      first_name, last_name,
      first_name_th, last_name_th,
      first_name_en, last_name_en
    FROM employee_document_profiles
    WHERE company_id = ${companyId}
      AND UPPER(TRIM(emp_code)) IN (${Prisma.join(normalizedCodes)})
  `);

  const grouped = new Map<string, ProfileRow[]>();
  for (const row of rows) {
    const code = normalizeEmployeeCode(row.emp_code);
    grouped.set(code, [...(grouped.get(code) ?? []), row]);
  }
  for (const code of normalizedCodes) {
    const matches = grouped.get(code) ?? [];
    if (matches.length !== 1 || matches[0].company_id !== companyId) continue;
    const employeeName = resolveProfileDisplayName(matches[0]);
    result.set(code, {
      employeeCode: code,
      employeeName,
      status: employeeName ? "FOUND" : "NOT_FOUND",
    });
  }
  return result;
}
