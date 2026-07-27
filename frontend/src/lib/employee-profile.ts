export type EmployeeProfileStatus = "FOUND" | "NOT_FOUND";

export type EmployeeProfileLike = {
  employee_name?: string | null;
  employeeName?: string | null;
  employee_profile_status?: EmployeeProfileStatus;
  employeeProfileStatus?: EmployeeProfileStatus;
};

export function isUsableEmployeeName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().toUpperCase() !== "UNKNOWN"
  );
}

export function isEmployeeProfileMissing(value: EmployeeProfileLike): boolean {
  const status =
    value.employee_profile_status ?? value.employeeProfileStatus;
  const name = value.employee_name ?? value.employeeName;
  return status === "NOT_FOUND" || !isUsableEmployeeName(name);
}

