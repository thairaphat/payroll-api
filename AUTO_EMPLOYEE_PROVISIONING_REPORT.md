# Auto Employee Provisioning — Implementation Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Scope:** Auto-create `employee_document_profiles` when unknown `employee_code` is seen during attendance sync or field attendance entry

---

## Summary

| Check | Result |
|---|---|
| TypeScript type check | **PASS** ✅ — 0 errors |
| Unit tests (payroll-calc) | **PASS** ✅ — 16/16 pass |
| Prisma schema validation | **PASS** ✅ — schema valid |
| Prisma client generation | **PASS** ✅ — v7.8.0 |

---

## Problem Solved

**Root cause:** `employee_document_profiles` had no records for employees that were inserted directly into `attendance_records` from Google Sheets or the field attendance mobile app. Even after the SQL COALESCE name-resolution fix, employees with no profile row fell through to Level 5 (employee_code as name). HR could not correct names because there was no record to edit.

**Solution:** Auto-provision a provisional profile with `employment_status = "AUTO_CREATED"` on first sight of a new `employee_code`. HR can then fill in the correct name/documents later.

---

## Files Changed

| File | Change | Reason |
|---|---|---|
| `src/services/audit.service.ts` | Added `"employee.auto_created"` to `AuditAction`; `"employee"` to `AuditEntityType` | New audit event type for provisioning |
| `src/services/employee-provisioning.service.ts` | **New file** — `ensureEmployeeProfileForAttendance` + `ensureEmployeeProfilesForBatch` | Core provisioning logic |
| `src/modules/attendance/attendance.service.ts` | Import provisioning service; call `ensureEmployeeProfilesForBatch` after sync inserts/updates | Auto-provision on Google Sheet sync |
| `src/modules/attendance/field-attendance.route.ts` | Import provisioning service; call `ensureEmployeeProfilesForBatch` before upsert loop | Auto-provision on field attendance bulk submit |

---

## Implementation Details

### `employee-provisioning.service.ts`

**`ensureEmployeeProfileForAttendance(input)`**

1. Skip if `employeeCode` is blank
2. Resolve canonical `emp_code` via `employee_code_mapping` (same logic as payroll SQL `COALESCE(m.emp_code, a.employee_code)`)
3. Check if any profile with that `emp_code` already exists (`findFirst`)
4. If exists → return `false` (no-op)
5. If not exists → create profile:
   - `emp_code` = resolved code
   - `first_name_th` = `employeeName || empCode` (Thai name field, visible in payroll)
   - `last_name_th` = `""`
   - `first_name` = `""` (schema NOT NULL with DEFAULT "")
   - `last_name` = `""` (schema NOT NULL with DEFAULT "")
   - `employment_status` = `"AUTO_CREATED"`
   - `company_id` = `null`
   - `is_document_complete` = `false`
   - `debt_amount` = `0`
6. Fire `employee.auto_created` audit log with metadata
7. Log to console (`[provisioning]`)
8. Return `true`

**`ensureEmployeeProfilesForBatch(rows, source, sourceSheetId, actor)`**

- Deduplicates rows by `employeeCode` in memory (Set)
- Calls `ensureEmployeeProfileForAttendance` for each unique code
- Returns count of newly created profiles
- Logs batch summary if any profiles were created

**Error handling:** Both functions use try/catch and NEVER throw. A DB failure during provisioning writes an error to stderr but does not block the sync/field attendance operation.

### Integration: `attendance.service.ts`

Provisioning is called **after** inserts and updates complete, **before** the `latestRows` fetch and audit log:

```typescript
await ensureEmployeeProfilesForBatch(
  (rows as any[]).map((r) => ({ employeeCode: r.employeeCode, employeeName: r.employeeName })),
  "attendance_sync",
  sheetId,
  user ?? null
);
```

All rows from the sheet are provisioned — including rows that were skipped (locked). This ensures the profile exists even if the attendance record itself was not updated.

### Integration: `field-attendance.route.ts`

Provisioning is called **before** the upsert loop:

```typescript
await ensureEmployeeProfilesForBatch(
  records.map((rec: any) => ({
    employeeCode: rec.employee_code,
    employeeName: `${rec.first_name || ""} ${rec.last_name || ""}`.trim() || rec.employee_name || "",
  })),
  "field_attendance",
  FIELD_APP_SHEET_ID,
  user
);
```

This ensures all employees get profiles even if their records later fail due to lock/permission early returns.

