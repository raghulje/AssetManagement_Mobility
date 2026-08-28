-- Capture kind for vehicle photos / odometer / chassis / walkaround video (public form + app)
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_captures' AND COLUMN_NAME = 'capture_kind'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `vehicle_captures` ADD COLUMN `capture_kind` VARCHAR(32) NOT NULL DEFAULT ''vehicle'' COMMENT ''vehicle | odometer | extra_1 | extra_2 | chassis | walkaround_video'' AFTER `address`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
