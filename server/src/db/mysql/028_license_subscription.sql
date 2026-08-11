-- 028: License requester + subscription period + recurring renewal alerts
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'licenses' AND COLUMN_NAME = 'requested_by_employee_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `licenses`
     ADD COLUMN `requested_by_employee_id` INT UNSIGNED NULL AFTER `category_id`,
     ADD COLUMN `subscription_period` ENUM(''none'',''monthly'',''annual'',''custom'') NOT NULL DEFAULT ''none'' AFTER `expiration_date`,
     ADD COLUMN `subscription_custom_value` INT UNSIGNED NULL AFTER `subscription_period`,
     ADD COLUMN `subscription_custom_unit` ENUM(''days'',''months'') NULL AFTER `subscription_custom_value`,
     ADD COLUMN `is_recurring` TINYINT(1) NOT NULL DEFAULT 0 AFTER `subscription_custom_unit`,
     ADD KEY `idx_licenses_requested_by` (`requested_by_employee_id`),
     ADD KEY `idx_licenses_recurring_exp` (`is_recurring`, `expiration_date`),
     ADD CONSTRAINT `fk_licenses_requested_employee`
       FOREIGN KEY (`requested_by_employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
