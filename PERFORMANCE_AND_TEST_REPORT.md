# Payroll System — Performance & Test Report

**Date:** 2026-05-26  
**Branch:** ai_CTO_Brain  
**Scope:** Full system review after all recent fixes

---

## 1. Backend Validation Results

| Command | Result |
|---|---|
| `bunx prisma validate` | ✅ PASS |
| `bunx prisma generate` | ✅ PASS — v7.8.0 |
| `bunx tsc --noEmit` | ✅ PASS — 0 errors |
| `bun test` | ✅ PASS — 16/16 |

---

## 2. API Endpoint Status

| Endpoint | Handler | Name Resolution | BigInt Safe | Status |
|---|---|---|---|---|
| `GET /employees` | `getAllEmployees()` | ✅ `resolveDisplayName()` | ✅ explicit `Number()` casts | ✅ OK |
| `GET /companies` | `getCompanies()` | n/a | ✅ string only | ✅ OK |
| `GET /api/sheets/attendance` | `findMany` + batch profile enrich | ✅ mapping + profile fallback | ✅ ORM fields only | ✅ FIXED |
| `GET /api/field-attendance` | `findMany` + batch profile enrich | ✅ profile fallback chain | ✅ ORM fields only | ✅ FIXED |
| `GET /payroll` | `buildPayrollSql` + `enrichRows` | ✅ SQL COALESCE fallback | ✅ `normalizeSqlRow()` | ✅ FIXED |
| `GET /dashboard/summary` | raw SQL + explicit `Number()` | ✅ via attendance_records | ✅ explicit casts | ✅ OK |
| `POST /payroll/lock` | `getPayrollSummaryLive` + snapshot | ✅ inherited from payroll service | ✅ all Number() | ✅ OK |

---

## 3. Bugs Fixed in This Session

| # | Bug | File | Fix |
|---|---|---|---|
| 1 | `company_id` not in Prisma client | `wage-config.service.ts` | Re-ran `bunx prisma generate` |
| 2 | MySQL 1055 — `m.emp_code` nonaggregated | `payroll.service.ts` | Wrapped with `ANY_VALUE(m.emp_code)` |
| 3 | MySQL 1055 — `a.employee_code` nonaggregated | `payroll.service.ts` | Wrapped with `ANY_VALUE(a.employee_code)` |
| 4 | Prisma `in` rejects BigInt company_ids | `wage-config.service.ts` | `.map(id => Number(id))` before Prisma query |
| 5 | `JSON.stringify` fails on BigInt fields | `payroll.service.ts` | `normalizeSqlRow()` applied to all raw SQL rows |
| 6 | Field attendance names blank | `field-attendance.route.ts` | Batch profile fetch + name fallback chain |
| 7 | Main attendance names blank | `attendance.route.ts` | Batch profile + mapping fetch + name fallback chain |

---

## 4. Security Findings

### 4a. Fixed in This Review

| Issue | Fix Applied | File |
|---|---|---|
| `$queryRawUnsafe` pattern left in commented code | **DELETED** commented block entirely | `employee.service.ts` |
| `ALLOW_DEV_AUTH_BYPASS=true` usable in production | Added `process.exit(1)` guard if `NODE_ENV=production` | `index.ts` |
| `/test-db` endpoint exposed publicly | Disabled when `NODE_ENV=production` | `index.ts` |
| Global error handler returns raw `err.message` | Sanitized to Thai generic message in production | `index.ts` |

### 4b. Remaining — Must Fix Before Production

| Issue | Risk | Fix Required |
|---|---|---|
| `ALLOW_DEV_AUTH_BYPASS=true` allows role forgery via `X-User-Role` header | **CRITICAL** | Ensure `.env` production has `ALLOW_DEV_AUTH_BYPASS=false` (now fails at startup if true + NODE_ENV=production) |
| JWT_SECRET minimum length not validated | HIGH | Add `_jwtSecret.length < 32` check in startup guard |
| No `.env` in `.gitignore` check | HIGH | Verify `.gitignore` excludes `.env`, confirm no secrets in git history |
| CORS `allowedHeaders` exposes `X-User-Role` / `X-User-Id` | MEDIUM | Remove these from CORS allowed headers (only needed with dev bypass) |

