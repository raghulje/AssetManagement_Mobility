-- Clear previously minted QR metadata so labels regenerate against current PUBLIC_APP_URL.
-- PNG files under storage/public/assets/qr/ are not deleted by this script (safe to remove manually).

UPDATE `assets`
SET
  `qr_token` = NULL,
  `qr_url` = NULL,
  `qr_image_path` = NULL,
  `label_printed_at` = NULL,
  `label_print_count` = 0,
  `updated_at` = CURRENT_TIMESTAMP
WHERE `qr_token` IS NOT NULL
   OR `qr_url` IS NOT NULL
   OR `qr_image_path` IS NOT NULL
   OR COALESCE(`label_print_count`, 0) > 0
   OR `label_printed_at` IS NOT NULL;
