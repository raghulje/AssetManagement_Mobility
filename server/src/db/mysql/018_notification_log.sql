-- Dedup log for scheduled asset EOL / warranty email digests
CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind` VARCHAR(64) NOT NULL,
  `item_type` VARCHAR(64) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `notified_on` DATE NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_log_day` (`kind`, `item_type`, `item_id`, `notified_on`),
  KEY `idx_notification_log_kind_day` (`kind`, `notified_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