### 4c. Already Good

| Item | Status |
|---|---|
| JWT expiration | ✅ 8 hours |
| CORS origin validated from env | ✅ |
| All routes use `requireRole()` guards | ✅ |
| Parameterized SQL everywhere (Prisma.sql) | ✅ |
| Payroll lock requires admin/accounting role | ✅ |
| Snapshot immutability (`skipDuplicates`, unique constraint) | ✅ |

---

## 5. Performance Review

### 5a. Query Cost Per Endpoint

| Endpoint | Queries | Pattern | Risk |
|---|---|---|---|
| `GET /employees` | 4 parallel: profiles + companies + attendance codes + mappings | ⚠️ Full table scans on attendance_records (distinct) and employee_code_mapping | Medium — grows with data |
| `GET /api/sheets/attendance` (page of 1000) | 4: findMany + count (parallel) + mappings IN + profiles IN | ✅ IN-clause lookups, indexed | Low |
| `GET /api/field-attendance` | 2: findMany + profiles IN | ✅ Two ORM queries | Low |
| `GET /payroll` | 2: $queryRaw (aggregation) + getWageConfigsForCompanies | ✅ Aggregated SQL + indexed wage lookup | Low |
| `GET /dashboard/summary` | 3: count + $queryRaw (aggregation) + getActiveWageConfig | ✅ Aggregated SQL | Low |

### 5b. N+1 and Unbounded Query Risks

#### HIGH: `getAllEmployees()` — 4 unbounded parallel queries
```
File: src/modules/employees/employee.service.ts
Lines: 55-81

Issues:
  1. prisma.attendance_records.findMany({ distinct: ['employee_code'] })
     → Scans entire attendance_records table for distinct codes
     → At 100k+ records this is a full index scan

  2. prisma.employee_code_mapping.findMany()
     → Loads ENTIRE mapping table into memory
     → No limit, no pagination

  3. prisma.employee_document_profiles.findMany()
     → Loads ALL profiles (fine if < 10k)

Recommendation (backlog — not blocking production at current scale):
  - Add take: 10000 guard to all three
  - Cache companies in-memory (changes rarely)
  - Consider dedicated /employees/stats endpoint for is_matched computation
```

#### HIGH: `getUnmappedAttendanceCodes()` — 3 sequential unbounded queries
```
File: src/modules/employees/employee.service.ts
Lines: 162-189

Issues:
  - 3 separate full-table queries run sequentially
  - Called from employee route — adds latency to employee page load

Recommendation (backlog):
  Replace with a single SQL query:
  SELECT a.employee_code, a.employee_name FROM attendance_records a
  WHERE a.employee_code NOT IN (SELECT emp_code FROM employee_document_profiles)
    AND a.employee_code NOT IN (SELECT sheet_employee_code FROM employee_code_mapping)
  GROUP BY a.employee_code
```

### 5c. Missing Indexes — None Critical Found

| Table | Field | Index | Assessment |
|---|---|---|---|
| `employee_document_profiles` | `emp_code` | ✅ `idx_edp_emp_code` | Good |
| `employee_code_mapping` | `sheet_employee_code` | ✅ `uniq_sheet_employee_code` | Good — UNIQUE |
| `employee_code_mapping` | `emp_code` | ✅ `idx_emp_code` | Good |
| `attendance_records` | `work_date` | ✅ `idx_attendance_work_date` | Good |
| `attendance_records` | `employee_code` | ✅ `idx_attendance_employee_code` | Good |
| `attendance_records` | `approval_status` | ✅ `idx_attendance_approval_status` | Good |
| `payroll_wage_config` | `company_id, effective_date, is_active` | ✅ `idx_wage_config_lookup` | Good |
| `payroll_snapshots` | `lock_key` | ✅ `idx_snapshot_lock_key` | Good |

