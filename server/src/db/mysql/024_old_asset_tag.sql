-- 024: Preserve legacy tags; new tags are auto-generated (CODE-TYPE-0001)
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'old_asset_tag'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `assets`
     ADD COLUMN `old_asset_tag` VARCHAR(100) NULL AFTER `asset_tag`,
     ADD KEY `idx_assets_old_tag` (`old_asset_tag`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
