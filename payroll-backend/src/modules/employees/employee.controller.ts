import {
  getAllEmployees,
  getEmployeesByCompany,
} from "./employee.service";

export async function listEmployees() {
  return await getAllEmployees();
}

export async function listEmployeesByCompany(companyId: string) {
  const id = Number(companyId);

  if (Number.isNaN(id)) {
    throw new Error("Invalid company id");
  }

  return await getEmployeesByCompany(id);
}