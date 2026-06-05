# BigInt Serialization Fix Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Error:** `JSON.stringify cannot serialize BigInt`

---

## Root Cause

`prisma.$queryRaw()` uses the MySQL/MariaDB driver which returns JavaScript `BigInt` for:
- `SUM(...)` aggregate columns → `work_days`, `total_ot1`, `total_ot15`, `total_ot2`, `total_ot_hours`
- `ANY_VALUE(INT column)` → `company_id`
- `COALESCE(ANY_VALUE(DECIMAL), 0)` → `deduction_amount`

`applyWageToRow` and `withDeductionBreakdown` both use `{ ...row }` object spread.  
Only the fields they explicitly compute are overridden with safe `number` values.  
All other fields — including `work_days`, `total_ot1`, `total_ot_hours`, `company_id` — passed through the spread unchanged as BigInt.

When Bun/Node serialized the final response with `JSON.stringify`, it threw because BigInt is not a valid JSON primitive.

**Fields confirmed as BigInt from raw SQL:**

| Field | SQL expression | Type returned |
|---|---|---|
| `work_days` | `SUM(a.is_present)` | BigInt |
| `total_ot1` | `SUM(COALESCE(a.ot1, 0))` | BigInt |
| `total_ot15` | `SUM(COALESCE(a.ot15, 0))` | BigInt |
| `total_ot2` | `SUM(COALESCE(a.ot2, 0))` | BigInt |
| `total_ot_hours` | `SUM(COALESCE(a.ot_hours, 0))` | BigInt |
| `company_id` | `ANY_VALUE(e.company_id)` | BigInt |
| `deduction_amount` | `COALESCE(ANY_VALUE(e.debt_amount), 0)` | BigInt |

---

## Fix

Added `normalizeSqlRow()` to `payroll.service.ts` — a shallow BigInt-to-Number converter applied to every raw SQL row **before** it enters `applyWageToRow` / `withDeductionBreakdown`.

```typescript
function normalizeSqlRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}
```

**Why shallow is sufficient:** raw SQL rows are always flat objects — no nested objects or arrays.  
**Why not JSON.parse/stringify:** explicit loop avoids a JSON round-trip and is more readable.

---

## Changes Applied

### `enrichRows` (batch path — used by `getPayrollSummary` and `getPayrollSummaryLive`)
```typescript
// Before
return rows.map((row) => {
  const wage = resolveWageForRow(row, wageMap);
  return withDeductionBreakdown(applyWageToRow(row, wage));
});

// After
return rows.map((row) => {
  const safe = normalizeSqlRow(row);
  const wage = resolveWageForRow(safe, wageMap);
  return withDeductionBreakdown(applyWageToRow(safe, wage));
});
```

### `getPayrollByEmployeeCode` (single-row path)
```typescript
// Before
const wageMap = await getWageConfigsForCompanies([rows[0].company_id ?? null]);
const wage = resolveWageForRow(rows[0], wageMap);
return withDeductionBreakdown(applyWageToRow(rows[0], wage));

// After
const safe = normalizeSqlRow(rows[0]);
const wageMap = await getWageConfigsForCompanies([safe.company_id as number | null ?? null]);
const wage = resolveWageForRow(safe, wageMap);
return withDeductionBreakdown(applyWageToRow(safe, wage));
```

---

## Why Dashboard Was Not Affected

`dashboard.route.ts` constructs a **fresh return object** from explicit `Number()` casts:
```typescript
const workDays = Number(r.work_days ?? 0);   // BigInt → number
const ot       = Number(r.total_ot ?? 0);
const ot15     = Number(r.total_ot15 ?? 0);
// ...
return { code, name, department, workDays, ot, totalIncome };
// ↑ no raw row spread — only explicitly cast values
```
No raw fields leak into the response, so no fix needed there.

---

## Files Changed

| File | Change |
|---|---|
| `src/modules/payroll/payroll.service.ts` | Added `normalizeSqlRow()` helper; applied to row in `enrichRows` and `getPayrollByEmployeeCode` |

---

## Validation Results

| Check | Result |
|---|---|
| `bunx prisma validate` | ✅ PASS |
| `bunx tsc --noEmit` | ✅ PASS — 0 errors |
| `bun test` | ✅ PASS — 16/16 |

---

## Deploy

```bash
pm2 restart payroll-backend

# Test:
curl -H "Authorization: Bearer <token>" \
  "http://localhost:<PORT>/payroll?startDate=2026-05-01&endDate=2026-05-31"
# Expected: 200 OK — JSON array with number fields (no BigInt error)
```

---

## Full Fix Timeline (This Session)

| # | Error | Fix |
|---|---|---|
| 1 | `payroll_wage_config.company_id does not exist` | Re-ran `bunx prisma generate` (stale client) |
| 2 | MySQL 1055 — `a.employee_code` nonaggregated | Wrapped with `ANY_VALUE(a.employee_code)` in 2 SELECT positions |
| 3 | Prisma `in: BigInt` validation error | Added `Number(id)` conversion in `getWageConfigsForCompanies` |
| 4 | `JSON.stringify cannot serialize BigInt` | Added `normalizeSqlRow()` — converts all BigInt in raw rows before spread |
