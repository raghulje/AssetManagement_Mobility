-- Speed up fleet list / facets / export (vehicle captures & form sessions)
SET NAMES utf8mb4;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_captures' AND INDEX_NAME = 'idx_vc_vehicle_active'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `vehicle_captures` ADD KEY `idx_vc_vehicle_active` (`vehicle_id`, `deleted_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_captures' AND INDEX_NAME = 'idx_vc_session_active'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `vehicle_captures` ADD KEY `idx_vc_session_active` (`session_id`, `deleted_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicle_capture_sessions' AND INDEX_NAME = 'idx_vcs_vehicle_source'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `vehicle_capture_sessions` ADD KEY `idx_vcs_vehicle_source` (`vehicle_id`, `source`, `verified_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
