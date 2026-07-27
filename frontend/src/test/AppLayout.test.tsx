import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import AppLayout from "@/layouts/AppLayout";
import { useAuth } from "@/store/auth";

function renderLayout(role: string, companyId: number | null = 39) {
  useAuth.setState({
    user: { id: "user-1", username: "very-long-payroll-username", role, companyId },
    token: "token",
  });
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("responsive application layout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens and closes the mobile navigation drawer with accessible controls", () => {
    renderLayout("admin");
    fireEvent.click(screen.getByRole("button", { name: "เปิดเมนูนำทาง" }));
    expect(screen.getByRole("complementary", { name: "เมนูหลัก" })).toHaveClass(
      "translate-x-0"
    );
    fireEvent.click(screen.getByRole("button", { name: "ปิดเมนู" }));
    expect(screen.getByRole("complementary", { name: "เมนูหลัก" })).toHaveClass(
      "-translate-x-full"
    );
  });

  it("supports desktop sidebar collapse without hiding accessible names", () => {
    renderLayout("admin");
    fireEvent.click(screen.getByRole("button", { name: "ย่อแถบเมนู" }));
    expect(localStorage.getItem("payroll_sidebar_collapsed")).toBe("true");
    expect(screen.getByTitle("เงินเดือน")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ขยายแถบเมนู" })).toBeInTheDocument();
  });

  it("keeps long user and company context in truncating containers", () => {
    renderLayout("admin", 39);
    expect(screen.getAllByText("very-long-payroll-username")[0]).toHaveClass("truncate");
    expect(screen.getAllByText("บริษัท #39").length).toBeGreaterThan(0);
  });

  it.each([
    ["hr", ["พนักงาน", "^บันทึกเข้าออกงาน$", "^เงินเดือน$"], ["จัดการผู้ใช้งาน"]],
    ["accounting", ["^เงินเดือน$", "ประวัติการบันทึกเข้าออกงาน"], ["พนักงาน"]],
    ["field_staff", ["บันทึกเข้าออกงาน"], ["เงินเดือน", "พนักงาน"]],
    ["viewer", ["หน้าหลัก"], ["เงินเดือน", "พนักงาน"]],
  ])("shows role-appropriate navigation for %s", (role, visible, hidden) => {
    renderLayout(role);
    for (const label of visible) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
    for (const label of hidden) {
      expect(screen.queryByRole("link", { name: new RegExp(label) })).not.toBeInTheDocument();
    }
  });
});
