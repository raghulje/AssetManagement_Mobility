-- =============================================================================
-- Refex Mobility — Vehicles (fleet assets) + geo-stamped photo captures
-- Source of truth for seed: Vehicle_List.xlsx (Location, Category, Vehicle Number, Model)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_number` VARCHAR(32) NOT NULL COMMENT 'Registration / plate e.g. TN09DD7861',
  `model` VARCHAR(100) NOT NULL,
  `location_name` VARCHAR(100) NOT NULL COMMENT 'City hub: Bangalore, Chennai, Delhi, Hyderabad, Mumbai',
  `category` VARCHAR(64) NOT NULL COMMENT 'EV Vehicles | CNG/Petrol vehicles',
  `fuel_type` VARCHAR(32) NOT NULL DEFAULT 'EV' COMMENT 'EV | CNG_PETROL | OTHER',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active | inactive | maintenance | retired',
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicles_number` (`vehicle_number`),
  KEY `idx_vehicles_location` (`location_name`),
  KEY `idx_vehicles_model` (`model`),
  KEY `idx_vehicles_category` (`category`),
  KEY `idx_vehicles_fuel` (`fuel_type`),
  KEY `idx_vehicles_status` (`status`),
  KEY `idx_vehicles_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per photo. Multi-capture = many rows for the same vehicle (optionally same session).
CREATE TABLE IF NOT EXISTS `vehicle_capture_sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_id` INT UNSIGNED NOT NULL,
  `captured_by` INT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vcs_vehicle` (`vehicle_id`),
  KEY `idx_vcs_user` (`captured_by`),
  CONSTRAINT `fk_vcs_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vcs_user` FOREIGN KEY (`captured_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_captures` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_id` INT UNSIGNED NOT NULL,
  `session_id` INT UNSIGNED NULL,
  `captured_by` INT UNSIGNED NULL,
  `storage_path` VARCHAR(512) NOT NULL COMMENT 'Relative path under server storage/',
  `original_name` VARCHAR(255) NULL,
  `mime_type` VARCHAR(100) NULL,
  `file_size` INT UNSIGNED NULL,
  `captured_at` DATETIME NOT NULL COMMENT 'Device capture timestamp shown on frame',
  `latitude` DECIMAL(10, 7) NULL,
  `longitude` DECIMAL(10, 7) NULL,
  `address` VARCHAR(512) NULL COMMENT 'Reverse-geocoded address on frame',
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vc_vehicle` (`vehicle_id`),
  KEY `idx_vc_session` (`session_id`),
  KEY `idx_vc_user` (`captured_by`),
  KEY `idx_vc_captured_at` (`captured_at`),
  KEY `idx_vc_deleted` (`deleted_at`),
  CONSTRAINT `fk_vc_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vc_session` FOREIGN KEY (`session_id`) REFERENCES `vehicle_capture_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vc_user` FOREIGN KEY (`captured_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
