# URGENT Payroll Fix Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Severity:** Production blocker — GET /payroll returning errors

---

## Two Errors Fixed

### Error 1: `payroll_wage_config.company_id` does not exist

**Root cause:** `company_id Int?` was added to `payroll_wage_config` in `schema.prisma` but `bunx prisma generate` had not been re-run since. The Prisma client in `node_modules` was stale and did not know about the column — even though the column already existed in the live database (`bunx prisma db push` reported "already in sync").

**Fix:** Re-ran `bunx prisma generate` to regenerate the Prisma client from the current schema.

```
bunx prisma generate
# Output: ✔ Generated Prisma Client (v7.8.0) to .\node_modules\@prisma\client
```

No schema or DB change was needed — the DB was already correct.

---

### Error 2: MySQL 1055 — ONLY_FULL_GROUP_BY (Expression #1, `a.employee_code`)

**Root cause:** Two SELECT positions in `buildPayrollSql` used `a.employee_code` as a raw (non-aggregate) reference inside a COALESCE:

```sql
-- BROKEN
COALESCE(ANY_VALUE(m.emp_code), a.employee_code) AS employee_code

-- ...and inside employee_name level-5 fallback:
COALESCE(ANY_VALUE(m.emp_code), a.employee_code)
```

`a.employee_code` is NOT directly listed in the GROUP BY clause — it only appears as part of `COALESCE(m.emp_code, a.employee_code)` in GROUP BY. MySQL's ONLY_FULL_GROUP_BY analyzes column references individually, not as full expressions. It saw `a.employee_code` without an aggregate wrapper and rejected it.

The earlier fix (wrapping `m.emp_code`) was incomplete — the second argument of the COALESCE also required `ANY_VALUE`.

**Fix:** Wrapped `a.employee_code` with `ANY_VALUE` in both positions:

```sql
-- FIXED (position 1 — employee_code SELECT)
COALESCE(ANY_VALUE(m.emp_code), ANY_VALUE(a.employee_code)) AS employee_code

-- FIXED (position 2 — level-5 fallback inside employee_name COALESCE)
COALESCE(ANY_VALUE(m.emp_code), ANY_VALUE(a.employee_code))
```

**Why `ANY_VALUE(a.employee_code)` is safe:**  
Within each GROUP BY group `COALESCE(m.emp_code, a.employee_code)`, all `attendance_records` rows share the same resolved employee code. For employees with a mapping, `a.employee_code` is always the same sheet code (the mapping is UNIQUE). For employees without a mapping, `a.employee_code` is the GROUP BY key itself. `ANY_VALUE` is deterministic here.

**Fields that did NOT need changes (already safe):**
- `a.employee_name` — directly in GROUP BY
- `a.branch_code` — directly in GROUP BY
- `ANY_VALUE(e.*)` — already wrapped
- `SUM(a.*)` — already aggregated

---

## Final SELECT audit (all fields — GROUP BY safe)

| SELECT field | Safe because |
|---|---|
| `COALESCE(ANY_VALUE(m.emp_code), ANY_VALUE(a.employee_code))` | Both wrapped in ANY_VALUE |
| `NULLIF(TRIM(a.employee_name), '')` inside COALESCE | `a.employee_name` is GROUP BY key |
| `ANY_VALUE(e.first_name_th/last_name_th/...)` | ANY_VALUE |
| `COALESCE(ANY_VALUE(m.emp_code), ANY_VALUE(a.employee_code))` (level-5) | Both wrapped |
| `a.branch_code` | Direct GROUP BY key |
| `ANY_VALUE(e.company_id)` | ANY_VALUE |
| `SUM(a.is_present / ot1 / ot15 / ot2 / ot_hours)` | SUM aggregate |
| `COALESCE(ANY_VALUE(e.debt_amount), 0)` | ANY_VALUE |

---

## Files Changed

| File | Change |
|---|---|
| `src/modules/payroll/payroll.service.ts` | Wrapped `a.employee_code` in `ANY_VALUE()` at two SELECT positions in `buildPayrollSql` |

## DB / Prisma Commands Run

| Command | Result |
|---|---|
| `bunx prisma db push` | "already in sync" — column existed, no change needed |
| `bunx prisma generate` | ✅ Regenerated client v7.8.0 — fixes Error 1 |

---

## Validation Results

| Check | Result |
|---|---|
| `bunx prisma validate` | ✅ PASS |
| `bunx tsc --noEmit` | ✅ PASS — 0 errors |
| `bun test` | ✅ PASS — 16/16 |

---

## Deploy Steps

```bash
pm2 restart payroll-backend

# Verify:
curl -H "Authorization: Bearer <token>" \
  "http://localhost:<PORT>/payroll?startDate=2026-05-01&endDate=2026-05-31"
# Expected: 200 OK, array of payroll rows with base_income / gross_income etc.
```

---

## Remaining Risks

| Risk | Severity | Notes |
|---|---|---|
| No company-specific wage rows in DB | Low | Falls back to global row → hardcoded constant; payroll still works |
| `pm2 restart` needed before fix takes effect | Medium | Old process still holds stale Prisma client in memory |
| Dashboard SQL | None | Already clean — groups by `a.employee_code, a.employee_name` (direct keys) |

---

## SQL Fallback (if db push is blocked)

The DB already has `company_id`. If a fresh environment needs it:

```sql
ALTER TABLE payroll_wage_config ADD COLUMN company_id INT NULL;
CREATE INDEX idx_wage_config_lookup ON payroll_wage_config (company_id, effective_date, is_active);
```
