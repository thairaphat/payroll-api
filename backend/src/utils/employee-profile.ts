export type EmployeeProfileStatus = "FOUND" | "NOT_FOUND";

export function normalizeEmployeeCode(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toUpperCase();
}

export function isUsableEmployeeName(value: unknown) {
  const name = String(value ?? "").trim();
  return Boolean(name) && name.toUpperCase() !== "UNKNOWN";
}

export function resolveProfileDisplayName(profile: {
  first_name_th?: string | null;
  last_name_th?: string | null;
  first_name_en?: string | null;
  last_name_en?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) {
  const thai =
    `${profile.first_name_th ?? ""} ${profile.last_name_th ?? ""}`.trim();
  const english =
    `${profile.first_name_en ?? ""} ${profile.last_name_en ?? ""}`.trim();
  const base = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return thai || english || base || null;
}
