import { describe, expect, it } from "bun:test";
import {
  getBangkokDateKey,
  summarizeTodayFieldAttendance,
  toDatabaseDate,
  type DashboardAttendanceRow,
} from "../modules/dashboard/dashboard-attendance.service";

const dashboardRouteUrl = new URL(
  "../modules/dashboard/dashboard.route.ts",
  import.meta.url
);

const row = (
  employeeCode: string,
  status: string,
  updatedAt = "2026-07-24T02:00:00.000Z"
): DashboardAttendanceRow => ({
  employee_code: employeeCode,
  approval_status: status,
  updated_at: new Date(updatedAt),
});

describe("dashboard today's field attendance", () => {
  it("DASH-ATT-001 counts two distinct draft employees", () => {
    expect(
      summarizeTodayFieldAttendance([
        row("CYD001", "draft"),
        row("CYD002", "draft"),
      ])
    ).toMatchObject({ total: 2, draft: 2 });
  });

  it("DASH-ATT-002 counts a normalized employee only once", () => {
    expect(
      summarizeTodayFieldAttendance([
        row(" cyd001 ", "draft", "2026-07-24T01:00:00.000Z"),
        row("CYD001", "submitted", "2026-07-24T02:00:00.000Z"),
      ])
    ).toMatchObject({ total: 1, draft: 0, submitted: 1 });
  });

  it("DASH-ATT-003 counts submitted status", () => {
    expect(summarizeTodayFieldAttendance([row("CYD001", "submitted")]))
      .toMatchObject({ submitted: 1 });
  });

  it("DASH-ATT-004 counts approved status", () => {
    expect(summarizeTodayFieldAttendance([row("CYD001", "approved")]))
      .toMatchObject({ approved: 1 });
  });

  it("DASH-ATT-005 filters by exact work_date in the database query", async () => {
    const source = await Bun.file(dashboardRouteUrl).text();
    expect(source).toContain("work_date: todayDate");
    expect(source).not.toContain("work_date: { gte:");
  });

  it("DASH-ATT-006 keeps the company employee-code scope", async () => {
    const source = await Bun.file(dashboardRouteUrl).text();
    expect(source).toContain("employee_code: { in: companyCodes }");
    expect(source).toContain("resolveCompanyScope");
  });

  it("DASH-ATT-007 includes only the FIELD_APP source", async () => {
    const source = await Bun.file(dashboardRouteUrl).text();
    expect(source).toContain("source_sheet_id: FIELD_APP_SHEET_ID");
  });

  it("DASH-ATT-008 maps status case-insensitively", () => {
    expect(
      summarizeTodayFieldAttendance([
        row("CYD001", " DRAFT "),
        row("CYD002", "Submitted"),
        row("CYD003", "APPROVED"),
      ])
    ).toMatchObject({ total: 3, draft: 1, submitted: 1, approved: 1 });
  });

  it("DASH-ATT-009 uses the Asia/Bangkok calendar date without shifting", () => {
    expect(getBangkokDateKey(new Date("2026-07-23T17:30:00.000Z"))).toBe(
      "2026-07-24"
    );
    expect(toDatabaseDate("2026-07-24").toISOString()).toBe(
      "2026-07-24T00:00:00.000Z"
    );
  });
});
