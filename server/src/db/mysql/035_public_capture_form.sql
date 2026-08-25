-- Public capture form: guest submitter metadata on capture sessions
ALTER TABLE `vehicle_capture_sessions`
  ADD COLUMN `submitter_name` VARCHAR(191) NULL AFTER `notes`,
  ADD COLUMN `submitter_email` VARCHAR(191) NULL AFTER `submitter_name`,
  ADD COLUMN `submitter_phone` VARCHAR(32) NULL AFTER `submitter_email`,
  ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'app' COMMENT 'app | public_form' AFTER `submitter_phone`;
