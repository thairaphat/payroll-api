import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollErrorNotice } from "@/components/payroll/PayrollErrorNotice";
import {
  PayrollApiError,
  fetchPayrollSummary,
  isWageNotConfiguredError,
  payrollQueryRetry,
} from "@/services/payroll.service";
import { authFetch } from "@/lib/authz";

vi.mock("@/lib/authz", () => ({ authFetch: vi.fn() }));

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("payroll structured API errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps status, code, message, and companyId from the response body", async () => {
    vi.mocked(authFetch).mockResolvedValue(response(422, {
      code: "COMPANY_WAGE_NOT_CONFIGURED",
      message: "Active wage configuration is required for company ID 16",
      companyId: 16,
    }));

    await expect(fetchPayrollSummary()).rejects.toMatchObject({
      status: 422,
      code: "COMPANY_WAGE_NOT_CONFIGURED",
      message: "Active wage configuration is required for company ID 16",
      companyId: 16,
    });
    expect(authFetch).toHaveBeenCalledTimes(1);
  });

  it("recognizes the legacy message-only 422 response", async () => {
    vi.mocked(authFetch).mockResolvedValue(response(422, {
      message: "Active wage configuration is required for company ID 16",
    }));
    try {
      await fetchPayrollSummary();
      throw new Error("Expected fetchPayrollSummary to reject");
    } catch (error) {
      expect(isWageNotConfiguredError(error)).toBe(true);
    }
  });

  it("does not retry wage configuration errors but preserves one retry otherwise", () => {
    const wageError = new PayrollApiError(
      "Active wage configuration is required for company ID 16",
      422,
      "WAGE_CONFIG_NOT_FOUND",
      16
    );
    expect(payrollQueryRetry(0, wageError)).toBe(false);
    expect(payrollQueryRetry(0, new PayrollApiError("Unauthorized", 401))).toBe(true);
    expect(payrollQueryRetry(1, new PayrollApiError("Forbidden", 403))).toBe(false);
    expect(payrollQueryRetry(1, new PayrollApiError("Server error", 500))).toBe(false);
  });
});

describe("payroll wage configuration notice", () => {
  const backendMessage =
    "Active wage configuration is required for company ID 16";
  const error = new PayrollApiError(
    backendMessage,
    422,
    "COMPANY_WAGE_NOT_CONFIGURED",
    16
  );

  it("shows the Thai warning and hides generic/backend error text", () => {
    render(<PayrollErrorNotice error={error} role="admin" />);
    expect(screen.getByText("ยังไม่สามารถคำนวณเงินเดือนได้")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่ได้ตั้งค่าค่าแรง กรุณาติดต่อแอดมิน")).toBeInTheDocument();
    expect(screen.queryByText("Error loading payroll")).not.toBeInTheDocument();
    expect(screen.queryByText(backendMessage)).not.toBeInTheDocument();
  });

  it("does not show the management button to a company admin", () => {
    render(<PayrollErrorNotice error={error} role="admin" />);
    expect(
      screen.queryByRole("link", { name: "ไปหน้าจัดการค่าแรงบริษัท" })
    ).not.toBeInTheDocument();
  });

  it("shows cyd_admin a link to company wage management", () => {
    render(<PayrollErrorNotice error={error} role="cyd_admin" />);
    const link = screen.getByRole("link", {
      name: "ไปหน้าจัดการค่าแรงบริษัท",
    });
    expect(link).toHaveAttribute("href", "/admin/company-wages");
  });

  it.each([401, 403, 500])(
    "keeps generic handling for HTTP %s",
    (status) => {
      render(
        <PayrollErrorNotice
          error={new PayrollApiError("Original backend error", status)}
          role="admin"
        />
      );
      expect(screen.getByText("Error loading payroll")).toBeInTheDocument();
    }
  );
});
