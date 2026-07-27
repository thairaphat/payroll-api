import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFile(path.resolve(process.cwd(), `src/${file}`), "utf8");

describe("modern teal visual theme", () => {
  it("defines the requested semantic color tokens centrally", async () => {
    const css = await source("index.css");
    for (const token of [
      "--color-primary: #14b8a6",
      "--color-primary-hover: #0f766e",
      "--color-primary-soft: #ccfbf1",
      "--color-secondary: #3b82f6",
      "--color-accent-cyan: #06b6d4",
      "--color-accent-coral: #f97366",
      "--color-page: #eff6f7",
      "--color-surface: #ffffff",
      "--color-text: #0f172a",
      "--color-border: #d9e7ea",
      "--color-success: #10b981",
      "--color-danger: #f43f5e",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("uses the teal-to-blue sidebar with readable active navigation", async () => {
    const layout = await source("layouts/AppLayout.tsx");
    expect(layout).toContain("linear-gradient(180deg,#0D9488_0%,#0891B2_55%,#2563EB_100%)");
    expect(layout).toContain("bg-white/20 text-white");
    expect(layout).not.toContain("bg-[#1e3a8a]");
  });

  it("keeps important touch targets at least 44px high", async () => {
    const variants = await source("components/ui/button-variants.ts");
    const css = await source("index.css");
    expect(variants).toContain("min-h-11");
    expect(css).toContain("min-h-11");
  });

  it("presents company overview and user management in Thai", async () => {
    const companies = await source("pages/AdminCompanies.tsx");
    const users = await source("pages/AdminUsers.tsx");
    expect(companies).toContain('title="ภาพรวมทุกบริษัท"');
    expect(companies).toContain("ยังไม่มีข้อมูล");
    expect(companies).not.toContain("Company Overview");
    expect(users).toContain('title="จัดการผู้ใช้งาน"');
    expect(users).toContain("ทุกสิทธิ์");
  });

  it("keeps Payroll Run filters in one responsive panel", async () => {
    const runs = await source("pages/PayrollRuns.tsx");
    expect(runs).toContain("soft-panel grid");
    expect(runs).toContain("payroll-runs-company");
    expect(runs).toContain("payroll-runs-year");
    expect(runs).toContain("สร้างรอบเงินเดือน");
  });
});
