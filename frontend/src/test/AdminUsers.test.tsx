import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminUsers from "@/pages/AdminUsers";
import { getCompanies } from "@/services/employee.service";
import { fetchManagedUsers } from "@/services/user-management.service";

vi.mock("@/services/employee.service", () => ({ getCompanies: vi.fn() }));
vi.mock("@/services/user-management.service", () => ({
  fetchManagedUsers: vi.fn(),
  createManagedUser: vi.fn(),
  updateManagedUser: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminUsers /></QueryClientProvider>);
}

describe("AdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCompanies).mockResolvedValue([{ id: 25, company_name: "Company A" }]);
    vi.mocked(fetchManagedUsers).mockResolvedValue([]);
  });

  it("does not offer cyd_admin in the company role filter", async () => {
    renderPage();
    expect(await screen.findByRole("option", { name: "Company A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "cyd_admin" })).not.toBeInTheDocument();
  });

  it("renders an empty state for a company without users", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("บริษัท"), { target: { value: "25" } });
    expect(await screen.findByText("ไม่พบผู้ใช้งาน")).toBeInTheDocument();
    expect(fetchManagedUsers).toHaveBeenCalledWith(25);
  });

  it("shows an API error without crashing", async () => {
    vi.mocked(fetchManagedUsers).mockRejectedValue(new Error("network error"));
    renderPage();
    fireEvent.change(await screen.findByLabelText("บริษัท"), { target: { value: "25" } });
    expect(await screen.findByText("โหลดผู้ใช้งานไม่สำเร็จ")).toBeInTheDocument();
  });
});
