-- 026: Optional map pin (lat/lng/address) per asset — OpenStreetMap / Leaflet picker
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'map_latitude'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `assets`
     ADD COLUMN `map_latitude` DECIMAL(10,7) NULL AFTER `rtd_location_id`,
     ADD COLUMN `map_longitude` DECIMAL(10,7) NULL AFTER `map_latitude`,
     ADD COLUMN `map_address` VARCHAR(500) NULL AFTER `map_longitude`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
