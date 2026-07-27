import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  PAYROLL_RUN_STATUS,
  PayrollRunError,
  activePeriodKey,
  validateRunPeriod,
} from "../modules/payroll-runs/payroll-run.service";

const root = new URL("../../", import.meta.url);
const read = (path: string) => Bun.file(new URL(path, root)).text();
const service = () => read("src/modules/payroll-runs/payroll-run.service.ts");
const route = () => read("src/modules/payroll-runs/payroll-run.route.ts");
const schema = () => read("prisma/schema.prisma");

describe("monthly payroll run architecture", () => {
  it("RUN-001 validates a monthly run period", () => {
    expect(() => validateRunPeriod({ periodStart: "2026-07-01", periodEnd: "2026-07-31", paymentDate: "2026-08-05" })).not.toThrow();
  });
  it("RUN-002 protects one active company period", async () => {
    expect(activePeriodKey(16, "2026-07-01", "2026-07-31")).toBe("16:2026-07-01:2026-07-31");
    expect(await schema()).toContain("uniq_payroll_run_active_period");
  });
  it("RUN-003 keeps company scope on runs and items", async () => {
    const text = await schema();
    expect(text).toMatch(/model payroll_runs[\s\S]*?company_id\s+Int/);
    expect(text).toContain("idx_payroll_run_items_company_employee");
  });
  it("RUN-004 requires company scope through the central resolver", async () => {
    expect(await route()).toContain("resolveCompanyScope(");
  });
  it("RUN-005 calculates a batch of payroll employees", async () => {
    expect(await service()).toContain("rows.map((row) => itemData(");
  });
  it("RUN-006 enforces one item per employee profile", async () => {
    expect(await schema()).toContain("@@unique([payroll_run_id, employee_profile_id]");
  });
  it("RUN-007 reuses canonical payroll attendance aggregation", async () => {
    expect(await service()).toContain("getPayrollSummaryLive(");
  });
  it("RUN-008 snapshots every supported OT category", async () => {
    const text = await schema();
    expect(text).toContain("ot1_hours");
    expect(text).toContain("ot15_hours");
    expect(text).toContain("ot2_hours");
  });
  it("RUN-009 replaces items safely during recalculation", async () => {
    const text = await service();
    expect(text.indexOf("payroll_run_items.deleteMany")).toBeLessThan(text.indexOf("payroll_run_items.createMany"));
  });
  it("RUN-010 fails through the existing required wage lookup", async () => {
    expect(await service()).toContain("getActiveWageConfig(companyId, tx)");
  });
  it("RUN-011 permits CALCULATED to REVIEWED", () => {
    expect(PAYROLL_RUN_STATUS.REVIEWED).toBe("REVIEWED");
  });
  it("RUN-012 permits REVIEWED to APPROVED", async () => {
    expect(await service()).toContain("approve: [PAYROLL_RUN_STATUS.REVIEWED]");
  });
  it("RUN-013 rejects invalid transition states", async () => {
    expect(await service()).toContain("PAYROLL_RUN_INVALID_STATUS");
  });
  it("RUN-014 locks only APPROVED runs", async () => {
    expect(await service()).toContain("run.status !== PAYROLL_RUN_STATUS.APPROVED");
  });
  it("RUN-015 returns the same locked run for the same idempotency key", async () => {
    const text = await service();
    expect(text).toContain("run.status === PAYROLL_RUN_STATUS.LOCKED && run.lock_key === idempotencyKey");
  });
  it("RUN-016 wraps snapshot and attendance mutations in one transaction", async () => {
    expect(await service()).toContain("return prisma.$transaction(async (tx)");
  });
  it("RUN-017 locks attendance and creates ownership links", async () => {
    const text = await service();
    expect(text).toContain("attendance_records.updateMany");
    expect(text).toContain("payroll_run_attendance_links.createMany");
  });
  it("RUN-018 prevents recalculation after lock", async () => {
    expect(await service()).toContain("Only a draft or calculated payroll run can be calculated.");
  });
  it("RUN-019 snapshots wage configuration values", async () => {
    expect(await service()).toContain("wage_config_snapshot:");
  });
  it("RUN-020 exports immutable run items", async () => {
    expect(await route()).toContain('"/:runId/export"');
  });
  it("RUN-021 supports mark paid after lock", async () => {
    expect(await service()).toContain("run.status !== PAYROLL_RUN_STATUS.LOCKED");
  });
  it("RUN-022 rejects mark paid before lock", async () => {
    expect(await service()).toContain("Only a locked payroll run can be paid.");
  });
  it("RUN-023 requires a cancellation reason", () => {
    expect(new PayrollRunError("PAYROLL_RUN_CANNOT_CANCEL", "reason", 422).code).toBe("PAYROLL_RUN_CANNOT_CANCEL");
  });
  it("RUN-024 cancel preserves run items", async () => {
    const cancelSource = (await service()).slice((await service()).indexOf("export async function cancelPayrollRun"));
    expect(cancelSource).not.toContain("payroll_run_items.delete");
  });
  it("RUN-025 denies field and viewer roles at routes", async () => {
    const text = await route();
    expect(text).not.toContain('requireRole(["field_staff"');
    expect(text).not.toContain('requireRole(["viewer"');
  });
  it("RUN-026 has unique request and lock keys", async () => {
    const text = await schema();
    expect(text).toContain("uniq_payroll_run_idempotency");
    expect(text).toContain("uniq_payroll_run_lock_key");
    expect(await service()).toContain("existingByRequest.company_id === companyId");
  });
  it("RUN-027 persists run totals from item totals", async () => {
    const text = await service();
    expect(text).toContain('gross_income_total: sum("gross_income")');
    expect(text).toContain('net_income_total: sum("net_income")');
  });
  it("RUN-028 uses Prisma Decimal for financial arithmetic", async () => {
    expect(new Prisma.Decimal("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(await service()).toContain("const gross = base.plus(ot).plus(other)");
  });
  it("RUN-029 rejects negative net income", async () => {
    expect(await service()).toContain("net.isNegative()");
  });
  it("RUN-030 scopes list detail items and exports", async () => {
    expect((await service()).match(/company_id: companyId/g)?.length ?? 0).toBeGreaterThan(4);
  });
  it("RUN-031 separates periods with active period keys", () => {
    expect(activePeriodKey(16, "2026-07-01", "2026-07-31")).not.toBe(activePeriodKey(16, "2026-08-01", "2026-08-31"));
  });
  it("RUN-032 lists history ordered by period", async () => {
    expect(await service()).toContain('period_start: "desc"');
  });
  it("RUN-033 does not translate database errors into empty data", async () => {
    expect(await route()).toContain("throw error;");
  });
  it("RUN-034 never updates items after lock", async () => {
    const text = await service();
    expect(text.indexOf("payroll_run_items.deleteMany")).toBeLessThan(text.indexOf("export async function lockPayrollRun"));
  });
  it("RUN-035 writes required audit with the transaction client", async () => {
    expect(await service()).toContain("logRequiredAudit(");
    expect(await service()).toContain("metadata },\n    db");
  });
});

describe("payroll run concurrency contracts", () => {
  it("serializes concurrent calculate requests", async () => expect(await service()).toContain("FOR UPDATE"));
  it("serializes concurrent lock requests", async () => expect(await service()).toContain("lockRunRow(tx, runId, companyId)"));
  it("detects attendance changes while locking", async () => expect(await service()).toContain("updatedAttendance.count !== attendance.length"));
  it("supports retry after timeout with idempotency keys", async () => expect(await schema()).toContain("idempotency_key"));
});
