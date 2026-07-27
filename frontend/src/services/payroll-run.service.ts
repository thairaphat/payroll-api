import { authFetch } from "@/lib/authz";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export type PayrollRunStatus =
  | "DRAFT"
  | "CALCULATED"
  | "REVIEWED"
  | "APPROVED"
  | "LOCKED"
  | "PAID"
  | "CANCELLED";

export type PayrollRun = {
  id: string;
  company_id: number;
  period_start: string;
  period_end: string;
  payment_date: string;
  status: PayrollRunStatus;
  employee_count: number;
  base_income_total: string;
  overtime_income_total: string;
  other_income_total: string;
  gross_income_total: string;
  deduction_total: string;
  net_income_total: string;
  created_by: number;
  locked_by?: number | null;
  locked_at?: string | null;
};

export type PayrollRunItem = {
  id: string;
  payroll_run_id: string;
  employee_profile_id: number;
  employee_code_snapshot: string;
  employee_name_snapshot: string;
  branch_code_snapshot?: string | null;
  wage_config_snapshot?: {
    dailyWage?: string;
    workHoursPerDay?: string;
    ot1Multiplier?: string;
    ot15Multiplier?: string;
    ot2Multiplier?: string;
  } | null;
  work_days: string;
  ot1_hours: string;
  ot15_hours: string;
  ot2_hours: string;
  base_income: string;
  overtime_income: string;
  other_income: string;
  gross_income: string;
  total_deductions: string;
  net_income: string;
  warnings?: unknown;
};

export class PayrollRunApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "PayrollRunApiError";
  }
}

export function isPayrollRunSchemaNotInitializedError(
  error: unknown
): error is PayrollRunApiError {
  return (
    error instanceof PayrollRunApiError &&
    error.status === 503 &&
    error.code === "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED"
  );
}

export function payrollRunQueryRetry(
  failureCount: number,
  error: unknown
) {
  return (
    !isPayrollRunSchemaNotInitializedError(error) &&
    failureCount < 3
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new PayrollRunApiError(
      payload?.message ?? "Unable to load payroll runs",
      response.status,
      payload?.code
    );
  }
  return payload.data;
}

const companyQuery = (companyId?: number) =>
  companyId == null ? "" : `?companyId=${companyId}`;

export function payrollRunsQueryKey(companyId: string, year: number) {
  return ["payroll-runs", companyId, year] as const;
}

export function payrollRunQueryKey(runId: string, companyId: string) {
  return ["payroll-run", runId, companyId] as const;
}

export function listPayrollRuns(companyId?: number, year?: number) {
  const query = new URLSearchParams();
  if (companyId != null) query.set("companyId", String(companyId));
  if (year != null) query.set("year", String(year));
  return request<PayrollRun[]>(
    `/payroll/runs${query.size ? `?${query}` : ""}`
  );
}

export function getPayrollRun(runId: string, companyId?: number) {
  return request<PayrollRun>(
    `/payroll/runs/${encodeURIComponent(runId)}${companyQuery(companyId)}`
  );
}

export function getPayrollRunItems(runId: string, companyId?: number) {
  return request<PayrollRunItem[]>(
    `/payroll/runs/${encodeURIComponent(runId)}/items${companyQuery(companyId)}`
  );
}

export function createPayrollRun(input: {
  companyId?: number;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  idempotencyKey: string;
}) {
  return request<PayrollRun>("/payroll/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function mutatePayrollRun(
  runId: string,
  action:
    | "calculate"
    | "review"
    | "approve"
    | "return"
    | "lock"
    | "mark-paid"
    | "cancel",
  body: Record<string, unknown> = {}
) {
  return request<PayrollRun>(
    `/payroll/runs/${encodeURIComponent(runId)}/${action}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function exportPayrollRunItems(runId: string, companyId?: number) {
  return request<PayrollRunItem[]>(
    `/payroll/runs/${encodeURIComponent(runId)}/export${companyQuery(companyId)}`
  );
}
