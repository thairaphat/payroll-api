import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Employees from "@/pages/Employees";
import { fetchEmployees, getCompanies } from "@/services/employee.service";
import { useAuth } from "@/store/auth";

vi.mock("@/services/employee.service", () => ({
  fetchEmployees: vi.fn(),
  getCompanies: vi.fn(),
  addManualEmployee: vi.fn(),
}));

function renderEmployees() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Employees />
    </QueryClientProvider>
  );
}

describe("Employees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchEmployees).mockResolvedValue([]);
    vi.mocked(getCompanies).mockResolvedValue([]);
    useAuth.setState({
      user: { id: "1", username: "admin", role: "admin", companyId: 1 },
      token: "test-token",
    });
  });

  it("renders an empty employee list without the removed master-sync control", async () => {
    renderEmployees();

    expect((await screen.findAllByText("ไม่พบข้อมูลพนักงาน")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Sync Employee Master")).not.toBeInTheDocument();
  });

  it("shows the company selector only to CYD administrators", async () => {
    useAuth.setState({
      user: { id: "2", username: "cyd", role: "cyd_admin", companyId: null },
      token: "test-token",
    });
    vi.mocked(getCompanies).mockResolvedValue([{ id: 25, company_name: "Company A" }]);

    const { container } = renderEmployees();

    expect(await screen.findByRole("option", { name: "Company A" })).toBeInTheDocument();
    expect(container.querySelector("#company-scope")).toBeInTheDocument();
    expect(fetchEmployees).not.toHaveBeenCalled();
  });

  it("hides the company selector from a company administrator", async () => {
    const { container } = renderEmployees();
    await screen.findAllByText("ไม่พบข้อมูลพนักงาน");
    expect(container.querySelector("#company-scope")).not.toBeInTheDocument();
  });
});
