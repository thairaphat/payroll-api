# Payroll Backend — Test Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Scope:** Post-implementation validation of 6 production fixes  
**Tester:** Claude Code (automated static + code audit; DB integration requires live env)

---

## Summary

| Area | Result | Notes |
|---|---|---|
| TypeScript type check | **PASS** ✅ | 0 errors after all fixes |
| Prisma schema validation | **PASS** ✅ | Schema valid |
| Prisma client generation | **PASS** ✅ | v7.8.0 generated successfully |
| Unit tests (payroll calc) | **PASS** ✅ | 16/16 pass |
| Frontend build | **PASS** ✅ | Built in 7.73s, no errors |
| New DB models in schema | **PASS** ✅ | All 3 models confirmed |
| Migration file | **N/A** ⚠️ | Project uses `prisma db push` — no migrations folder |
| Wage config service | **PASS** ✅ | DB-first with fallback, error-safe |
| Snapshot save logic | **PASS** ✅ | Lock route saves snapshots correctly |
| Snapshot read logic | **BUG FIXED** 🔧 | lock_key mismatch found and fixed |
| Audit logging (4 actions) | **PASS** ✅ | sync/submit/approve/lock all wired |
| Regression flow | **PASS** ✅ | Full workflow code path verified |

---

## 1. TypeScript / Build Validation

### Commands Run

```bash
# Backend type check
bunx tsc --noEmit
# Result: EXIT:0 — 0 errors ✅

# Prisma schema validation
bunx prisma validate
# Result: "The schema at prisma/schema.prisma is valid 🚀" ✅

# Prisma client regeneration
bunx prisma generate
# Result: "Generated Prisma Client (v7.8.0)" ✅

# Unit tests
bun test src/test/payroll-calc.test.ts
# Result: 16 pass, 0 fail, 20 expect() calls — 37ms ✅

# Frontend build
cd payroll-companion && bun run build
# Result: "built in 7.73s" — 0 errors ✅
```

### Notes
- No `build` script exists in payroll-backend/package.json (only `dev` and `start`). Bun compiles on-the-fly at startup — TypeScript check via `tsc --noEmit` is the appropriate build validation.
- Frontend chunk size warning (1,119 kB) is **pre-existing** and unrelated to current changes.

---

## 2. Database Migration Check

### Models Present in schema.prisma

| Model | Status |
|---|---|
| `payroll_wage_config` | ✅ Present — Decimal(10,2) daily_wage, Int work_hours, Date effective_date, Boolean is_active |
| `payroll_snapshots` | ✅ Present — Unique (lock_key, employee_code), all income/deduction Decimal(12,2) fields |
| `payroll_audit_logs` | ✅ Present — Json entity_scope + metadata, indexed by action/created_at/actor_user_id |

### Migration Strategy

This project has **never used Prisma Migrate** — there is no `prisma/migrations/` folder. The team manages the DB schema via `prisma db push` (sync schema directly to DB without migration history).

### Recommended Deploy Commands

**Option A — Development / Staging (safe, no migration history):**
```bash
bunx prisma db push
```
This creates the 3 new tables if they don't exist. Safe for existing data — additive only.

**Option B — Production (recommended, creates migration history):**
```bash
# Initialize migration history from current schema state
bunx prisma migrate dev --name add_wage_config_snapshots_audit
```
Then on production server:
```bash
bunx prisma migrate deploy
```

**⚠️ Important:** Do NOT run `prisma migrate reset` — this wipes the database.

### Initial Wage Config Row (REQUIRED after schema push)

```sql
INSERT INTO payroll_wage_config (description, daily_wage, work_hours, effective_date, is_active)
VALUES ('Initial rate', 372.00, 8, CURDATE(), 1);
```

Until this row exists, the system will log a warning and use the fallback constant (372 THB). Payroll calculation will still be correct — but operators will see the warning in server logs.

---

## 3. Wage Config Test

### Code Audit Result: PASS ✅

**File:** `src/services/wage-config.service.ts`

**Logic verified:**
1. Queries `payroll_wage_config` for the row where `is_active = true AND effective_date <= today`, ordered by `effective_date DESC` (most recent wins).
2. If no row found → logs warning → returns `{ daily_wage: 372, work_hours: 8 }` from constants.
3. If DB error → logs error → returns fallback (never throws, never crashes payroll).
4. Returns `{ daily_wage: Number(config.daily_wage), work_hours: Number(config.work_hours) }` — Prisma returns `Decimal`, explicit `Number()` cast is correct.

**Usage verified in:**
- `payroll.service.ts` — `getPayrollSummary`, `getPayrollByEmployeeCode`, `getPayrollSummaryLive` all call `getActiveWageConfig()` and pass the result to `buildPayrollSql()`
- `payroll.route.ts` — lock handler calls `getActiveWageConfig()` before snapshot save
- `dashboard.route.ts` — calls `getActiveWageConfig()` for dashboard income totals

**Fallback behavior:**
- No active DB row → constants used → no crash, no wrong answer, warning in log ✅
- DB unreachable → constants used → same ✅

