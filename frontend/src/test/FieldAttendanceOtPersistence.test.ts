import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getEmployeeCodeDisplay,
  materializePendingOt,
  normalizeFieldAttendanceRecord,
  type FieldAttendanceRecord,
} from "@/lib/field-attendance";
import { isUsableEmployeeName } from "@/lib/employee-profile";

function record(
  overrides: Partial<FieldAttendanceRecord> = {}
): FieldAttendanceRecord {
  return {
    employee_code: "CYD31193",
    employee_code_13: "",
    employee_name: "Employee",
    employee_profile_status: "FOUND",
    first_name: "Employee",
    last_name: "",
    branch_code: "",
    start_time: "08:00",
    work_time: "08:00-17:00",
    work_type_2: "",
    note: "",
    ot1: 0,
    ot15: 0,
    ot2: 0,
    half_day: false,
    leave_day: false,
    ...overrides,
  };
}

describe("Field Attendance OT persistence mapping", () => {
  it("ATT-OT-002 reloads two saved OT hours from the API response", () => {
    const loaded = normalizeFieldAttendanceRecord(
      { ...record(), ot2: "2.00" },
      isUsableEmployeeName
    );
    expect(loaded.ot2).toBe(2);
  });

  it("ATT-OT-007 display suffix keeps the full stable employee identity", () => {
    const loaded = record();
    expect(getEmployeeCodeDisplay(loaded.employee_code)).toBe("193");
    expect(loaded.employee_code).toBe("CYD31193");
  });

  it("ATT-OT-015 reload mapping preserves all saved form values", () => {
    const loaded = normalizeFieldAttendanceRecord(
      {
        ...record(),
        start_time: "09:00",
        work_time: "09:00-18:00",
        note: "saved",
        ot1: "2.00",
        ot15: "1.50",
        ot2: "1.00",
      },
      isUsableEmployeeName
    );
    expect(loaded).toMatchObject({
      start_time: "09:00",
      work_time: "09:00-18:00",
      note: "saved",
      ot1: 2,
      ot15: 1.5,
      ot2: 1,
    });
  });

  it("ATT-OT-016 pending UI fields map to backend ot1/ot15/ot2 DTO fields", () => {
    const [payload] = materializePendingOt([record()], {
      CYD31193: { type: "ot15", hours: "2" },
    });
    expect(payload).toMatchObject({ ot1: 0, ot15: 2, ot2: 0 });
    expect(payload).not.toHaveProperty("otHours");
    expect(payload).not.toHaveProperty("ot_type");
    const pageSource = readFileSync(
      path.resolve(process.cwd(), "src/pages/FieldAttendanceEntry.tsx"),
      "utf8"
    );
    expect(pageSource).toContain("saveFieldAttendance(date, recordsToSave)");
    expect(pageSource).toContain("getFieldAttendance(date)");
  });

  it("ATT-OT-017 API OT values are not overwritten by zero defaults", () => {
    const loaded = normalizeFieldAttendanceRecord(
      { ...record({ ot1: 3 }), ot1: "3.00" },
      isUsableEmployeeName
    );
    const [unchanged] = materializePendingOt([loaded], {});
    expect(unchanged.ot1).toBe(3);
  });
});
