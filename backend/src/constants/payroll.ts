// FALLBACK CONSTANTS — used only when no active row exists in payroll_wage_config.
// Do NOT rely on these in production. Insert a row into payroll_wage_config instead.
// See: src/services/wage-config.service.ts
export const DAILY_WAGE = 372;
export const WORK_HOURS = 8;
export const HOURLY_RATE = DAILY_WAGE / WORK_HOURS; // 46.5 THB/hr
