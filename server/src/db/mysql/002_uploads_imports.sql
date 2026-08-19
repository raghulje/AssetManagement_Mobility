-- 002: Uploads, import enhancements, asset image column
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

USE `Mobility_AssetManagement_2026`;

CREATE TABLE IF NOT EXISTS `uploads` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uploadable_type` VARCHAR(64) NOT NULL COMMENT 'asset|user|license|accessory|maintenance|acceptance',
  `uploadable_id` INT UNSIGNED NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `original_filename` VARCHAR(255) NULL,
  `mime_type` VARCHAR(128) NULL,
  `disk_path` VARCHAR(500) NOT NULL,
  `filesize` INT UNSIGNED NULL,
  `kind` ENUM('image','file','signature','eula','audit') NOT NULL DEFAULT 'file',
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_uploads_owner` (`uploadable_type`, `uploadable_id`),
  KEY `idx_uploads_kind` (`kind`),
  CONSTRAINT `fk_uploads_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Asset image path (public)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'image'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `assets` ADD COLUMN `image` VARCHAR(255) NULL AFTER `notes`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- User avatar
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `users` ADD COLUMN `avatar` VARCHAR(255) NULL AFTER `notes`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Expand imports for CSV engine
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'imports' AND COLUMN_NAME = 'header_row'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `imports`
     ADD COLUMN `header_row` JSON NULL AFTER `field_map`,
     ADD COLUMN `first_row` JSON NULL AFTER `header_row`,
     ADD COLUMN `error_log` JSON NULL AFTER `error_count`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `schema_migrations` (`version`, `description`)
VALUES ('002_uploads_imports', 'Uploads table, asset image, import CSV metadata')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
