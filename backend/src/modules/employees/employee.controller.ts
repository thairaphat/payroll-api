import {
  getAllEmployees,
  getEmployeesByCompany,
  getCompanies,
  getUnmappedAttendanceCodes,
  createEmployeeMapping,
  resolveDisplayName,
} from "./employee.service";
import { prisma } from "../../db";

export async function listEmployees(companyId?: number | null) {
  return await getAllEmployees(companyId);
}

export async function listCompanies() {
  return await getCompanies();
}

export async function listEmployeesByCompany(companyId: string) {
  const id = Number(companyId);

  if (Number.isNaN(id)) {
    throw new Error("Invalid company id");
  }

  return await getEmployeesByCompany(id);
}

export async function listUnmappedAttendance() {
  return await getUnmappedAttendanceCodes();
}

export async function createMapping(body: { sheet_employee_code: string; emp_code: string }) {
  if (!body.sheet_employee_code || !body.emp_code) {
    throw new Error("Missing sheet_employee_code or emp_code");
  }
  return await createEmployeeMapping(body.sheet_employee_code, body.emp_code);
}

export async function createManualEmployee(body: {
  emp_code: string;
  first_name: string;
  last_name: string;
  company_id?: number;
}) {
  if (!body.emp_code || !body.first_name || !body.last_name) {
    throw new Error("Missing required fields (emp_code, first_name, last_name)");
  }

  // Check if exists
  const existing = await prisma.employee_document_profiles.findFirst({
    where: { emp_code: body.emp_code }
  });

  if (existing) {
    const err = new Error("รหัสพนักงานนี้มีอยู่แล้ว");
    (err as any).status = 409;
    throw err;
  }

  const created = await prisma.employee_document_profiles.create({
    data: {
      emp_code: body.emp_code,
      // Populate both base fields and Thai-name fields so all name-resolution
      // paths (SQL Level 2 = first_name_th, Level 4 = first_name) find a value.
      first_name: body.first_name,
      last_name: body.last_name,
      first_name_th: body.first_name,
      last_name_th: body.last_name,
      company_id: body.company_id ? Number(body.company_id) : null,
      employment_status: "Manual",
    },
  });

  const display_name = resolveDisplayName({
    emp_code: created.emp_code,
    first_name: created.first_name,
    last_name: created.last_name,
    first_name_th: created.first_name_th,
    last_name_th: created.last_name_th,
  });

  return {
    ...created,
    display_name,
    employee_name: display_name,
    full_name_th: `${created.first_name_th || ""} ${created.last_name_th || ""}`.trim() || null,
    full_name_en: null,
  };
}