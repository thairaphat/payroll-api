import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminCompanyWages from "@/pages/AdminCompanyWages";
import {
  createCompanyWage,
  fetchCompanyWages,
  updateCompanyWage,
} from "@/services/company-wage.service";

vi.mock("@/services/company-wage.service", () => ({
  fetchCompanyWages: vi.fn(),
  createCompanyWage: vi.fn(),
  updateCompanyWage: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminCompanyWages />
    </QueryClientProvider>
  );
}

const configured = {
  id: "1",
  companyId: 25,
  dailyWage: "400.00",
  workHoursPerDay: "8.00",
  ot1Multiplier: "1.00",
  ot15Multiplier: "1.50",
  ot2Multiplier: "2.00",
  ot3Multiplier: "3.00",
  isActive: true,
  createdBy: "1",
  updatedBy: "1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("AdminCompanyWages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCompanyWages).mockResolvedValue([
      { companyId: 25, companyName: "Dynamic", wageConfig: configured },
      { companyId: 39, companyName: "Example", wageConfig: null },
    ]);
  });

  it("shows companies with and without wage configuration", async () => {
    renderPage();
    expect(await screen.findByText("Dynamic")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getAllByText("ยังไม่ตั้งค่า")).toHaveLength(2);
  });

  it("resets defaults for a new company and shows hourly preview", async () => {
    renderPage();
    await screen.findByText("Example");
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม" }));
    expect(screen.getByLabelText("ชั่วโมงทำงานต่อวัน")).toHaveValue(8);
    expect(screen.getByLabelText("ตัวคูณ OT 1.5")).toHaveValue(1.5);
    fireEvent.change(screen.getByLabelText("ค่าจ้างต่อวัน"), {
      target: { value: "400" },
    });
    expect(screen.getByText("50.00")).toBeInTheDocument();
  });

  it("validates before submit and prevents duplicate pending submission", async () => {
    let resolveMutation: (value: typeof configured) => void = () => undefined;
    vi.mocked(createCompanyWage).mockImplementation(
      () => new Promise((resolve) => { resolveMutation = resolve; })
    );
    renderPage();
    await screen.findByText("Example");
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม" }));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("กรุณาระบุจำนวนที่มากกว่า 0")).toBeInTheDocument();
    expect(createCompanyWage).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("ค่าจ้างต่อวัน"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(createCompanyWage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "บันทึก" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(createCompanyWage).toHaveBeenCalledTimes(1);
    resolveMutation(configured);
  });

  it("loads existing values and sends an update", async () => {
    vi.mocked(updateCompanyWage).mockResolvedValue(configured);
    renderPage();
    await screen.findByText("Dynamic");
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
    expect(screen.getByLabelText("ค่าจ้างต่อวัน")).toHaveValue(400);
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(updateCompanyWage).toHaveBeenCalledWith(
      25,
      expect.objectContaining({ dailyWage: "400.00" })
    ));
  });
});
