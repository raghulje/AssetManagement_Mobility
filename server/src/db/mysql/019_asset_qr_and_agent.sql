-- 019: Permanent asset QR / print labels + agent sync fields
SET NAMES utf8mb4;

USE `ITAssetManagement_2026`;

SET @col_qr_token := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'qr_token'
);
SET @sql_qr_token := IF(
  @col_qr_token = 0,
  'ALTER TABLE `assets`
     ADD COLUMN `qr_token` VARCHAR(64) NULL AFTER `asset_tag`,
     ADD COLUMN `qr_url` VARCHAR(500) NULL AFTER `qr_token`,
     ADD COLUMN `qr_image_path` VARCHAR(255) NULL AFTER `qr_url`,
     ADD COLUMN `label_printed_at` DATETIME NULL AFTER `qr_image_path`,
     ADD COLUMN `label_print_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `label_printed_at`,
     ADD COLUMN `last_agent_sync_at` DATETIME NULL AFTER `label_print_count`,
     ADD COLUMN `agent_hostname` VARCHAR(191) NULL AFTER `last_agent_sync_at`,
     ADD UNIQUE KEY `uk_assets_qr_token` (`qr_token`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_qr_token;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `asset_agent_snapshots` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id` INT UNSIGNED NULL,
  `serial_number` VARCHAR(191) NULL,
  `hostname` VARCHAR(191) NULL,
  `platform` VARCHAR(64) NULL,
  `payload` JSON NULL,
  `matched_by` VARCHAR(64) NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_snap_asset` (`asset_id`),
  KEY `idx_agent_snap_serial` (`serial_number`),
  KEY `idx_agent_snap_created` (`created_at`),
  CONSTRAINT `fk_agent_snap_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `uploads`
  MODIFY COLUMN `kind` ENUM(
    'image', 'file', 'signature', 'eula', 'audit',
    'invoice', 'po', 'label', 'other'
  ) NOT NULL DEFAULT 'file';

INSERT INTO `schema_migrations` (`version`, `description`)
SELECT '019_asset_qr_and_agent', 'Permanent QR tokens, print label tracking, agent snapshots'
WHERE NOT EXISTS (SELECT 1 FROM `schema_migrations` WHERE `version` = '019_asset_qr_and_agent');
