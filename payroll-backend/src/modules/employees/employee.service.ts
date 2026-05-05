import { prisma } from "../../db";

export async function getAllEmployees() {
  // Matched-only employee query for future use
  /*
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
  */

  const [employees, companies, attendanceRecords, mappings] = await Promise.all([
    prisma.employee_document_profiles.findMany({
      select: {
        id: true,
        emp_code: true,
        company_id: true,
        first_name: true,
        last_name: true,
        first_name_th: true,
        last_name_th: true,
        passport_number: true,
        employment_status: true,
        insurance_status: true,
        debt_amount: true,
        created_at: true,
      },
      orderBy: { id: "desc" },
    }),
    prisma.companies.findMany(),
    prisma.attendance_records.findMany({
      select: { employee_code: true },
      distinct: ["employee_code"],
    }),
    prisma.employee_code_mapping.findMany(),
  ]);

  const companyMap = new Map(companies.map((c) => [c.id, c.company_name]));
  const attendanceCodes = new Set(attendanceRecords.map((a) => a.employee_code));

  // emp_codes that are matched via mapping where sheet_employee_code exists in attendance
  const mappedMatchedEmpCodes = new Set(
    mappings
      .filter((m) => attendanceCodes.has(m.sheet_employee_code))
      .map((m) => m.emp_code)
  );

  return employees.map((emp) => ({
    ...emp,
    id: Number(emp.id),
    company_id: emp.company_id == null ? null : Number(emp.company_id),
    debt_amount: emp.debt_amount == null ? 0 : Number(emp.debt_amount),
    company_name: companyMap.get(emp.company_id || 0) || "-",
    is_matched:
      !!emp.emp_code &&
      (attendanceCodes.has(emp.emp_code) ||
        mappedMatchedEmpCodes.has(emp.emp_code)),
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
