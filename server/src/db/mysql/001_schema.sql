-- =============================================================================
-- IT Asset Management 2026 — MySQL Schema (International / Enterprise)
-- Database: ITAssetManagement_2026
-- Charset: utf8mb4 (full Unicode / emoji / CJK)
-- Engine: InnoDB (transactions, FKs, row-level locking)
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS `ITAssetManagement_2026`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ITAssetManagement_2026`;

-- -----------------------------------------------------------------------------
-- Schema versioning
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `version` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schema_migrations_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Configuration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `site_name` VARCHAR(191) NOT NULL DEFAULT 'IT Asset Management',
  `site_locale` VARCHAR(16) NOT NULL DEFAULT 'en-US',
  `default_currency` CHAR(3) NOT NULL DEFAULT 'USD',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
  `date_display_format` VARCHAR(32) NOT NULL DEFAULT 'Y-m-d',
  `time_display_format` VARCHAR(32) NOT NULL DEFAULT 'H:i',
  `full_multiple_companies_support` TINYINT(1) NOT NULL DEFAULT 1,
  `alert_email` VARCHAR(191) NULL,
  `default_eula_text` MEDIUMTEXT NULL,
  `login_note` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Organization
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `companies` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(32) NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_companies_name` (`name`),
  KEY `idx_companies_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `locations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `parent_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `address` VARCHAR(255) NULL,
  `address2` VARCHAR(255) NULL,
  `city` VARCHAR(100) NULL,
  `state` VARCHAR(100) NULL,
  `country` CHAR(2) NULL COMMENT 'ISO 3166-1 alpha-2',
  `zip` VARCHAR(20) NULL,
  `currency` CHAR(3) NULL,
  `ldap_ou` VARCHAR(255) NULL,
  `manager_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_locations_parent` (`parent_id`),
  KEY `idx_locations_company` (`company_id`),
  KEY `idx_locations_deleted` (`deleted_at`),
  CONSTRAINT `fk_locations_parent` FOREIGN KEY (`parent_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_locations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `company_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `manager_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_departments_company` (`company_id`),
  KEY `idx_departments_location` (`location_id`),
  CONSTRAINT `fk_departments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_departments_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permission_groups` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `permissions` JSON NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_groups_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_num` VARCHAR(64) NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `email` VARCHAR(191) NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(40) NULL,
  `jobtitle` VARCHAR(150) NULL,
  `locale` VARCHAR(16) NOT NULL DEFAULT 'en-US',
  `timezone` VARCHAR(64) NULL,
  `company_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `department_id` INT UNSIGNED NULL,
  `manager_id` INT UNSIGNED NULL,
  `activated` TINYINT(1) NOT NULL DEFAULT 1,
  `permissions` JSON NULL,
  `notes` TEXT NULL,
  `last_login` DATETIME NULL,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_company` (`company_id`),
  KEY `idx_users_location` (`location_id`),
  KEY `idx_users_department` (`department_id`),
  KEY `idx_users_activated` (`activated`),
  KEY `idx_users_deleted` (`deleted_at`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_manager` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users_groups` (
  `user_id` INT UNSIGNED NOT NULL,
  `group_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `group_id`),
  CONSTRAINT `fk_users_groups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_users_groups_group` FOREIGN KEY (`group_id`) REFERENCES `permission_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `abilities` JSON NULL,
  `last_used_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_api_tokens_hash` (`token_hash`),
  KEY `idx_api_tokens_user` (`user_id`),
  CONSTRAINT `fk_api_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Master data
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `manufacturers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `url` VARCHAR(255) NULL,
  `support_url` VARCHAR(255) NULL,
  `support_email` VARCHAR(191) NULL,
  `support_phone` VARCHAR(40) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_manufacturers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `url` VARCHAR(255) NULL,
  `address` VARCHAR(255) NULL,
  `city` VARCHAR(100) NULL,
  `state` VARCHAR(100) NULL,
  `country` CHAR(2) NULL,
  `zip` VARCHAR(20) NULL,
  `contact` VARCHAR(150) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(40) NULL,
  `fax` VARCHAR(40) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_suppliers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `category_type` ENUM('asset','accessory','consumable','component','license') NOT NULL DEFAULT 'asset',
  `require_acceptance` TINYINT(1) NOT NULL DEFAULT 0,
  `checkin_email` TINYINT(1) NOT NULL DEFAULT 0,
  `eula_text` MEDIUMTEXT NULL,
  `use_default_eula` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_categories_type` (`category_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `status_labels` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('deployable','pending','undeployable','archived') NOT NULL DEFAULT 'deployable',
  `color` VARCHAR(20) NULL,
  `show_in_nav` TINYINT(1) NOT NULL DEFAULT 1,
  `default_label` TINYINT(1) NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status_labels_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `depreciations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `months` INT UNSIGNED NOT NULL DEFAULT 36,
  `depreciation_min` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `custom_fieldsets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_custom_fieldsets_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `custom_fields` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `db_column` VARCHAR(64) NOT NULL,
  `format` VARCHAR(64) NOT NULL DEFAULT 'ANY',
  `element` VARCHAR(32) NOT NULL DEFAULT 'text',
  `field_values` TEXT NULL,
  `help_text` VARCHAR(255) NULL,
  `show_in_email` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_custom_fields_column` (`db_column`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `custom_field_custom_fieldset` (
  `custom_field_id` INT UNSIGNED NOT NULL,
  `custom_fieldset_id` INT UNSIGNED NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`custom_field_id`, `custom_fieldset_id`),
  CONSTRAINT `fk_cfcf_field` FOREIGN KEY (`custom_field_id`) REFERENCES `custom_fields` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cfcf_fieldset` FOREIGN KEY (`custom_fieldset_id`) REFERENCES `custom_fieldsets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `models` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `model_number` VARCHAR(100) NULL,
  `category_id` INT UNSIGNED NULL,
  `manufacturer_id` INT UNSIGNED NULL,
  `depreciation_id` INT UNSIGNED NULL,
  `fieldset_id` INT UNSIGNED NULL,
  `eol` INT UNSIGNED NULL COMMENT 'End of life months',
  `notes` TEXT NULL,
  `requestable` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_models_category` (`category_id`),
  KEY `idx_models_manufacturer` (`manufacturer_id`),
  CONSTRAINT `fk_models_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_models_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_models_depreciation` FOREIGN KEY (`depreciation_id`) REFERENCES `depreciations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_models_fieldset` FOREIGN KEY (`fieldset_id`) REFERENCES `custom_fieldsets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Core inventory
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_tag` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NULL,
  `serial` VARCHAR(191) NULL,
  `model_id` INT UNSIGNED NULL,
  `status_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `rtd_location_id` INT UNSIGNED NULL COMMENT 'Ready-to-deploy / default location',
  `assigned_to` INT UNSIGNED NULL,
  `assigned_type` ENUM('user','location','asset','employee') NULL,
  `purchase_date` DATE NULL,
  `purchase_cost` DECIMAL(15,2) NULL,
  `order_number` VARCHAR(100) NULL,
  `warranty_months` INT UNSIGNED NULL,
  `asset_eol_date` DATE NULL,
  `notes` TEXT NULL,
  `requestable` TINYINT(1) NOT NULL DEFAULT 0,
  `byod` TINYINT(1) NOT NULL DEFAULT 0,
  `expected_checkin` DATE NULL,
  `last_checkout` DATETIME NULL,
  `last_checkin` DATETIME NULL,
  `last_audit_date` DATETIME NULL,
  `next_audit_date` DATE NULL,
  `checkin_counter` INT UNSIGNED NOT NULL DEFAULT 0,
  `checkout_counter` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assets_tag` (`asset_tag`),
  KEY `idx_assets_serial` (`serial`),
  KEY `idx_assets_model` (`model_id`),
  KEY `idx_assets_status` (`status_id`),
  KEY `idx_assets_company` (`company_id`),
  KEY `idx_assets_location` (`location_id`),
  KEY `idx_assets_assigned` (`assigned_type`, `assigned_to`),
  KEY `idx_assets_next_audit` (`next_audit_date`),
  KEY `idx_assets_expected_checkin` (`expected_checkin`),
  KEY `idx_assets_deleted` (`deleted_at`),
  CONSTRAINT `fk_assets_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assets_status` FOREIGN KEY (`status_id`) REFERENCES `status_labels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assets_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assets_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assets_rtd_location` FOREIGN KEY (`rtd_location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `asset_custom_values` (
  `asset_id` INT UNSIGNED NOT NULL,
  `custom_field_id` INT UNSIGNED NOT NULL,
  `value` TEXT NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`asset_id`, `custom_field_id`),
  CONSTRAINT `fk_acv_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_acv_field` FOREIGN KEY (`custom_field_id`) REFERENCES `custom_fields` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `licenses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `serial` VARCHAR(255) NULL COMMENT 'Product key',
  `seats` INT UNSIGNED NOT NULL DEFAULT 1,
  `company_id` INT UNSIGNED NULL,
  `manufacturer_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `category_id` INT UNSIGNED NULL,
  `license_name` VARCHAR(191) NULL,
  `license_email` VARCHAR(191) NULL,
  `reassignable` TINYINT(1) NOT NULL DEFAULT 1,
  `expiration_date` DATE NULL,
  `termination_date` DATE NULL,
  `purchase_date` DATE NULL,
  `purchase_cost` DECIMAL(15,2) NULL,
  `purchase_order` VARCHAR(100) NULL,
  `order_number` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_licenses_company` (`company_id`),
  KEY `idx_licenses_expiration` (`expiration_date`),
  CONSTRAINT `fk_licenses_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_licenses_manufacturer` FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_licenses_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_licenses_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `license_seats` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `license_id` INT UNSIGNED NOT NULL,
  `assigned_to` INT UNSIGNED NULL,
  `asset_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_license_seats_license` (`license_id`),
  KEY `idx_license_seats_user` (`assigned_to`),
  KEY `idx_license_seats_asset` (`asset_id`),
  CONSTRAINT `fk_license_seats_license` FOREIGN KEY (`license_id`) REFERENCES `licenses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_license_seats_user` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_license_seats_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accessories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `category_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `manufacturer_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `model_number` VARCHAR(100) NULL,
  `order_number` VARCHAR(100) NULL,
  `purchase_date` DATE NULL,
  `purchase_cost` DECIMAL(15,2) NULL,
  `qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `min_amt` INT UNSIGNED NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `requestable` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_accessories_company` (`company_id`),
  CONSTRAINT `fk_accessories_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_accessories_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_accessories_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accessories_checkout` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `accessory_id` INT UNSIGNED NOT NULL,
  `assigned_to` INT UNSIGNED NULL,
  `assigned_type` ENUM('user','location','asset') NOT NULL DEFAULT 'user',
  `assigned_qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `note` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_acc_checkout_accessory` (`accessory_id`),
  KEY `idx_acc_checkout_assigned` (`assigned_type`, `assigned_to`),
  CONSTRAINT `fk_acc_checkout_accessory` FOREIGN KEY (`accessory_id`) REFERENCES `accessories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_acc_checkout_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `consumables` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `category_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `manufacturer_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `model_number` VARCHAR(100) NULL,
  `item_no` VARCHAR(100) NULL,
  `order_number` VARCHAR(100) NULL,
  `purchase_date` DATE NULL,
  `purchase_cost` DECIMAL(15,2) NULL,
  `qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `min_amt` INT UNSIGNED NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_consumables_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_consumables_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_consumables_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `consumables_users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `consumable_id` INT UNSIGNED NOT NULL,
  `assigned_to` INT UNSIGNED NOT NULL,
  `assigned_qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `note` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cons_users_consumable` (`consumable_id`),
  KEY `idx_cons_users_user` (`assigned_to`),
  CONSTRAINT `fk_cons_users_consumable` FOREIGN KEY (`consumable_id`) REFERENCES `consumables` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cons_users_user` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `components` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `category_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `supplier_id` INT UNSIGNED NULL,
  `model_number` VARCHAR(100) NULL,
  `serial` VARCHAR(191) NULL,
  `order_number` VARCHAR(100) NULL,
  `purchase_date` DATE NULL,
  `purchase_cost` DECIMAL(15,2) NULL,
  `qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `min_amt` INT UNSIGNED NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_components_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_components_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_components_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `components_assets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `component_id` INT UNSIGNED NOT NULL,
  `asset_id` INT UNSIGNED NOT NULL,
  `assigned_qty` INT UNSIGNED NOT NULL DEFAULT 1,
  `note` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comp_assets_component` (`component_id`),
  KEY `idx_comp_assets_asset` (`asset_id`),
  CONSTRAINT `fk_comp_assets_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_assets_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits_models` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kit_id` INT UNSIGNED NOT NULL,
  `model_id` INT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_kits_models_kit` FOREIGN KEY (`kit_id`) REFERENCES `kits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kits_models_model` FOREIGN KEY (`model_id`) REFERENCES `models` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits_licenses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kit_id` INT UNSIGNED NOT NULL,
  `license_id` INT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_kits_licenses_kit` FOREIGN KEY (`kit_id`) REFERENCES `kits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kits_licenses_license` FOREIGN KEY (`license_id`) REFERENCES `licenses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits_accessories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kit_id` INT UNSIGNED NOT NULL,
  `accessory_id` INT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_kits_acc_kit` FOREIGN KEY (`kit_id`) REFERENCES `kits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kits_acc_accessory` FOREIGN KEY (`accessory_id`) REFERENCES `accessories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kits_consumables` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kit_id` INT UNSIGNED NOT NULL,
  `consumable_id` INT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_kits_cons_kit` FOREIGN KEY (`kit_id`) REFERENCES `kits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kits_cons_consumable` FOREIGN KEY (`consumable_id`) REFERENCES `consumables` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `asset_id` INT UNSIGNED NOT NULL,
  `supplier_id` INT UNSIGNED NULL,
  `asset_maintenance_type` VARCHAR(64) NOT NULL DEFAULT 'Maintenance',
  `title` VARCHAR(191) NOT NULL,
  `is_warranty` TINYINT(1) NOT NULL DEFAULT 0,
  `start_date` DATE NULL,
  `completion_date` DATE NULL,
  `asset_maintenance_time` INT NULL COMMENT 'Days',
  `note` TEXT NULL,
  `cost` DECIMAL(15,2) NULL,
  `user_id` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_maintenances_asset` (`asset_id`),
  CONSTRAINT `fk_maintenances_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_maintenances_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_maintenances_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Custody / acceptance / requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `checkout_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `requestable_id` INT UNSIGNED NOT NULL,
  `requestable_type` VARCHAR(64) NOT NULL DEFAULT 'asset',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_checkout_requests_user` (`user_id`),
  CONSTRAINT `fk_checkout_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `checkout_acceptances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `checkoutable_id` INT UNSIGNED NOT NULL,
  `checkoutable_type` VARCHAR(64) NOT NULL,
  `assigned_to` INT UNSIGNED NOT NULL,
  `accepted_at` DATETIME NULL,
  `declined_at` DATETIME NULL,
  `signature_filename` VARCHAR(255) NULL,
  `note` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_acceptances_assigned` (`assigned_to`),
  KEY `idx_acceptances_item` (`checkoutable_type`, `checkoutable_id`),
  CONSTRAINT `fk_acceptances_user` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Audit / history / security telemetry (enterprise)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `action_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `action_type` VARCHAR(64) NOT NULL,
  `item_type` VARCHAR(64) NULL,
  `item_id` INT UNSIGNED NULL,
  `target_type` VARCHAR(64) NULL,
  `target_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `note` TEXT NULL,
  `filename` VARCHAR(255) NULL,
  `log_meta` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  `request_id` VARCHAR(64) NULL,
  `action_date` DATETIME NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_action_logs_action` (`action_type`),
  KEY `idx_action_logs_item` (`item_type`, `item_id`),
  KEY `idx_action_logs_target` (`target_type`, `target_id`),
  KEY `idx_action_logs_user` (`user_id`),
  KEY `idx_action_logs_date` (`action_date`),
  KEY `idx_action_logs_company` (`company_id`),
  CONSTRAINT `fk_action_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_action_logs_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NULL,
  `user_id` INT UNSIGNED NULL,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  `successful` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_attempts_username` (`username`),
  KEY `idx_login_attempts_ip` (`ip_address`),
  KEY `idx_login_attempts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `imports` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NULL,
  `file_path` VARCHAR(500) NULL,
  `import_type` VARCHAR(64) NULL,
  `filesize` INT UNSIGNED NULL,
  `field_map` JSON NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `row_count` INT UNSIGNED NULL,
  `error_count` INT UNSIGNED NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_imports_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `schema_migrations` (`version`, `description`)
VALUES ('001_initial_schema', 'Full ITAM enterprise schema with audit logs')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
