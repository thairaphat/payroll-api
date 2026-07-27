import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployeeProfileName } from "@/components/employee/EmployeeProfileName";
import {
  isEmployeeProfileMissing,
  isUsableEmployeeName,
} from "@/lib/employee-profile";

describe("employee profile presentation", () => {
  it("EMP-NAME-011 resolves the CYD1096 mock profile", () => {
    render(
      <EmployeeProfileName
        employeeCode="CYD1096"
        employee_name="พนักงาน ตัวอย่าง"
        employee_profile_status="FOUND"
      />
    );
    expect(screen.getByText("พนักงาน ตัวอย่าง")).toBeInTheDocument();
  });

  it("EMP-NAME-006 renders the required Thai missing-profile state", () => {
    render(
      <EmployeeProfileName
        employeeCode="CYD1096"
        employee_name={null}
        employee_profile_status="NOT_FOUND"
      />
    );
    expect(screen.getByText("ไม่พบข้อมูลพนักงาน")).toBeInTheDocument();
    expect(screen.getByText("รหัส CYD1096")).toBeInTheDocument();
    expect(screen.getByText("ข้อมูลพนักงานไม่ครบ")).toBeInTheDocument();
  });

  it("EMP-NAME-009 treats missing profiles as ineligible for payslips", () => {
    expect(
      isEmployeeProfileMissing({
        employee_name: null,
        employee_profile_status: "NOT_FOUND",
      })
    ).toBe(true);
  });

  it("EMP-NAME-007 never silently renders literal UNKNOWN", () => {
    expect(isUsableEmployeeName("UNKNOWN")).toBe(false);
    expect(isEmployeeProfileMissing({ employee_name: "UNKNOWN" })).toBe(true);
  });

  it("EMP-NAME-012 handles the CYD1909 mock missing-profile case", () => {
    render(
      <EmployeeProfileName
        employeeCode="CYD1909"
        employee_name="UNKNOWN"
      />
    );
    expect(screen.queryByText("UNKNOWN")).not.toBeInTheDocument();
    expect(screen.getByText("ไม่พบข้อมูลพนักงาน")).toBeInTheDocument();
  });
});
