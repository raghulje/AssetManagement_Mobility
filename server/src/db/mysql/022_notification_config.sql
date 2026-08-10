-- JSON bag for email notification toggles + extra recipient lists (Biogas-style admin config)
ALTER TABLE `settings`
  ADD COLUMN `notification_config` JSON NULL AFTER `alert_email`;
