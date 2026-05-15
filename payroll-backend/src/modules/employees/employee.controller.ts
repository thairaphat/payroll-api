import {
  getAllEmployees,
  getEmployeesByCompany,
  getCompanies,
  getUnmappedAttendanceCodes,
  createEmployeeMapping,
} from "./employee.service";
import { prisma } from "../../db";

export async function listEmployees() {
  return await getAllEmployees();
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

  return await prisma.employee_document_profiles.create({
    data: {
      emp_code: body.emp_code,
      first_name_th: body.first_name,
      last_name_th: body.last_name,
      company_id: body.company_id ? Number(body.company_id) : null,
      employment_status: "Manual",
    }
  });
}