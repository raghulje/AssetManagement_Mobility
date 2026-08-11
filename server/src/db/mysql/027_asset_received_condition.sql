-- 027: Asset received condition notes + multi-image upload kind
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'received_condition'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `assets`
     ADD COLUMN `received_condition` TEXT NULL COMMENT ''Condition notes when asset was received'' AFTER `notes`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `uploads`
  MODIFY COLUMN `kind` ENUM(
    'image', 'file', 'signature', 'eula', 'audit',
    'invoice', 'po', 'label', 'other', 'received'
  ) NOT NULL DEFAULT 'file';