**How to change wage rate:**
```sql
-- Deactivate current config
UPDATE payroll_wage_config SET is_active = 0 WHERE is_active = 1;

-- Insert new rate (takes effect on effective_date)
INSERT INTO payroll_wage_config (description, daily_wage, work_hours, effective_date, is_active)
VALUES ('Wage increase Q3 2026', 400.00, 8, '2026-07-01', 1);
```

---

## 4. Payroll Snapshot Test

### Code Audit Result: PASS ✅ (after bug fix)

### Bug Found and Fixed: lock_key Mismatch

**File:** `src/modules/payroll/payroll.route.ts`

**Before fix (line 62–64):**
```typescript
const lockKey = input.date
  ? input.date                          // "2026-05-01"
  : `${input.startDate}_${input.endDate}`;
```

**Problem:** When `input.date = "2026-05-01"`, snapshots were saved with `lock_key = "2026-05-01"`. But `getPayrollSummary` reads with `lock_key = "2026-05-01_2026-05-01"`. **Snapshots would never be found.**

**After fix:**
```typescript
const lockKey = `${range.startDate}_${range.endDate}`;
```

Since `range` is already normalized from `input.date` or `input.startDate/endDate`, this produces a consistent key:
- Single date: `input.date = "2026-05-01"` → `range = {startDate: "2026-05-01", endDate: "2026-05-01"}` → `lockKey = "2026-05-01_2026-05-01"` ✅
- Date range: `startDate = "2026-05-01", endDate = "2026-05-31"` → `lockKey = "2026-05-01_2026-05-31"` ✅

**Lock flow (POST /payroll/lock):**
1. Normalize range from input ✅
2. Get current user (for authorship) ✅
3. Get active wage config ✅
4. Calculate live payroll (approved + already-locked records only, `includeDraft=false`) ✅
5. Lock attendance records (`payroll_locked_at = NOW()`) ✅
6. If `locked > 0 AND payrollRows.length > 0`: save snapshots with `createMany(skipDuplicates: true)` ✅
7. Write audit log (non-blocking) ✅
8. Return `{ success, locked, snapshots_saved }` ✅

**Read flow (GET /payroll):**
1. `getPayrollSummary` checks: if `!includeDraft`, compute `lockKey = "${startDate}_${endDate}"` ✅
2. Query `payroll_snapshots` by `lock_key` ✅
3. If snapshots exist → return mapped rows (`_from_snapshot: true` flag) ✅
4. If no snapshots → calculate live with `getActiveWageConfig()` ✅

**Per-employee read (GET /payroll/:employeeCode):**
- Same snapshot-first logic, `findFirst` by `lock_key AND employee_code` ✅

### Manual Test Steps Required (needs live DB)

```
1. Insert a test attendance record in APPROVED status for date 2026-05-01
2. POST /payroll/lock { "date": "2026-05-01" }
   → Expect response: { success: true, locked: N, snapshots_saved: N }
3. SELECT * FROM payroll_snapshots WHERE lock_key = '2026-05-01_2026-05-01';
   → Expect rows matching attendance records
4. GET /payroll?startDate=2026-05-01&endDate=2026-05-01
   → Expect same rows, _from_snapshot: true in each row
5. Edit an attendance record for the same period (should fail — locked)
6. GET /payroll?startDate=2026-05-01&endDate=2026-05-01 again
   → Expect identical result (snapshot, not live recalculation)
```

---

## 5. Audit Log Test

### Code Audit Result: PASS ✅

**File:** `src/services/audit.service.ts`

**Design verified:**
- `logAudit()` wraps the DB write in a try/catch ✅
- Errors are swallowed (`console.error` only) — never blocks business operation ✅
- All 4 critical actions wired:

| Action | Wired In | Metadata Saved |
|---|---|---|
| `attendance.sync` | `attendance.service.ts:169` | inserted, updated, skipped, error_count |
| `attendance.submit` | `approval.service.ts:54` | updated (record count) |
| `attendance.approve` | `approval.service.ts:75` | updated (record count) |
| `payroll.lock` | `payroll.route.ts:98` | locked_attendance, snapshots_saved, daily_wage_used, work_hours_used |

**actor fields saved per log entry:**
- `actor_user_id` — from JWT user.id (null if unauthenticated sync edge case)
- `actor_username` — from JWT user.username
- `actor_role` — from JWT user.role (admin/hr/accounting/field_staff)
- `entity_scope` — JSON: the date/startDate/endDate/sourceSheetId of the operation
- `metadata` — JSON: operation-specific counts and config snapshot

### Manual Test Steps Required (needs live DB)

