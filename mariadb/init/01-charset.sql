-- Enforce UTF-8 (utf8mb4) and timezone on DB init
ALTER DATABASE chaiyade_dms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SET GLOBAL time_zone = '+07:00';
