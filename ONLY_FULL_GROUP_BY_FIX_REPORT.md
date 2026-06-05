# MySQL ONLY_FULL_GROUP_BY Fix — Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Scope:** Fix MySQL error 1055 in `buildPayrollSql` without disabling `sql_mode`

---

## Root Cause

MySQL's `ONLY_FULL_GROUP_BY` mode requires every column in a SELECT list to either:
- Be part of the GROUP BY clause, OR
- Be wrapped in an aggregate function (`ANY_VALUE`, `MAX`, `MIN`, `SUM`, etc.)

`buildPayrollSql` had two SELECT positions that referenced `m.emp_code` (from the LEFT JOIN) as a raw column reference inside `COALESCE`:

```sql
-- POSITION 1 — employee_code column
COALESCE(m.emp_code, a.employee_code) AS employee_code

-- POSITION 2 — Level-5 fallback inside employee_name COALESCE
COALESCE(ANY_VALUE(m.emp_code), a.employee_code)
```

MySQL rejected these because `m.emp_code` is not a GROUP BY key and not directly wrapped in an aggregate. Even though `COALESCE(m.emp_code, a.employee_code)` is the GROUP BY key (same expression), MySQL's ONLY_FULL_GROUP_BY analysis tracks individual column references, not the full expression.

---

## Exact SQL Change

**File:** `src/modules/payroll/payroll.service.ts` — `buildPayrollSql()`

### Before (broken)
```sql
COALESCE(m.emp_code, a.employee_code) AS employee_code,

COALESCE(
  NULLIF(TRIM(a.employee_name), ''),
  ...
  COALESCE(m.emp_code, a.employee_code)   -- Level-5 fallback
) AS employee_name,
```

### After (fixed)
```sql
-- ANY_VALUE(m.emp_code) satisfies ONLY_FULL_GROUP_BY: m.emp_code is from a
-- LEFT JOIN on a UNIQUE key (sheet_employee_code), so each group contains
-- exactly one m.emp_code value — ANY_VALUE is deterministic here.
COALESCE(ANY_VALUE(m.emp_code), a.employee_code) AS employee_code,

COALESCE(
  NULLIF(TRIM(a.employee_name), ''),
  ...
  COALESCE(ANY_VALUE(m.emp_code), a.employee_code)   -- Level-5 fallback
) AS employee_name,
```

**Why `ANY_VALUE` is safe here:** `employee_code_mapping.sheet_employee_code` is a UNIQUE key. The LEFT JOIN condition is `a.employee_code = m.sheet_employee_code`, so each GROUP BY group can have at most one matching `m` row. `ANY_VALUE(m.emp_code)` is deterministic — not random — because there is only one value per group.

**GROUP BY unchanged:**
```sql
GROUP BY COALESCE(m.emp_code, a.employee_code), a.employee_name, a.branch_code
```

---

## Dashboard Check

`dashboard.route.ts` was reviewed and was already clean:
- Groups by `a.employee_code, a.employee_name` (both are `attendance_records` columns, not joined columns)
- All JOIN-derived fields (`branch_code`, `company_id`) already used `ANY_VALUE()`
- No changes needed

---

## Files Changed

| File | Change |
|---|---|
| `src/modules/payroll/payroll.service.ts` | Wrapped two `m.emp_code` references with `ANY_VALUE()` in SELECT; added explanatory comment |

---

## Validation Results

| Check | Result |
|---|---|
| `bunx prisma validate` | **PASS** ✅ |
| `bunx tsc --noEmit` | **PASS** ✅ — 0 errors |
| `bun test` | **PASS** ✅ — 16/16 |

---

## Deploy Steps

```bash
pm2 restart payroll-backend
# Then verify:
curl -H "Authorization: Bearer <token>" "http://localhost:PORT/payroll?startDate=2026-05-01&endDate=2026-05-31"
```

Expected: 200 OK with employee rows — no more MySQL error 1055.

---

## Rollback

If needed, revert only `src/modules/payroll/payroll.service.ts`. No schema changes were made. No data is affected.
