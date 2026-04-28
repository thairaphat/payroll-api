import { prisma } from "../../db";

export async function getAllEmployees() {
  const employees = await prisma.employee_document_profiles.findMany({
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

  const companies = await prisma.companies.findMany();

  const result = employees.map((emp) => {
    const company = companies.find(
      (c) => c.id === emp.company_id
    );

    return {
      ...emp,
      company_name: company?.company_name || "-",
    };
  });

  return result;
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