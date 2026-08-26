-- Public capture form: guest submitter metadata on capture sessions (idempotent)
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'submitter_name'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `submitter_name` VARCHAR(191) NULL AFTER `notes`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'submitter_email'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `submitter_email` VARCHAR(191) NULL AFTER `submitter_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'submitter_phone'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `submitter_phone` VARCHAR(32) NULL AFTER `submitter_email`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND COLUMN_NAME = 'source'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT ''app'' COMMENT ''app | public_form'' AFTER `submitter_phone`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
