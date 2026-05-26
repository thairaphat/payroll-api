export const APPROVAL_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

// SQL LIKE patterns (include trailing %)
export const TEST_CODE_PREFIX_FIELD = "FIELD_TEST%";
export const TEST_CODE_PREFIX_MVP = "MVPLOCK%";
export const TEST_EMPLOYEE_NAME = "Field Smoke";

// ORM startsWith prefixes (no %)
export const TEST_CODE_STARTS_FIELD = "FIELD_TEST";
export const TEST_CODE_STARTS_MVP = "MVPLOCK";

// Prisma NOT filter that excludes test/smoke records — reuse across routes
export const TEST_RECORD_WHERE = [
  { employee_code: { startsWith: TEST_CODE_STARTS_FIELD } },
  { employee_code: { startsWith: TEST_CODE_STARTS_MVP } },
  { employee_name: TEST_EMPLOYEE_NAME },
] as const;

export const FIELD_APP_SHEET_ID = "FIELD_APP";