---

## Audit Trail

Every auto-created profile writes a `payroll_audit_logs` row:

| Field | Value |
|---|---|
| `action` | `"employee.auto_created"` |
| `entity_type` | `"employee"` |
| `entity_scope.sourceSheetId` | sheet ID that triggered provisioning |
| `metadata.employee_code` | original code from attendance record |
| `metadata.emp_code` | resolved canonical code |
| `metadata.employee_name` | name at time of provisioning |
| `metadata.source` | `"attendance_sync"` or `"field_attendance"` |
| `actor_*` | user who triggered the sync/submit |

---

## Database Impact

- **No schema changes required.** All fields used in the new profile row already exist in `employee_document_profiles`.
- `emp_code` is NOT UNIQUE in schema — `findFirst` check before create prevents duplicates.
- New rows have `employment_status = "AUTO_CREATED"` — HR can identify and complete them via the document management screen.
- `debt_amount = 0` — provisional employees start with no deductions (correct).
- `is_document_complete = false` — flags that documents are missing.

---

## Payroll Name Resolution After Provisioning

Once a profile exists with `first_name_th = resolvedName`, the payroll SQL COALESCE chain resolves names correctly:

```sql
-- Level 1: attendance_records.employee_name (still blank for old records)
-- Level 2: employee_document_profiles.first_name_th + last_name_th  ← AUTO_CREATED fills this
-- Level 3: ...
-- Level 5: employee_code (fallback only if profile has no name)
```

For new attendance records after provisioning, Level 2 will return the name. For existing records with blank names, the profile row now exists — Level 2 will resolve on the next payroll query.

---

## Manual Test Scenario

```
# Prerequisite: employee_code "dvd345234" does not exist in employee_document_profiles

# Step 1: Trigger sync with a sheet that contains "dvd345234"
POST /api/sheets/sync-attendance { "sheetId": "<sheet-with-dvd345234>" }

# Step 2: Confirm profile was auto-created
SELECT emp_code, first_name_th, employment_status
FROM employee_document_profiles
WHERE emp_code = 'dvd345234';
-- Expect: row with employment_status = 'AUTO_CREATED'

# Step 3: Confirm audit log was written
SELECT action, metadata FROM payroll_audit_logs
WHERE action = 'employee.auto_created' ORDER BY created_at DESC LIMIT 1;
-- Expect: metadata.employee_code = 'dvd345234'

# Step 4: Check payroll (no snapshot — live calculation)
GET /payroll?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
-- Expect: dvd345234 row shows first_name_th value in employee_name (not blank)

# Step 5: Update the profile name
UPDATE employee_document_profiles
SET first_name_th = 'สมชาย', last_name_th = 'ใจดี', employment_status = 'ACTIVE'
WHERE emp_code = 'dvd345234';

# Step 6: Check payroll again
GET /payroll?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
-- Expect: dvd345234 row now shows 'สมชาย ใจดี'

# Step 7: If period was previously locked (snapshot exists), refresh it:
DELETE FROM payroll_snapshots WHERE lock_key = 'YYYY-MM-DD_YYYY-MM-DD';
UPDATE attendance_records SET payroll_locked_at = NULL
  WHERE work_date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD' AND payroll_locked_at IS NOT NULL;
-- Then re-lock via POST /payroll/lock { "date": "..." }
```

---

## Operational Notes

- **Re-provisioning:** If a profile already exists (even with `employment_status = "ACTIVE"`), provisioning is a no-op. It will never overwrite an existing profile.
- **Concurrent syncs:** The `isSyncing` lock in `attendance.service.ts` prevents concurrent sheet syncs, so no race condition risk at that layer. Field attendance has no such lock, but `findFirst` + `create` is safe for low-concurrency usage (small team, not high-frequency parallel requests).
- **Missing name at sync time:** If `employeeName` is blank in the sheet row, `first_name_th` will be set to `empCode`. HR will see the employee_code as the name — still better than a blank cell, and HR is prompted to correct it.
- **No cascading deletes:** Provisional profiles are independent rows; deleting attendance records does not remove them.

---

## Remaining Recommendation

- Add a `/api/admin/employees/uncomplete` endpoint that lists profiles with `employment_status = "AUTO_CREATED"` or `is_document_complete = false` — allows HR to see a queue of employees needing document completion.
- Consider an admin notification or dashboard badge showing the count of `AUTO_CREATED` profiles pending review.
