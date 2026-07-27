import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PayrollRunApiError,
  isPayrollRunSchemaNotInitializedError,
  payrollRunQueryRetry,
  payrollRunQueryKey,
  payrollRunsQueryKey,
} from "@/services/payroll-run.service";

const source = (file: string) =>
  readFile(path.resolve(process.cwd(), `src/${file}`), "utf8");

describe("monthly payroll run UI", () => {
  it("keeps company and year in the list query key", () => {
    expect(payrollRunsQueryKey("16", 2026)).not.toEqual(
      payrollRunsQueryKey("18", 2026)
    );
  });
  it("keeps company and run ID in detail and item query keys", () => {
    expect(payrollRunQueryKey("1", "16")).not.toEqual(
      payrollRunQueryKey("1", "18")
    );
  });
  it("requires cyd_admin to select a company before querying", async () => {
    const text = await source("pages/PayrollRuns.tsx");
    expect(text).toContain("!isCydAdmin || companyId !== undefined");
    expect(text).toContain("กรุณาเลือกบริษัท");
  });
  it("shows run lifecycle actions by role and status", async () => {
    const text = await source("pages/PayrollRunDetail.tsx");
    for (const label of ["คำนวณ", "ส่งตรวจ", "อนุมัติ", "ล็อกรอบเงินเดือน", "บันทึกว่าจ่ายแล้ว", "ยกเลิกรอบ"]) {
      expect(text).toContain(label);
    }
  });
  it("marks pre-lock documents as draft evidence", async () => {
    const text = await source("pages/PayrollRunDetail.tsx");
    expect(text).toContain(
      "เอกสารนี้ยังไม่ใช่หลักฐานการจ่ายเงินจริง"
    );
    expect(text).toContain('pdf.text("DRAFT"');
  });
  it("list detail and export all use selected company scope", async () => {
    const service = await source("services/payroll-run.service.ts");
    const detail = await source("pages/PayrollRunDetail.tsx");
    expect(service).toContain("/payroll/runs/${encodeURIComponent(runId)}");
    expect(service).toContain("companyQuery(companyId)");
    expect(service).toContain("/export");
    expect(detail).toContain("generateNativePayrollSlipPdf(");
    expect(detail).toContain("const snapshotRows = await exportPayrollRunItems(");
    expect(detail).toContain("payrollRunItemToPdf(rows[index])");
  });
  it("renders database/API errors instead of an empty list", async () => {
    const text = await source("pages/PayrollRuns.tsx");
    expect(text).toContain("runs.isError");
    expect(text).toContain("โหลดรอบเงินเดือนไม่สำเร็จ");
    expect(text).toContain("runs.refetch()");
  });
  it("RUN-SCHEMA-006 renders the migration-required state", async () => {
    const error = new PayrollRunApiError(
      "migration required",
      503,
      "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED"
    );
    expect(isPayrollRunSchemaNotInitializedError(error)).toBe(true);
    expect(await source("pages/PayrollRuns.tsx")).toContain(
      "ระบบรอบเงินเดือนยังไม่ได้เปิดใช้งานในฐานข้อมูล กรุณาดำเนินการ Migration ก่อน"
    );
  });
  it("RUN-SCHEMA-007 keeps legacy Payroll on its live data service", async () => {
    const payroll = await source("pages/Payroll.tsx");
    expect(payroll).toContain("fetchPayrollSummary");
    expect(payroll).not.toContain("listPayrollRuns");
  });
  it("RUN-GATE-006 disables automatic retry only for missing schema", () => {
    const schemaError = new PayrollRunApiError(
      "migration required",
      503,
      "PAYROLL_RUN_SCHEMA_NOT_INITIALIZED"
    );
    expect(payrollRunQueryRetry(0, schemaError)).toBe(false);
    expect(payrollRunQueryRetry(0, new Error("timeout"))).toBe(true);
  });
  it("RUN-GATE-007 waits for detail readiness before loading child items", async () => {
    const detail = await source("pages/PayrollRunDetail.tsx");
    expect(detail).toContain("enabled: enabled && run.isSuccess");
    expect(detail).toContain("retry: payrollRunQueryRetry");
  });
});
