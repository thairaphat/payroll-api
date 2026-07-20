-- ============================================================================
-- Manual migration: CREATE TABLE employee_master_mapping
-- DATE: 2026-06-10
-- STATUS: ❌ NOT YET APPLIED — review and run manually against the target DB.
--
-- เป้าหมาย: เก็บ employee master จาก Google Sheet (A=รหัส, B=ชื่อ, C=สกุล, D=Code to find)
-- แยกตารางจาก employee_code_mapping (ที่ payroll/dashboard JOIN อยู่) เพื่อไม่ปน concern
-- dedup/upsert key = (source_sheet_id, code_to_find)
--
-- ลำดับ apply ที่ถูกต้อง:
--   1) mysqldump ... chaiyade_dms > backup.sql
--   2) รันสคริปต์นี้
--   3) cd backend && bunx prisma generate
--   4) deploy โค้ด import
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_master_mapping (
  id                INT          NOT NULL AUTO_INCREMENT,
  employee_code     VARCHAR(100) NULL,            -- Column A (canonical) — อาจว่าง
  first_name        VARCHAR(150) NULL,            -- Column B
  last_name         VARCHAR(150) NULL,            -- Column C
  employee_name     VARCHAR(255) NULL,            -- B + " " + C
  code_to_find      VARCHAR(255) NOT NULL,        -- Column D — main matching key
  source_sheet_id   VARCHAR(255) NOT NULL,
  source_sheet_name VARCHAR(100) NULL,
  raw_row_json      JSON         NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_master_mapping (source_sheet_id, code_to_find),
  KEY idx_emm_employee_code (employee_code),
  KEY idx_emm_code_to_find (code_to_find)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ตรวจสอบหลัง apply:
-- SHOW CREATE TABLE employee_master_mapping;
-- SELECT COUNT(*) FROM employee_master_mapping;
