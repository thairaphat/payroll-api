import { prisma } from "../../db";

/**
 * Derives a first/last name pair for the employees response WITHOUT touching the
 * underlying employee_document_profiles row.
 *
 * Rule: when the last name is missing (empty or "-") and the first name holds
 * multiple space-separated words, the last word becomes the last name and the
 * remaining words become the first name. If a real last name already exists it
 * is kept verbatim and no split happens.
 *
 * Examples:
 *   ("สมชาย ใจดี", "")   -> { first: "สมชาย", last: "ใจดี" }
 *   ("สม ชาย ใจดี", "-") -> { first: "สม ชาย", last: "ใจดี" }
 *   ("สมชาย", "")        -> { first: "สมชาย", last: "" }      (single word, no split)
 *   ("สมชาย", "ใจดี")    -> { first: "สมชาย", last: "ใจดี" }  (last exists, keep)
 */
export function splitNameWhenLastMissing(
  firstRaw?: string | null,
  lastRaw?: string | null
): { first: string; last: string } {
  const first = (firstRaw || "").trim();
  const last = (lastRaw || "").trim();
  const lastMissing = last === "" || last === "-";

  if (lastMissing) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const derivedLast = parts.pop() as string;
      return { first: parts.join(" "), last: derivedLast };
    }
  }

  // Real last name present (or first name is a single word) → keep as-is.
  return { first, last: lastMissing ? "" : last };
}

/**
 * Applies splitNameWhenLastMissing() to both the Thai and base name pairs of a
 * profile row and returns the cleaned name fields for the employees response.
 * Pure mapper — the DB row is never written.
 */
function deriveCleanNames(emp: {
  first_name?: string | null;
  last_name?: string | null;
  first_name_th?: string | null;
  last_name_th?: string | null;
}) {
  const th = splitNameWhenLastMissing(emp.first_name_th, emp.last_name_th);
  const base = splitNameWhenLastMissing(emp.first_name, emp.last_name);
  return {
    first_name_th: th.first || null,
    last_name_th: th.last || null,
    first_name: base.first || null,
    last_name: base.last || null,
  };
}

/**
 * Compute a single display name from all available name fields.
 * Priority: first_name_th > first_name_en > first_name (base) > emp_code.
 * Exported so employee.controller.ts can use it when enriching create/update responses.
 */
export function resolveDisplayName(emp: {
  first_name_th?: string | null;
  last_name_th?: string | null;
  first_name_en?: string | null;
  last_name_en?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  emp_code?: string | null;
}): string {
  const th = `${emp.first_name_th || ""} ${emp.last_name_th || ""}`.trim();
  const en = `${emp.first_name_en || ""} ${emp.last_name_en || ""}`.trim();
  const base = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
  return th || en || base || emp.emp_code || "";
}

export async function getAllEmployees(companyId?: number | null) {
  const profileWhere = companyId != null ? { company_id: companyId } : {};

  const [employees, companies, attendanceRecords] = await Promise.all([
    prisma.employee_document_profiles.findMany({
      where: profileWhere,
      select: {
        id: true,
        emp_code: true,
        company_id: true,
        first_name: true,
        last_name: true,
        first_name_th: true,
        last_name_th: true,
        first_name_en: true,
        last_name_en: true,
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
  ]);

  const companyMap = new Map(companies.map((c) => [c.id, c.company_name]));
  const attendanceCodes = new Set(attendanceRecords.map((a) => a.employee_code));

  return employees.map((emp) => {
    const names = deriveCleanNames(emp);
    const cleaned = { ...emp, ...names };
    const full_name_th = `${cleaned.first_name_th || ""} ${cleaned.last_name_th || ""}`.trim() || null;
    const full_name_en = `${cleaned.first_name_en || ""} ${cleaned.last_name_en || ""}`.trim() || null;
    const display_name = resolveDisplayName(cleaned);
    return {
      ...cleaned,
      id: Number(emp.id),
      company_id: emp.company_id == null ? null : Number(emp.company_id),
      debt_amount: emp.debt_amount == null ? 0 : Number(emp.debt_amount),
      company_name: companyMap.get(emp.company_id || 0) || "-",
      is_matched:
        !!emp.emp_code &&
        attendanceCodes.has(emp.emp_code),
      full_name_th,
      full_name_en,
      display_name,
      employee_name: display_name,
    };
  });
}

export async function getEmployeesByCompany(companyId: number) {
  const employees = await prisma.employee_document_profiles.findMany({
    where: {
      company_id: companyId,
    },
    select: {
      id: true,
      emp_code: true,
      company_id: true,
      first_name: true,
      last_name: true,
      first_name_th: true,
      last_name_th: true,
      first_name_en: true,
      last_name_en: true,
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

  return employees.map((emp) => {
    const names = deriveCleanNames(emp);
    const cleaned = { ...emp, ...names };
    const full_name_th = `${cleaned.first_name_th || ""} ${cleaned.last_name_th || ""}`.trim() || null;
    const full_name_en = `${cleaned.first_name_en || ""} ${cleaned.last_name_en || ""}`.trim() || null;
    const display_name = resolveDisplayName(cleaned);
    return {
      ...cleaned,
      company_name: company?.company_name || "-",
      full_name_th,
      full_name_en,
      display_name,
      employee_name: display_name,
    };
  });
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

  // 2. Get all existing profile codes. This legacy helper is intentionally
  // unscoped and is no longer exposed by the route.
  const profiles = await prisma.employee_document_profiles.findMany({
    select: { emp_code: true }
  });
  const profileCodes = new Set(profiles.map(p => p.emp_code).filter(Boolean));

  return attendance.filter((a) => !profileCodes.has(a.employee_code));
}

export async function getCompanies(companyId?: number) {
  return await prisma.companies.findMany({
    where: companyId != null ? { id: companyId } : undefined,
    select: {
      id: true,
      company_name: true,
    },
    orderBy: {
      company_name: "asc",
    },
  });
}

export async function createEmployeeMapping(sheet_employee_code: string, emp_code: string) {
  throw new Error("employee_code_mapping is deprecated and cannot be changed.");
}
