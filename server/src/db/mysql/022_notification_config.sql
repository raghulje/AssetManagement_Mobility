-- JSON bag for email notification toggles + extra recipient lists (Biogas-style admin config)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'notification_config'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `settings` ADD COLUMN `notification_config` JSON NULL AFTER `alert_email`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
