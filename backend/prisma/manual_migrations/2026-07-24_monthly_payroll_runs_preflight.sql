-- Monthly Payroll Runs preflight (SELECT ONLY)
-- Run and review this file before applying 2026-07-24_monthly_payroll_runs.sql.
-- It does not create, update, or delete data.

SELECT DATABASE() AS database_name, VERSION() AS database_version;

SELECT
  table_name,
  engine,
  table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'companies',
    'employee_document_profiles',
    'attendance_records',
    'payroll_audit_logs',
    'payroll_runs',
    'payroll_run_items',
    'payroll_run_attendance_links'
  )
ORDER BY table_name;

SELECT
  table_name,
  column_name,
  column_type,
  is_nullable,
  column_default,
  extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name IN (
    'companies',
    'employee_document_profiles',
    'attendance_records',
    'payroll_audit_logs',
    'payroll_runs',
    'payroll_run_items',
    'payroll_run_attendance_links'
  )
ORDER BY table_name, ordinal_position;

SELECT
  table_name,
  index_name,
  non_unique,
  GROUP_CONCAT(column_name ORDER BY seq_in_index) AS indexed_columns
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN (
    'payroll_runs',
    'payroll_run_items',
    'payroll_run_attendance_links'
  )
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;

SELECT
  table_name,
  constraint_name,
  referenced_table_name,
  GROUP_CONCAT(column_name ORDER BY ordinal_position) AS child_columns,
  GROUP_CONCAT(referenced_column_name ORDER BY ordinal_position) AS parent_columns
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IS NOT NULL
  AND table_name IN (
    'payroll_runs',
    'payroll_run_items',
    'payroll_run_attendance_links'
  )
GROUP BY table_name, constraint_name, referenced_table_name
ORDER BY table_name, constraint_name;

-- Existing source records that cannot satisfy the proposed foreign keys.
SELECT COUNT(*) AS attendance_missing_employee_profile
FROM attendance_records AS attendance
LEFT JOIN employee_document_profiles AS profile
  ON profile.id = attendance.employee_id
WHERE attendance.employee_id IS NOT NULL
  AND profile.id IS NULL;

SELECT COUNT(*) AS employee_profiles_missing_company
FROM employee_document_profiles AS profile
LEFT JOIN companies AS company
  ON company.id = profile.company_id
WHERE profile.company_id IS NOT NULL
  AND company.id IS NULL;

-- Existing duplicate employee identities must be resolved before relying on
-- one payroll item per company-scoped employee profile.
SELECT
  company_id,
  UPPER(TRIM(emp_code)) AS normalized_employee_code,
  COUNT(*) AS duplicate_count
FROM employee_document_profiles
WHERE company_id IS NOT NULL
  AND emp_code IS NOT NULL
  AND TRIM(emp_code) <> ''
GROUP BY company_id, UPPER(TRIM(emp_code))
HAVING COUNT(*) > 1
ORDER BY company_id, normalized_employee_code;
