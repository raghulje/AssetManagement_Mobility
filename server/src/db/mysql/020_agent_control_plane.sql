-- 020: ITAM agent registry + remote command queue (scan / rerun)
SET NAMES utf8mb4;

USE `ITAssetManagement_2026`;

CREATE TABLE IF NOT EXISTS `agents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_uuid` CHAR(36) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `asset_id` INT UNSIGNED NULL,
  `hostname` VARCHAR(191) NULL,
  `serial_number` VARCHAR(191) NULL,
  `platform` VARCHAR(64) NULL,
  `agent_version` VARCHAR(32) NULL,
  `last_heartbeat_at` DATETIME NULL,
  `last_inventory_at` DATETIME NULL,
  `last_ip` VARCHAR(64) NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_agents_uuid` (`agent_uuid`),
  KEY `idx_agents_asset` (`asset_id`),
  KEY `idx_agents_serial` (`serial_number`),
  KEY `idx_agents_heartbeat` (`last_heartbeat_at`),
  CONSTRAINT `fk_agents_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_commands` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id` INT UNSIGNED NOT NULL,
  `asset_id` INT UNSIGNED NULL,
  `command` VARCHAR(32) NOT NULL DEFAULT 'scan',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `requested_by` INT UNSIGNED NULL,
  `payload` JSON NULL,
  `result` JSON NULL,
  `error_message` VARCHAR(500) NULL,
  `created_at` DATETIME NULL,
  `claimed_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_cmd_agent_status` (`agent_id`, `status`),
  KEY `idx_agent_cmd_asset` (`asset_id`),
  KEY `idx_agent_cmd_created` (`created_at`),
  CONSTRAINT `fk_agent_cmd_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_cmd_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `schema_migrations` (`version`, `description`)
SELECT '020_agent_control_plane', 'Agent registry, heartbeat, remote scan/rerun command queue'
WHERE NOT EXISTS (SELECT 1 FROM `schema_migrations` WHERE `version` = '020_agent_control_plane');
