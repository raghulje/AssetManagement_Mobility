-- =============================================================================
-- Refex Mobility — Fleet drivers (separate from app users / roles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `vehicle_drivers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `driver_code` VARCHAR(64) NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NULL,
  `phone` VARCHAR(32) NULL,
  `email` VARCHAR(191) NULL,
  `license_number` VARCHAR(64) NULL,
  `license_expiry` DATE NULL,
  `city_id` INT UNSIGNED NULL,
  `city_name` VARCHAR(100) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active | inactive | suspended',
  `notes` TEXT NULL,
  `user_id` INT UNSIGNED NULL COMMENT 'Optional link to app user login',
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vd_driver_code` (`driver_code`),
  KEY `idx_vd_phone` (`phone`),
  KEY `idx_vd_status` (`status`),
  KEY `idx_vd_city` (`city_id`),
  KEY `idx_vd_deleted` (`deleted_at`),
  CONSTRAINT `fk_vd_city` FOREIGN KEY (`city_id`) REFERENCES `vehicle_cities` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vd_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