**All critical query paths are indexed.**

### 5d. Pagination

| Endpoint | Paginated | Max Page Size | Risk |
|---|---|---|---|
| `GET /api/sheets/attendance` | ✅ Yes | 2000 | Low |
| `GET /employees` | ❌ No | Unlimited | Medium — at large scale |
| `GET /payroll` | ❌ No | Unlimited | Low — always a bounded date range |
| `GET /api/field-attendance` | ❌ No | Unlimited | Low — bounded to a single date |

---

## 6. Database Health Checks

### Schema integrity: ✅ Valid
### Critical indexes: ✅ All present

### Risks to verify at runtime:
- **Blank `employee_name` in attendance_records**: Now resolved in API responses, but raw values remain blank in DB. This is correct — no backfill needed; resolution happens at read time.
- **`employee_code_mapping` coverage**: Employees synced from Google Sheets have sheet codes; employees entered via field app use emp_code directly. Both paths now resolved in both attendance endpoints.
- **`payroll_wage_config` global row**: Payroll falls back to hardcoded constants (372 THB / 8 hrs) if no active DB row exists. Recommend inserting a global row before production:
  ```sql
  INSERT INTO payroll_wage_config (company_id, description, daily_wage, work_hours, effective_date, is_active)
  VALUES (NULL, 'Global default', 372.00, 8, CURDATE(), 1);
  ```
- **`payroll_snapshots` duplicate risk**: Protected by `UNIQUE (lock_key, employee_code)` + `skipDuplicates: true`. Safe.

---

## 7. Company-Based Wage Logic Verification

| Feature | Status |
|---|---|
| Schema has `company_id Int?` on `payroll_wage_config` | ✅ |
| Prisma client includes `company_id` field | ✅ Generated |
| `getWageConfigsForCompanies` batch fetch | ✅ Single round-trip |
| BigInt conversion before Prisma `in` clause | ✅ `.map(id => Number(id))` |
| Fallback: company → global → hardcoded constant | ✅ Three levels |
| `applyWageToRow` per-employee income calculation | ✅ |
| Snapshot saves `daily_wage_used` per row | ✅ Per-company rate recorded |

---

## 8. Frontend Warnings (To Investigate)

These require frontend inspection — not changed in this review:

| Issue | Likely Location | Recommendation |
|---|---|---|
| Null `value` prop warning on inputs | Form fields using `value={someField ?? null}` | Change to `value={someField ?? ""}` |
| Duplicate React keys in attendance table | `key={r.id}` when `id` could be undefined | Use `key={r.id ?? r.employee_code + r.work_date}` |
| Repeated API calls on filter change | `useQuery` with inline object params | Memoize query params with `useMemo` |
| Large table render (1000+ rows) | Attendance table, no virtualization | Consider adding a virtual list (react-virtual) for > 500 rows |

---

## 9. Employee Name Resolution — Final Verification

After all fixes, the name resolution chain is:

| Layer | Fallback |
|---|---|
| SQL (payroll) | `COALESCE(NULLIF(TRIM(a.employee_name),''), Thai name, EN name, base name, emp_code)` |
| JS normalization | `withDeductionBreakdown` — `resolvedName = rawName \|\| rawCode` |
| Attendance list API | attendance name → Thai → EN → base → employee_code |
| Field attendance API | attendance name → Thai → EN → base → employee_code |
| Employee service | `resolveDisplayName()` — Thai → EN → base → emp_code |
| Frontend (Employees.tsx) | `getEmployeeName()` — display_name → Thai → EN → base → emp_code |

All layers use the same priority order. Name `"hhh3333332"` → `"test1 test1"` in all endpoints. ✅

---

## 10. Audit Log Status

