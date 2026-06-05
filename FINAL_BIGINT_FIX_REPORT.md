# Final Fix — BigInt company_id Conversion

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Error:** `PrismaClientValidationError: Argument 'in': Expected Int or Null, provided (BigInt, BigInt, BigInt)`

---

## Root Cause

MySQL raw queries (`prisma.$queryRaw`) return numeric columns as JavaScript `BigInt` (e.g. `15n`, `12n`, `18n`) when using the MariaDB/MySQL Prisma driver.

`getWageConfigsForCompanies` collected `company_id` values from raw SQL rows and passed them directly into `payroll_wage_config.findMany({ where: { company_id: { in: [...] } } })`.

Prisma's schema defines `company_id Int?` — it expects JavaScript `number`, not `BigInt`. Passing BigInt values caused the `PrismaClientValidationError`.

The type guard `filter((id): id is number => id !== null)` was not sufficient — BigInt passes a `!= null` check but is not of type `number`, so BigInt values were silently let through.

---

## File Changed

`src/services/wage-config.service.ts` — `getWageConfigsForCompanies()`

---

## Before / After

### Before (broken)
```typescript
const uniqueCompanyIds = [
  ...new Set(companyIds.filter((id): id is number => id !== null)),
];
```

### After (fixed)
```typescript
// Raw SQL returns company_id as BigInt on some MySQL drivers — convert to Number
// before passing to Prisma, which expects Int (not BigInt) for Int? fields.
const uniqueCompanyIds = [
  ...new Set(
    companyIds
      .filter((id) => id != null)
      .map((id) => Number(id))
  ),
];
```

`Number(15n)` → `15` — safe for all values that fit in a JS number (all realistic company IDs).

Duplicate removal via `new Set()` is preserved.
Null entries are filtered before `Number()` conversion, so `null` never enters the Set.
The global fallback key (`null`) is added unconditionally after the loop — unchanged.

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

# Verify:
curl -H "Authorization: Bearer <token>" \
  "http://localhost:<PORT>/payroll?startDate=2026-05-01&endDate=2026-05-31"
# Expected: 200 OK, payroll rows with correct income values per company
```

---

## All Three Fixes Applied This Session

| Fix | File | What changed |
|---|---|---|
| Prisma client stale | ran `bunx prisma generate` | Picked up `company_id` column in client |
| MySQL 1055 (`a.employee_code`) | `payroll.service.ts` | Wrapped raw `a.employee_code` in `ANY_VALUE()` at 2 SELECT positions |
| BigInt → Int conversion | `wage-config.service.ts` | Added `.map(id => Number(id))` before Prisma `in` clause |
