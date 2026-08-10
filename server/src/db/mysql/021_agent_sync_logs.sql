-- 021: Agent sync attempt audit log (create / update / unmatched / failed)
SET NAMES utf8mb4;

USE `ITAssetManagement_2026`;

CREATE TABLE IF NOT EXISTS `agent_sync_logs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `action` VARCHAR(32) NOT NULL COMMENT 'updated|created|unmatched|failed|attempt',
  `status` VARCHAR(32) NOT NULL DEFAULT 'ok' COMMENT 'ok|error',
  `message` VARCHAR(500) NULL,
  `asset_id` INT UNSIGNED NULL,
  `asset_tag` VARCHAR(191) NULL,
  `serial_number` VARCHAR(191) NULL,
  `hostname` VARCHAR(191) NULL,
  `matched_by` VARCHAR(64) NULL,
  `platform` VARCHAR(64) NULL,
  `client_ip` VARCHAR(64) NULL,
  `snapshot_id` INT UNSIGNED NULL,
  `payload_summary` JSON NULL,
  `error_detail` TEXT NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_agent_sync_logs_created` (`created_at`),
  KEY `idx_agent_sync_logs_asset` (`asset_id`),
  KEY `idx_agent_sync_logs_serial` (`serial_number`),
  KEY `idx_agent_sync_logs_hostname` (`hostname`),
  KEY `idx_agent_sync_logs_action` (`action`),
  CONSTRAINT `fk_agent_sync_logs_asset` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `schema_migrations` (`version`, `description`)
SELECT '021_agent_sync_logs', 'Audit log for every ITAgent sync attempt (create/update/unmatched/fail)'
WHERE NOT EXISTS (SELECT 1 FROM `schema_migrations` WHERE `version` = '021_agent_sync_logs');
