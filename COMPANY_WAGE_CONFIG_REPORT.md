# Company-Based Wage Config — Implementation Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Scope:** Per-company `daily_wage` / `work_hours` for payroll, with safe global fallback

---

## Validation Results

| Check | Result |
|---|---|
| `bunx prisma validate` | **PASS** ✅ |
| `bunx prisma generate` | **PASS** ✅ — v7.8.0 |
| `bunx tsc --noEmit` | **PASS** ✅ — 0 errors |
| `bun test` | **PASS** ✅ — 16/16 |

---

## Problem

`payroll_wage_config` had no `company_id` column.  
`getActiveWageConfig()` returned a single global rate used for all employees, regardless of their company.  
Payroll SQL computed income amounts inline using that single rate — per-company rates were impossible.

---

## Solution: Two-Phase Architecture

### Phase 1 — SQL aggregates only
The payroll SQL now returns raw employee counts and OT hours plus `company_id` (from the `employee_document_profiles` join).  
Income amounts (`base_income`, `ot15_income`, etc.) are **no longer computed in SQL**.

### Phase 2 — JavaScript income calculation per employee
After the SQL returns, the app:
1. Collects all distinct `company_id` values in the result set
2. Fetches the appropriate wage config for each company in a **single DB round-trip** (`getWageConfigsForCompanies`)
3. Calls `applyWageToRow(row, wage)` to compute income amounts for each employee using their company's rate

---

## Fallback Order

For every employee row, the wage config is resolved as:

```
1. payroll_wage_config WHERE company_id = employee.company_id
       AND is_active = 1 AND effective_date <= today
   → most recent effective row wins (ORDER BY effective_date DESC)

2. payroll_wage_config WHERE company_id IS NULL
       AND is_active = 1 AND effective_date <= today
   → global fallback row

3. Hardcoded constant: 372 THB / 8 hours
   → only if DB is unreachable or has no active rows at all
```

Employees with **no profile** (no row in `employee_document_profiles`) fall to Level 2 or 3.

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added `company_id Int?` to `payroll_wage_config`; replaced single-column index with `(company_id, effective_date, is_active)` |
| `src/services/wage-config.service.ts` | `getActiveWageConfig(companyId?)` — company-first + global fallback; added `getWageConfigsForCompanies(ids[])` batch helper |
| `src/modules/payroll/payroll.service.ts` | Removed `wage` param from `buildPayrollSql`; added `company_id` to SELECT; added `applyWageToRow` + `resolveWageForRow`; updated all three exported functions |
| `src/modules/payroll/payroll.route.ts` | `getPayrollSummaryLive` no longer takes `wageConfig`; snapshot saves per-row `daily_wage_used`/`work_hours_used`; audit log updated |
| `src/modules/dashboard/dashboard.route.ts` | Added LEFT JOIN to `employee_document_profiles` to get `company_id`; income now computed per-company via `getWageConfigsForCompanies` |

---

## Key Function: `applyWageToRow`

```typescript
function applyWageToRow(row, wage: WageConfig) {
  const workDays  = num(row.work_days);
  const ot15      = num(row.total_ot15);
  const ot2       = num(row.total_ot2);
  const hourlyRate = wage.daily_wage / wage.work_hours;

  const base_income  = workDays * wage.daily_wage;
  const ot15_income  = ot15 * hourlyRate * 1.5;
  const ot2_income   = ot2  * hourlyRate * 2;
  const gross_income = base_income + ot15_income + ot2_income;

  return {
    ...row,
    base_income, ot15_income, ot2_income, gross_income,
    daily_wage_used: wage.daily_wage,   // ← stored in snapshot per row
    work_hours_used: wage.work_hours,
  };
}
```

---

## Key Function: `getWageConfigsForCompanies`

Single DB round-trip for any number of companies:

```typescript
// Input:  [5, 18, null, 5, null]  (duplicate-safe)
// Output: Map { 5 → {daily_wage:400,work_hours:8},
//               18 → {daily_wage:420,work_hours:8},
//               null → {daily_wage:372,work_hours:8} }  // global fallback always present
```

The `null` key is **always** present in the returned map so callers can write:
```typescript
const wage = wageMap.get(companyId) ?? wageMap.get(null)!;
```

---

## Snapshot Behavior Change

**Before:** snapshot saved a single global `daily_wage_used` for all rows.  
**After:** each snapshot row saves its own `daily_wage_used` — the rate that was actually applied to that specific employee's company.

This means historical snapshots correctly reflect what each employee was paid at, even if different companies had different rates.

---

## SQL Examples — Insert Company Wage Configs

### Single company rate
```sql
INSERT INTO payroll_wage_config
  (company_id, description, daily_wage, work_hours, effective_date, is_active)
VALUES
  (5,  'Company 5 initial wage',  372.00, 8, CURDATE(), 1),
  (18, 'Company 18 initial wage', 400.00, 8, CURDATE(), 1);
```

### Global fallback (applies to all companies without a specific row)
```sql
INSERT INTO payroll_wage_config
  (company_id, description, daily_wage, work_hours, effective_date, is_active)
VALUES
  (NULL, 'Global default wage', 372.00, 8, CURDATE(), 1);
```

### Wage increase effective a future date
```sql
-- Deactivate old company rate
UPDATE payroll_wage_config
SET is_active = 0
WHERE company_id = 5 AND is_active = 1;

-- Insert new rate (active from 2026-07-01)
INSERT INTO payroll_wage_config
  (company_id, description, daily_wage, work_hours, effective_date, is_active)
VALUES
  (5, 'Company 5 Q3 2026 increase', 420.00, 8, '2026-07-01', 1);
```

### Check which rate is in effect per company
```sql
SELECT
  company_id,
  description,
  daily_wage,
  work_hours,
  effective_date
FROM payroll_wage_config
WHERE is_active = 1
  AND effective_date <= CURDATE()
ORDER BY company_id ASC, effective_date DESC;
```

### Check what rate was used for a locked period
```sql
SELECT
  employee_code,
  employee_name,
  daily_wage_used,
  work_hours_used
FROM payroll_snapshots
WHERE lock_key = '2026-05-01_2026-05-31'
ORDER BY employee_code ASC;
```

---

## Deploy Checklist

1. Run `bunx prisma db push` — adds `company_id` column to `payroll_wage_config` (additive, no data loss)
2. Existing global rows remain valid — they now effectively have `company_id = NULL`
3. Insert company-specific rows where different rates apply (SQL above)
4. Restart server: `pm2 restart payroll-backend`
5. Verify server logs show `[wage-config]` messages for expected companies

---

## Rollback

All changes are backward-compatible:
- `company_id` column is nullable — existing rows are unaffected
- `getActiveWageConfig()` without arguments still returns the global config
- If no company-specific row exists, behavior is identical to before
- To rollback code: `git revert` — the `company_id = NULL` rows remain valid as global config
