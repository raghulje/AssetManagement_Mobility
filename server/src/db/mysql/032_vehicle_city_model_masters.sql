-- =============================================================================
-- Refex Mobility — City & Model masters (addable + mappable to vehicles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `vehicle_cities` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(32) NULL,
  `state` VARCHAR(100) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_cities_name` (`name`),
  KEY `idx_vehicle_cities_active` (`is_active`),
  KEY `idx_vehicle_cities_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vehicle_models` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `make` VARCHAR(100) NULL COMMENT 'OEM e.g. Tata, Citroën, MG',
  `default_fuel_type` VARCHAR(32) NOT NULL DEFAULT 'EV',
  `default_category` VARCHAR(64) NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vehicle_models_name` (`name`),
  KEY `idx_vehicle_models_active` (`is_active`),
  KEY `idx_vehicle_models_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `vehicles`
  ADD COLUMN `city_id` INT UNSIGNED NULL AFTER `location_name`,
  ADD COLUMN `model_id` INT UNSIGNED NULL AFTER `model`;

ALTER TABLE `vehicles`
  ADD KEY `idx_vehicles_city_id` (`city_id`),
  ADD KEY `idx_vehicles_model_id` (`model_id`);

-- Seed cities from existing fleet values
INSERT INTO `vehicle_cities` (`name`, `created_at`, `updated_at`)
SELECT DISTINCT TRIM(location_name), NOW(), NOW()
FROM `vehicles`
WHERE deleted_at IS NULL AND location_name IS NOT NULL AND TRIM(location_name) <> ''
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`);

-- Seed models from existing fleet values
INSERT INTO `vehicle_models` (`name`, `default_fuel_type`, `default_category`, `created_at`, `updated_at`)
SELECT DISTINCT
  TRIM(v.model),
  COALESCE(MAX(v.fuel_type), 'EV'),
  MAX(v.category),
  NOW(),
  NOW()
FROM `vehicles` v
WHERE v.deleted_at IS NULL AND v.model IS NOT NULL AND TRIM(v.model) <> ''
GROUP BY TRIM(v.model)
ON DUPLICATE KEY UPDATE
  `default_fuel_type` = VALUES(`default_fuel_type`),
  `default_category` = COALESCE(VALUES(`default_category`), `default_category`),
  `updated_at` = VALUES(`updated_at`);

-- Map vehicles → cities
UPDATE `vehicles` v
INNER JOIN `vehicle_cities` c ON c.name = v.location_name AND c.deleted_at IS NULL
SET v.city_id = c.id
WHERE v.city_id IS NULL;

-- Map vehicles → models
UPDATE `vehicles` v
INNER JOIN `vehicle_models` m ON m.name = v.model AND m.deleted_at IS NULL
SET v.model_id = m.id
WHERE v.model_id IS NULL;

ALTER TABLE `vehicles`
  ADD CONSTRAINT `fk_vehicles_city` FOREIGN KEY (`city_id`) REFERENCES `vehicle_cities` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicles_model` FOREIGN KEY (`model_id`) REFERENCES `vehicle_models` (`id`) ON DELETE SET NULL;
