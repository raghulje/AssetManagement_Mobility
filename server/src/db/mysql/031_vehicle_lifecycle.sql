-- =============================================================================
-- Refex Mobility — Vehicle asset lifecycle (assign, QR, purchase, EOL, maintenance)
-- =============================================================================

ALTER TABLE `vehicles`
  ADD COLUMN `name` VARCHAR(191) NULL AFTER `vehicle_number`,
  ADD COLUMN `assigned_to` INT UNSIGNED NULL AFTER `status`,
  ADD COLUMN `assigned_type` VARCHAR(32) NULL AFTER `assigned_to`,
  ADD COLUMN `expected_checkin` DATE NULL AFTER `assigned_type`,
  ADD COLUMN `last_checkout` DATETIME NULL AFTER `expected_checkin`,
  ADD COLUMN `last_checkin` DATETIME NULL AFTER `last_checkout`,
  ADD COLUMN `checkout_counter` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `last_checkin`,
  ADD COLUMN `checkin_counter` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `checkout_counter`,
  ADD COLUMN `purchase_date` DATE NULL AFTER `checkin_counter`,
  ADD COLUMN `purchase_cost` DECIMAL(12,2) NULL AFTER `purchase_date`,
  ADD COLUMN `order_number` VARCHAR(100) NULL AFTER `purchase_cost`,
  ADD COLUMN `supplier_name` VARCHAR(191) NULL AFTER `order_number`,
  ADD COLUMN `warranty_months` INT UNSIGNED NULL AFTER `supplier_name`,
  ADD COLUMN `vehicle_eol_date` DATE NULL AFTER `warranty_months`,
  ADD COLUMN `qr_token` VARCHAR(64) NULL AFTER `vehicle_eol_date`,
  ADD COLUMN `qr_url` VARCHAR(512) NULL AFTER `qr_token`,
  ADD COLUMN `qr_image_path` VARCHAR(512) NULL AFTER `qr_url`,
  ADD COLUMN `label_printed_at` DATETIME NULL AFTER `qr_image_path`,
  ADD COLUMN `label_print_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `label_printed_at`;

ALTER TABLE `vehicles`
  ADD KEY `idx_vehicles_assigned` (`assigned_to`, `assigned_type`),
  ADD KEY `idx_vehicles_eol` (`vehicle_eol_date`),
  ADD UNIQUE KEY `uk_vehicles_qr_token` (`qr_token`);

CREATE TABLE IF NOT EXISTS `vehicle_maintenances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vehicle_id` INT UNSIGNED NOT NULL,
  `maintenance_type` VARCHAR(64) NOT NULL DEFAULT 'Repair'
    COMMENT 'Repair | Service | Part Replacement | Upgrade | Inspection | Other',
  `title` VARCHAR(191) NOT NULL,
  `is_warranty` TINYINT(1) NOT NULL DEFAULT 0,
  `start_date` DATE NULL,
  `completion_date` DATE NULL,
  `cost` DECIMAL(12,2) NULL,
  `odometer_km` INT UNSIGNED NULL,
  `vendor_name` VARCHAR(191) NULL,
  `parts_replaced` TEXT NULL,
  `note` TEXT NULL,
  `user_id` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vm_vehicle` (`vehicle_id`),
  KEY `idx_vm_type` (`maintenance_type`),
  KEY `idx_vm_deleted` (`deleted_at`),
  CONSTRAINT `fk_vm_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_vm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
