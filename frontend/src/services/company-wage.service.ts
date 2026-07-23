import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type CompanyWageConfig = {
  id: string;
  companyId: number;
  dailyWage: string;
  workHoursPerDay: string;
  ot1Multiplier: string;
  ot15Multiplier: string;
  ot2Multiplier: string;
  ot3Multiplier: string;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyWageRow = {
  companyId: number;
  companyName: string;
  wageConfig: CompanyWageConfig | null;
};

export type CompanyWageInput = {
  dailyWage: string;
  workHoursPerDay: string;
  ot1Multiplier: string;
  ot15Multiplier: string;
  ot2Multiplier: string;
  ot3Multiplier: string;
  isActive: boolean;
};

export class CompanyWageApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "CompanyWageApiError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new CompanyWageApiError(
      json?.message ?? "Company wage request failed",
      json?.code
    );
  }
  return json.data as T;
}

export async function fetchCompanyWages(): Promise<CompanyWageRow[]> {
  const response = await authFetch(`${API_URL}/admin/company-wages`);
  const data = await readResponse<{ items: CompanyWageRow[] }>(response);
  return data.items;
}

export async function createCompanyWage(
  companyId: number,
  input: CompanyWageInput
): Promise<CompanyWageConfig> {
  const response = await authFetch(`${API_URL}/admin/company-wages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, ...input }),
  });
  return readResponse<CompanyWageConfig>(response);
}

export async function updateCompanyWage(
  companyId: number,
  input: CompanyWageInput
): Promise<CompanyWageConfig> {
  const response = await authFetch(`${API_URL}/admin/company-wages/${companyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse<CompanyWageConfig>(response);
}
