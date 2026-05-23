-- Add lookup indexes used by multi-file Design Library duplicate prevention.

SET @has_local_design_file_checksum_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_files'
    AND INDEX_NAME = 'idx_local_design_files_checksum'
);
SET @add_local_design_file_checksum_idx := IF(
  @has_local_design_file_checksum_idx = 0,
  'ALTER TABLE `local_design_files` ADD INDEX `idx_local_design_files_checksum` (`local_design_id`, `checksum_sha256`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_local_design_file_checksum_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_image_url_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND INDEX_NAME = 'idx_local_design_images_url'
);
SET @add_local_design_image_url_idx := IF(
  @has_local_design_image_url_idx = 0,
  'ALTER TABLE `local_design_images` ADD INDEX `idx_local_design_images_url` (`local_design_id`, `image_url`(255))',
  'SELECT 1'
);
PREPARE stmt FROM @add_local_design_image_url_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_image_checksum_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND COLUMN_NAME = 'checksum_sha256'
);
SET @add_local_design_image_checksum_column := IF(
  @has_local_design_image_checksum_column = 0,
  'ALTER TABLE `local_design_images` ADD COLUMN `checksum_sha256` char(64) DEFAULT NULL AFTER `original_file_name`',
  'SELECT 1'
);
PREPARE stmt FROM @add_local_design_image_checksum_column;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_image_checksum_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND INDEX_NAME = 'idx_local_design_images_checksum'
);
SET @add_local_design_image_checksum_idx := IF(
  @has_local_design_image_checksum_idx = 0,
  'ALTER TABLE `local_design_images` ADD INDEX `idx_local_design_images_checksum` (`local_design_id`, `checksum_sha256`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_local_design_image_checksum_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
