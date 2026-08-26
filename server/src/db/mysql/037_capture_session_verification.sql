-- Form registration verification (public capture sessions) — idempotent per column
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'verified_at'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `verified_at` DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'verified_by'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `verified_by` INT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'verified_summary'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `verified_summary` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'verification_log'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `verification_log` JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND INDEX_NAME = 'idx_vcs_verified_at'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD KEY `idx_vcs_verified_at` (`verified_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND INDEX_NAME = 'idx_vcs_verified_by'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD KEY `idx_vcs_verified_by` (`verified_by`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
