import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { mapTodayFieldEntry } from "@/lib/dashboard-attendance";
import { authFetch } from "@/lib/authz";
import { useAuth } from "@/store/auth";

vi.mock("@/lib/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/authz")>();
  return { ...actual, authFetch: vi.fn() };
});

vi.mock("@/services/employee.service", () => ({
  getCompanies: vi.fn().mockResolvedValue([]),
}));

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard attendance summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.setState({
      user: { id: "1", username: "admin", role: "admin", companyId: 40 },
      token: "token",
    });
  });

  it("DASH-ATT-010 maps the backend response fields used by the UI", () => {
    expect(
      mapTodayFieldEntry({
        total: "2",
        draft: 2,
        submitted: 0,
        approved: 0,
        latestEntry: "2026-07-24T02:00:00.000Z",
      })
    ).toEqual({
      total: 2,
      draft: 2,
      submitted: 0,
      approved: 0,
      latestEntry: "2026-07-24T02:00:00.000Z",
    });
  });

  it("DASH-ATT-011 shows an error state instead of silent zeroes", async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "failed" }), { status: 500 })
    );
    renderDashboard();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Today Entered")).not.toBeInTheDocument();
  });

  it("DASH-ATT-012 invalidates the dashboard after attendance writes", () => {
    const fieldSource = readFileSync(
      path.resolve(process.cwd(), "src/pages/FieldAttendanceEntry.tsx"),
      "utf8"
    );
    const attendanceSource = readFileSync(
      path.resolve(process.cwd(), "src/pages/Attendance.tsx"),
      "utf8"
    );
    expect(fieldSource).toContain(
      'invalidateQueries({ queryKey: ["dashboard-summary"] })'
    );
    expect(attendanceSource).toContain(
      'invalidateQueries({ queryKey: ["dashboard-summary"] })'
    );
  });
});