```
1. POST /api/sheets/sync-attendance { "sheetId": "..." } (as admin)
   → SELECT * FROM payroll_audit_logs WHERE action = 'attendance.sync' ORDER BY created_at DESC LIMIT 1;
   → Expect actor_username, actor_role = 'admin', metadata with inserted/updated/skipped counts

2. POST /api/attendance/submit { "date": "2026-05-01" } (as hr)
   → SELECT * FROM payroll_audit_logs WHERE action = 'attendance.submit' ORDER BY created_at DESC LIMIT 1;

3. POST /api/attendance/approve { "date": "2026-05-01" } (as hr)
   → SELECT * FROM payroll_audit_logs WHERE action = 'attendance.approve' ORDER BY created_at DESC LIMIT 1;

4. POST /payroll/lock { "date": "2026-05-01" } (as admin)
   → SELECT * FROM payroll_audit_logs WHERE action = 'payroll.lock' ORDER BY created_at DESC LIMIT 1;
   → Expect metadata.daily_wage_used and metadata.snapshots_saved to be present
```

---

## 6. Regression Test — Full Workflow

### Code Path Trace: PASS ✅

**Workflow: Google Sheet Sync → Submit → Approve → Lock → View → Export PDF**

| Step | Route | Service | Audit | Status |
|---|---|---|---|---|
| Sync from Google Sheet | `POST /api/sheets/sync-attendance` | `attendance.service.syncAttendanceFromSheet()` | ✅ `attendance.sync` logged | ✅ |
| Submit Attendance | `POST /api/attendance/submit` | `approval.service.submitAttendance()` | ✅ `attendance.submit` logged | ✅ |
| Approve Attendance | `POST /api/attendance/approve` | `approval.service.approveAttendance()` | ✅ `attendance.approve` logged | ✅ |
| Lock Payroll | `POST /payroll/lock` | `payroll.route` → `lockPayrollPeriod()` + snapshot save | ✅ `payroll.lock` logged | ✅ (bug fixed) |
| View Payroll | `GET /payroll?startDate=...&endDate=...` | `payroll.service.getPayrollSummary()` | snapshot path | ✅ |
| Export Payslip PDF | Frontend `SlipTemplate` + jsPDF | `payroll-companion` frontend only | N/A | ✅ (build passed) |

**No breaking changes confirmed:**
- GET /attendance — `buildAttendanceListWhere()` unchanged except `[...TEST_RECORD_WHERE]` spread (correct behavior preserved)
- GET /payroll — response shape unchanged; `_from_snapshot: true` is additive
- GET /dashboard/summary — response shape unchanged; `_wage_config` is additive
- POST /payroll/lock — response adds `snapshots_saved`; `success/locked` preserved
- All role guards unchanged

---

## 7. Errors Found During Testing

| # | Error | Severity | Status |
|---|---|---|---|
| 1 | `payroll.route.ts`: `jwt` property TS error from inline destructure | Medium | ✅ Fixed (context: any pattern) |
| 2 | `attendance.route.ts`: `TEST_RECORD_WHERE` readonly tuple TS error | Low | ✅ Fixed (`[...spread]`) |
| 3 | `field-attendance.route.ts`: same readonly error | Low | ✅ Fixed (`[...spread]`) |
| 4 | `payroll.route.ts`: lock_key derivation inconsistency | **HIGH** 🔴 | ✅ Fixed (use `range.startDate_range.endDate`) |

---

## 8. Remaining Risks

| Risk | Severity | Action Required |
|---|---|---|
| `payroll_wage_config` table not yet in DB | HIGH | Run `bunx prisma db push` before starting server |
| Initial wage config row missing | HIGH | Insert row (SQL above) immediately after push |
| Re-lock same period saves no new snapshot | LOW | Expected behavior (`skipDuplicates: true`). Document: first lock wins. |
| `payroll_snapshots` deduction stores single field only | LOW | If multi-field deductions are added later, snapshot schema needs extension. Currently only `debt_amount` used — safe for now. |
| Elysia version `"latest"` is unpinned | Medium | Pin to specific version after next deploy to prevent unexpected upgrades. |
| Frontend `payroll_mock_session` in localStorage | Low | Dev bypass still available. Ensure `ALLOW_DEV_AUTH_BYPASS=false` on all production servers. |
| Frontend chunk 1,119 kB (pre-existing) | Low | Consider code-splitting. Out of scope for current fix set. |

---

## 9. Safe to Deploy?

**Yes, with prerequisites met.**

### Pre-Deploy Checklist

- [ ] Run `bunx prisma db push` (or `migrate deploy`) on the target server
- [ ] Insert initial wage config row: `INSERT INTO payroll_wage_config ...`
- [ ] Confirm `.env` has `JWT_SECRET` (strong, minimum 32 chars)
- [ ] Confirm `.env` has `ALLOW_DEV_AUTH_BYPASS=false`
- [ ] Restart PM2: `pm2 restart payroll-backend`
- [ ] Run manual DB integration tests (Steps in sections 4 and 5 above)
- [ ] Confirm server logs show no `[wage-config] No active config` warning after initial row insert

### Rollback Plan

All changes are additive:
1. Drop 3 tables: `payroll_wage_config`, `payroll_snapshots`, `payroll_audit_logs`
2. Revert code via git: `git revert` or `git reset` to previous commit
3. No existing tables/columns were modified — existing data is unaffected

---

*Report generated by static analysis + code audit. Sections 4 and 5 manual test steps require a live DB environment to fully validate.*
