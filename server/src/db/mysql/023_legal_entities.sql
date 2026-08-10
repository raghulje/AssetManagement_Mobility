-- 023: HRMS legal entity / company codes (master-child under companies)
SET NAMES utf8mb4;
USE `ITAssetManagement_2026`;

CREATE TABLE IF NOT EXISTS `legal_entities` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` INT UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_legal_entities_company_code` (`company_id`, `code`),
  KEY `idx_legal_entities_company` (`company_id`),
  KEY `idx_legal_entities_deleted` (`deleted_at`),
  CONSTRAINT `fk_legal_entities_company`
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional link from inventory rows to the HRMS entity code under a company
SET @col_assets := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'legal_entity_id'
);
SET @sql_assets := IF(
  @col_assets = 0,
  'ALTER TABLE `assets` ADD COLUMN `legal_entity_id` INT UNSIGNED NULL AFTER `company_id`, ADD KEY `idx_assets_legal_entity` (`legal_entity_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_assets; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_lic := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'licenses' AND COLUMN_NAME = 'legal_entity_id'
);
SET @sql_lic := IF(
  @col_lic = 0,
  'ALTER TABLE `licenses` ADD COLUMN `legal_entity_id` INT UNSIGNED NULL AFTER `company_id`, ADD KEY `idx_licenses_legal_entity` (`legal_entity_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_lic; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_acc := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accessories' AND COLUMN_NAME = 'legal_entity_id'
);
SET @sql_acc := IF(
  @col_acc = 0,
  'ALTER TABLE `accessories` ADD COLUMN `legal_entity_id` INT UNSIGNED NULL AFTER `company_id`, ADD KEY `idx_accessories_legal_entity` (`legal_entity_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_acc; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_con := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'consumables' AND COLUMN_NAME = 'legal_entity_id'
);
SET @sql_con := IF(
  @col_con = 0,
  'ALTER TABLE `consumables` ADD COLUMN `legal_entity_id` INT UNSIGNED NULL AFTER `company_id`, ADD KEY `idx_consumables_legal_entity` (`legal_entity_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_con; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_comp := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'components' AND COLUMN_NAME = 'legal_entity_id'
);
SET @sql_comp := IF(
  @col_comp = 0,
  'ALTER TABLE `components` ADD COLUMN `legal_entity_id` INT UNSIGNED NULL AFTER `company_id`, ADD KEY `idx_components_legal_entity` (`legal_entity_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_comp; EXECUTE stmt; DEALLOCATE PREPARE stmt;
