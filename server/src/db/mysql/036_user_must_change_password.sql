-- First-login forced password change for provisioned App Users
SET NAMES utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `users`
     ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 AFTER `activated`,
     ADD KEY `idx_users_must_change_password` (`must_change_password`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
