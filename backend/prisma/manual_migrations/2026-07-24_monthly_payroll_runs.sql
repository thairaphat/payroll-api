-- REVIEW ONLY. Do not execute before production information_schema checks,
-- duplicate scans, backup confirmation, and explicit approval.

CREATE TABLE payroll_runs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  employee_count INT NOT NULL DEFAULT 0,
  base_income_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  overtime_income_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  other_income_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  gross_income_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  deduction_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_income_total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  calculation_version VARCHAR(50) NOT NULL DEFAULT 'payroll-v1',
  active_period_key VARCHAR(100) NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  lock_key VARCHAR(100) NULL,
  row_version INT NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  reviewed_by INT NULL,
  approved_by INT NULL,
  locked_by INT NULL,
  paid_by INT NULL,
  cancelled_by INT NULL,
  payment_reference VARCHAR(255) NULL,
  bank_batch_reference VARCHAR(255) NULL,
  cancellation_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  calculated_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  approved_at DATETIME NULL,
  locked_at DATETIME NULL,
  paid_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_payroll_run_active_period (active_period_key),
  UNIQUE KEY uniq_payroll_run_idempotency (idempotency_key),
  UNIQUE KEY uniq_payroll_run_lock_key (lock_key),
  KEY idx_payroll_runs_company_period (company_id, period_start, period_end),
  KEY idx_payroll_runs_company_status (company_id, status),
  CONSTRAINT fk_payroll_runs_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payroll_run_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payroll_run_id BIGINT NOT NULL,
  company_id INT NOT NULL,
  employee_profile_id INT NOT NULL,
  employee_code_snapshot VARCHAR(100) NOT NULL,
  employee_name_snapshot VARCHAR(255) NOT NULL,
  branch_code_snapshot VARCHAR(50) NULL,
  bank_account_snapshot JSON NULL,
  wage_config_snapshot JSON NOT NULL,
  calculation_input_snapshot JSON NOT NULL,
  calculation_result_snapshot JSON NOT NULL,
  warnings JSON NULL,
  work_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  half_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  leave_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  absent_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ot1_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ot15_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ot2_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  base_income DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  overtime_income DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  other_income DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  gross_income DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_deductions DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_income DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_payroll_run_employee (payroll_run_id, employee_profile_id),
  KEY idx_payroll_run_items_company_employee (company_id, employee_profile_id),
  CONSTRAINT fk_payroll_run_items_run FOREIGN KEY (payroll_run_id)
    REFERENCES payroll_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_run_items_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_run_items_employee FOREIGN KEY (employee_profile_id)
    REFERENCES employee_document_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payroll_run_attendance_links (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payroll_run_id BIGINT NOT NULL,
  company_id INT NOT NULL,
  employee_profile_id INT NOT NULL,
  attendance_record_id INT NOT NULL,
  active_attendance_key VARCHAR(40) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_active_payroll_attendance (active_attendance_key),
  UNIQUE KEY uniq_payroll_run_attendance (payroll_run_id, attendance_record_id),
  KEY idx_payroll_run_attendance_company_run (company_id, payroll_run_id),
  CONSTRAINT fk_payroll_run_attendance_run FOREIGN KEY (payroll_run_id)
    REFERENCES payroll_runs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_run_attendance_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_run_attendance_employee FOREIGN KEY (employee_profile_id)
    REFERENCES employee_document_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_run_attendance_record FOREIGN KEY (attendance_record_id)
    REFERENCES attendance_records(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Forward-fix rollback: disable Payroll Run routes and retain the tables/history.
-- DROP statements are intentionally omitted because financial history must not
-- be destroyed after any run has been created.
