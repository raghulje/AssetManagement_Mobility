-- Form registration verification (public capture sessions)
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'verified_at'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions`
     ADD COLUMN `verified_at` DATETIME NULL AFTER `source`,
     ADD COLUMN `verified_by` INT UNSIGNED NULL AFTER `verified_at`,
     ADD COLUMN `verified_summary` TEXT NULL AFTER `verified_by`,
     ADD COLUMN `verification_log` JSON NULL AFTER `verified_summary`,
     ADD KEY `idx_vcs_verified_at` (`verified_at`),
     ADD KEY `idx_vcs_verified_by` (`verified_by`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
