# Attendance List Name Fix Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain

---

## Frontend Page Found

**File:** `payroll-companion/src/pages/Attendance.tsx`  
**Page title:** "ประวัติการมาทำงาน" / "การมาทำงาน"

The page calls `getAttendanceRecords()` which hits:
```
GET /api/sheets/attendance?startDate=...&endDate=...&company=...&approvalStatus=...
```

---

## Backend Endpoint Found

**File:** `payroll-backend/src/modules/attendance/attendance.route.ts`  
**Route:** `GET /api/sheets/attendance` (lines 92–110 before fix)

---

## Root Cause

The handler used `prisma.attendance_records.findMany()` and returned raw rows as-is:

```typescript
// BEFORE — returned raw attendance_records with no name resolution
const [data, total] = await Promise.all([
  prisma.attendance_records.findMany({ where, orderBy, skip, take }),
  prisma.attendance_records.count({ where }),
]);
return { ok: true, data, total, page, pageSize };
```

`attendance_records.employee_name` is populated at sync/entry time. For employees created via auto-provisioning, or for records where the name was blank in the source sheet, `employee_name` is stored as `""` or `" "`. The endpoint returned this blank value directly with no fallback to `employee_document_profiles`.

Additionally, sheet-synced records may store a `sheet_employee_code` (e.g. `"hhh3333332"`) as `employee_code`, which maps to a canonical `emp_code` in `employee_code_mapping`. The endpoint was not using this mapping to find the profile.

---

## Fix Applied

After fetching `data`, added a **3-query enrichment pipeline** (2 extra queries per request):

### Step 1 — Resolve sheet codes via employee_code_mapping
```typescript
const mappings = await prisma.employee_code_mapping.findMany({
  where: { sheet_employee_code: { in: rawCodes } },
  select: { sheet_employee_code: true, emp_code: true },
});
const codeMap = new Map(mappings.map((m) => [m.sheet_employee_code, m.emp_code]));
```

### Step 2 — Batch-fetch profiles for resolved codes
```typescript
const empCodes = [...new Set(rawCodes.map((c) => codeMap.get(c) ?? c))];
const profiles = await prisma.employee_document_profiles.findMany({
  where: { emp_code: { in: empCodes } },
  select: { emp_code, first_name, last_name, first_name_th, last_name_th, first_name_en, last_name_en },
});
```

### Step 3 — Name fallback chain per row
```typescript
const trimmed  = (r.employee_name ?? "").trim();
const thName   = `${p?.first_name_th} ${p?.last_name_th}`.trim();
const enName   = `${p?.first_name_en} ${p?.last_name_en}`.trim();
const baseName = `${p?.first_name} ${p?.last_name}`.trim();
const resolvedName = trimmed || thName || enName || baseName || r.employee_code;
```

Also added `display_name` field and overrode `first_name`/`last_name` with Thai names from profile when available.

---

## Before / After Response Example

### Before
```json
{
  "employee_code": "hhh3333332",
  "employee_name": " ",
  "first_name": null,
  "last_name": null
}
```

### After
```json
{
  "employee_code": "hhh3333332",
  "employee_name": "test1 test1",
  "display_name": "test1 test1",
  "first_name": "test1",
  "last_name": "test1"
}
```

---

## Files Changed

| File | Change |
|---|---|
| `src/modules/attendance/attendance.route.ts` | `GET /api/sheets/attendance` — added post-fetch profile enrichment + name resolution |

---

## Query Cost

| Query | Count | Type |
|---|---|---|
| `attendance_records.findMany` + `.count` | 2 (parallel) | Prisma ORM |
| `employee_code_mapping.findMany` | 1 (IN clause) | Prisma ORM |
| `employee_document_profiles.findMany` | 1 (IN clause) | Prisma ORM |

**Total: 4 queries per request** — all efficient IN-clause lookups, single round-trips regardless of page size.

---

## Validation Results

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | ✅ PASS — 0 errors |
| `bun test` | ✅ PASS — 16/16 |

---

## Deploy

```bash
pm2 restart payroll-backend

# Test:
curl -H "Authorization: Bearer <token>" \
  "http://localhost:<PORT>/api/sheets/attendance?startDate=2026-05-01&endDate=2026-05-31"
# Expected: employee_name shows Thai name or full name, not blank or employee_code
```
