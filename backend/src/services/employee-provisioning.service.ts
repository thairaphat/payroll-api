/**
 * @deprecated Employee profiles are managed independently from attendance.
 * These no-op exports remain temporarily for compatibility with old imports.
 * New code must validate employee_document_profiles instead of provisioning.
 */
export async function ensureEmployeeProfileForAttendance(): Promise<boolean> {
  return false;
}

/** @deprecated Attendance imports must never create employee profiles. */
export async function ensureEmployeeProfilesForBatch(): Promise<number> {
  return 0;
}
