import { prisma } from "../db";
import { logAudit } from "./audit.service";
import type { AuthUser } from "../middlewares/auth.middleware";

export interface ProvisioningInput {
  employeeCode: string;
  employeeName?: string;
  companyId?: number | null;
  source: string;
  sourceSheetId?: string | null;
  actor?: AuthUser | null;
}

async function resolveEmpCode(employeeCode: string): Promise<string> {
  try {
    const mapping = await prisma.employee_code_mapping.findFirst({
      where: { sheet_employee_code: employeeCode },
      select: { emp_code: true },
    });
    return mapping?.emp_code ?? employeeCode;
  } catch {
    return employeeCode;
  }
}

/**
 * Creates a provisional employee_document_profiles row if none exists for the resolved emp_code.
 * Returns true if a new profile was created, false if one already existed or on error.
 *
 * NEVER throws — errors are swallowed and logged so sync/field attendance flows are never blocked.
 */
export async function ensureEmployeeProfileForAttendance(
  input: ProvisioningInput
): Promise<boolean> {
  const { employeeCode, employeeName, companyId = null, source, sourceSheetId = null, actor = null } = input;

  if (!employeeCode) return false;

  try {
    const empCode = await resolveEmpCode(employeeCode);

    const existing = await prisma.employee_document_profiles.findFirst({
      where: { emp_code: empCode },
      select: { id: true },
    });

    if (existing) return false;

    const resolvedName = (employeeName ?? "").trim() || empCode;

    await prisma.employee_document_profiles.create({
      data: {
        emp_code: empCode,
        // Populate both base field and Thai field so all name-resolution
        // paths (SQL Level 2 and Level 4) find the provisioned name.
        first_name: resolvedName,
        last_name: "",
        first_name_th: resolvedName,
        last_name_th: "",
        employment_status: "AUTO_CREATED",
        company_id: companyId,
        is_document_complete: false,
        debt_amount: 0,
      },
    });

    await logAudit(
      "employee.auto_created",
      "employee",
      { sourceSheetId: sourceSheetId ?? undefined },
      actor,
      {
        employee_code: employeeCode,
        emp_code: empCode,
        employee_name: employeeName ?? "",
        source,
        source_sheet_id: sourceSheetId,
      }
    );

    console.info(
      "[provisioning] Auto-created profile emp_code=%s (employee_code=%s source=%s)",
      empCode,
      employeeCode,
      source
    );

    return true;
  } catch (err) {
    console.error(
      "[provisioning] Failed to provision profile for employee_code=%s:",
      employeeCode,
      err
    );
    return false;
  }
}

/**
 * Batch version — deduplicates by employeeCode and calls ensureEmployeeProfileForAttendance
 * for each unique code. Returns the number of new profiles created.
 */
export async function ensureEmployeeProfilesForBatch(
  rows: Array<{ employeeCode: string; employeeName?: string }>,
  source: string,
  sourceSheetId?: string | null,
  actor?: AuthUser | null,
  companyId?: number | null
): Promise<number> {
  if (rows.length === 0) return 0;

  const seen = new Set<string>();
  let created = 0;

  for (const row of rows) {
    if (!row.employeeCode || seen.has(row.employeeCode)) continue;
    seen.add(row.employeeCode);

    const wasCreated = await ensureEmployeeProfileForAttendance({
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      companyId: companyId ?? null,
      source,
      sourceSheetId: sourceSheetId ?? null,
      actor: actor ?? null,
    });

    if (wasCreated) created++;
  }

  if (created > 0) {
    console.info("[provisioning] Batch complete: %d new profiles created (source=%s)", created, source);
  }

  return created;
}
