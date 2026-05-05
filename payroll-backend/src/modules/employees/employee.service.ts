import { prisma } from "../../db";

export async function getAllEmployees() {
  const result = await prisma.$queryRawUnsafe<any[]>(`
    SELECT DISTINCT
      e.id,
      e.emp_code,
      e.company_id,
      e.first_name,
      e.last_name,
      e.first_name_th,
      e.last_name_th,
      e.passport_number,
      e.employment_status,
      e.insurance_status,
      e.debt_amount,
      c.company_name,
      m.sheet_employee_code,
      1 AS is_matched
    FROM attendance_records a
    LEFT JOIN employee_code_mapping m
      ON a.employee_code = m.sheet_employee_code
    LEFT JOIN employee_document_profiles e
      ON e.emp_code = COALESCE(m.emp_code, a.employee_code)
    LEFT JOIN companies c
      ON e.company_id = c.id
    WHERE e.emp_code IS NOT NULL
      AND e.emp_code <> ''
      AND e.emp_code <> '-'
  `);

  return result.map((row) => ({
    ...row,
    id: Number(row.id),
    company_id: row.company_id == null ? null : Number(row.company_id),
    debt_amount: row.debt_amount == null ? 0 : Number(row.debt_amount),
    is_matched: Boolean(Number(row.is_matched)),
  }));
}

export async function getEmployeesByCompany(companyId: number) {
  const employees = await prisma.employee_document_profiles.findMany({
    where: {
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      first_name: true,
      last_name: true,
      first_name_th: true,
      last_name_th: true,
      employment_status: true,
      insurance_status: true,
      debt_amount: true,
      created_at: true,
    },
    orderBy: { id: "desc" },
  });

  const company = await prisma.companies.findUnique({
    where: { id: companyId },
  });

  return employees.map((emp) => ({
    ...emp,
    company_name: company?.company_name || "-",
  }));
}

/**
 * Get attendance codes that don't directly match any emp_code in profiles 
 * and aren't mapped yet.
 */
export async function getUnmappedAttendanceCodes() {
  // 1. Get all unique attendance records
  const attendance = await prisma.attendance_records.findMany({
    select: { 
      employee_code: true,
      employee_name: true,
      employee_code_13: true,
      branch_code: true
    },
    distinct: ['employee_code']
  });

  // 2. Get all existing profile codes
  const profiles = await prisma.employee_document_profiles.findMany({
    select: { emp_code: true }
  });
  const profileCodes = new Set(profiles.map(p => p.emp_code).filter(Boolean));

  // 3. Get all existing mappings
  const mappings = await prisma.employee_code_mapping.findMany({
    select: { sheet_employee_code: true }
  });
  const mappedCodes = new Set(mappings.map(m => m.sheet_employee_code));

  // Filter out those that are already matched or mapped
  return attendance.filter(a => 
    !profileCodes.has(a.employee_code) && !mappedCodes.has(a.employee_code)
  );
}

export async function createEmployeeMapping(sheet_employee_code: string, emp_code: string) {
  return await prisma.employee_code_mapping.upsert({
    where: { sheet_employee_code },
    update: { emp_code },
    create: { sheet_employee_code, emp_code }
  });
}
