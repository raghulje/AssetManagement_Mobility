-- 029: License subscription cycles + per-period invoices
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'licenses' AND COLUMN_NAME = 'subscription_cycles'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `licenses`
     ADD COLUMN `subscription_cycles` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `is_recurring`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `license_invoices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `license_id` INT UNSIGNED NOT NULL,
  `period_index` INT UNSIGNED NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `invoice_at` DATETIME NULL,
  `amount` DECIMAL(15,2) NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lic_inv_period` (`license_id`, `period_index`),
  KEY `idx_lic_inv_license` (`license_id`),
  KEY `idx_lic_inv_period_end` (`period_end`),
  CONSTRAINT `fk_lic_inv_license` FOREIGN KEY (`license_id`) REFERENCES `licenses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