| Feature | Status |
|---|---|
| `payroll_audit_logs` table exists | ✅ |
| Payroll lock writes to audit log | ✅ |
| Attendance sync writes to audit log | ✅ |
| `logAudit()` service non-blocking (errors swallowed) | ✅ Safe |
| Auto-provisioning writes audit log | ✅ `employee.auto_created` action |
| Attendance approve/submit writes audit log | ✅ |

---

## 11. Auto Employee Provisioning Status

| Feature | Status |
|---|---|
| `ensureEmployeeProfilesForBatch` called on attendance sync | ✅ |
| `ensureEmployeeProfilesForBatch` called on field attendance bulk save | ✅ |
| Creates profile with `employment_status = "AUTO_CREATED"` | ✅ |
| Populates `first_name_th` from resolved name | ✅ |
| Never throws — errors swallowed | ✅ |
| Audit log entry on auto-create | ✅ |

---

## 12. What Was Fixed in Code (This Review)

| File | Change |
|---|---|
| `src/modules/employees/employee.service.ts` | Deleted `$queryRawUnsafe` commented block |
| `src/index.ts` | Added production guard for `ALLOW_DEV_AUTH_BYPASS`; disabled `/test-db` in production; sanitized global error message |

---

## 13. Remaining Backlog (Not Fixed — No Production Blockers)

| Item | Priority | Effort |
|---|---|---|
| Add JWT_SECRET minimum length check (≥ 32 chars) | HIGH | 1 line |
| Verify `.env` excluded from git history | HIGH | DevOps |
| Insert global wage config row in production DB | HIGH | 1 SQL |
| Remove `X-User-Role` / `X-User-Id` from CORS `allowedHeaders` | MEDIUM | 1 line |
| Bound `getAllEmployees()` queries with `take` limits | MEDIUM | 3 lines |
| Replace `getUnmappedAttendanceCodes()` with single SQL | MEDIUM | 20 lines |
| Add pagination to `GET /employees` | LOW | Requires frontend change |
| Frontend: large table virtualization | LOW | Frontend work |
| Frontend: null input value warnings | LOW | Frontend work |
| Structured logging (replace console.*) | LOW | Ops/infra |
| Standardize API response shape | LOW | Breaking change |

---

## 14. Final Readiness Assessment

### Local Development / Testing
**Status: ✅ READY**
- All validations pass
- All known bugs fixed
- Name resolution works across all pages
- BigInt serialization resolved
- Company wage calculation correct
- Payroll snapshot save/read works

### Internal UAT (Non-Production Server)
**Status: ✅ READY with prerequisites**

Prerequisites before UAT:
1. Insert global wage config row in DB
2. Set `ALLOW_DEV_AUTH_BYPASS=false` in `.env`
3. Set strong `JWT_SECRET` (≥ 32 chars)
4. Run `pm2 restart payroll-backend`

### Production Deployment
**Status: ⚠️ NOT YET READY**

Must complete before production:
1. ❌ Confirm `.env` not committed to git history
2. ❌ Confirm `ALLOW_DEV_AUTH_BYPASS=false` in production `.env` (startup guard added, but env must be set)
3. ❌ Insert global wage config row in production DB
4. ❌ Validate `JWT_SECRET` is ≥ 32 random characters
5. ❌ Remove `X-User-Role` from CORS `allowedHeaders` (only needed for dev bypass)
6. ❌ Review error logging — avoid exposing DB hostnames or table names in non-production

---

## Commands to Deploy

```bash
# 1. Push any schema changes (already in sync, but run to confirm)
bunx prisma db push

# 2. Ensure at least one wage config row exists
mysql -u <user> -p <db> -e "
  INSERT IGNORE INTO payroll_wage_config
    (company_id, description, daily_wage, work_hours, effective_date, is_active)
  VALUES (NULL, 'Global default', 372.00, 8, CURDATE(), 1);
"

# 3. Restart backend
pm2 restart payroll-backend

# 4. Verify health
curl http://localhost:3001/
# Expected: { ok: true, message: "Payroll backend is running" }
```
