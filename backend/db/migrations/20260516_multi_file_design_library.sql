-- Multi-file Design Library support.
-- Keeps legacy local_designs file/thumbnail columns as primary denormalized fields.

CREATE TABLE IF NOT EXISTS `local_design_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int NOT NULL,
  `file_url` varchar(1000) NOT NULL,
  `model_snapshot_url` varchar(1000) DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `is_print_ready` tinyint(1) NOT NULL DEFAULT '0',
  `print_ready_at` datetime DEFAULT NULL,
  `print_ready_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_local_design_files_design_order` (`local_design_id`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_files_print_ready` (`local_design_id`,`is_print_ready`,`sort_order`,`id`),
  KEY `idx_local_design_files_checksum` (`local_design_id`,`checksum_sha256`),
  KEY `fk_local_design_files_print_ready_by` (`print_ready_by`),
  CONSTRAINT `fk_local_design_files_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_local_design_files_print_ready_by` FOREIGN KEY (`print_ready_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `local_design_images` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `local_design_id` int NOT NULL,
  `image_url` varchar(1000) NOT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_local_design_images_design_order` (`local_design_id`,`is_primary`,`sort_order`,`id`),
  KEY `idx_local_design_images_url` (`local_design_id`,`image_url`(255)),
  KEY `idx_local_design_images_checksum` (`local_design_id`,`checksum_sha256`),
  CONSTRAINT `fk_local_design_images_design` FOREIGN KEY (`local_design_id`) REFERENCES `local_designs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `local_design_files` (
  `local_design_id`,
  `file_url`,
  `original_file_name`,
  `extension`,
  `sort_order`,
  `is_primary`,
  `is_print_ready`,
  `print_ready_at`,
  `print_ready_by`,
  `created_at`,
  `updated_at`
)
SELECT
  ld.id,
  ld.file_url,
  SUBSTRING_INDEX(ld.file_url, '/', -1),
  LOWER(CONCAT('.', SUBSTRING_INDEX(ld.file_url, '.', -1))),
  0,
  TRUE,
  ld.is_print_ready,
  ld.print_ready_at,
  ld.print_ready_by,
  ld.created_at,
  ld.updated_at
FROM `local_designs` ld
LEFT JOIN `local_design_files` ldf
  ON ldf.local_design_id = ld.id
WHERE ld.file_url IS NOT NULL
  AND ld.file_url <> ''
  AND ldf.id IS NULL;

INSERT INTO `local_design_images` (
  `local_design_id`,
  `image_url`,
  `original_file_name`,
  `sort_order`,
  `is_primary`,
  `created_at`,
  `updated_at`
)
SELECT
  ld.id,
  ld.thumbnail_url,
  SUBSTRING_INDEX(ld.thumbnail_url, '/', -1),
  0,
  TRUE,
  ld.created_at,
  ld.updated_at
FROM `local_designs` ld
LEFT JOIN `local_design_images` ldi
  ON ldi.local_design_id = ld.id
WHERE ld.thumbnail_url IS NOT NULL
  AND ld.thumbnail_url <> ''
  AND ldi.id IS NULL;

SET @has_mmf_sort_order := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND COLUMN_NAME = 'sort_order'
);
SET @add_mmf_sort_order := IF(
  @has_mmf_sort_order = 0,
  'ALTER TABLE `mmf_print_ready_files` ADD COLUMN `sort_order` int unsigned NOT NULL DEFAULT 0 AFTER `error_message`',
  'SELECT 1'
);
PREPARE stmt FROM @add_mmf_sort_order;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_mmf_is_primary := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND COLUMN_NAME = 'is_primary'
);
SET @add_mmf_is_primary := IF(
  @has_mmf_is_primary = 0,
  'ALTER TABLE `mmf_print_ready_files` ADD COLUMN `is_primary` tinyint(1) NOT NULL DEFAULT 0 AFTER `sort_order`',
  'SELECT 1'
);
PREPARE stmt FROM @add_mmf_is_primary;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `mmf_print_ready_files`
SET `is_primary` = TRUE
WHERE `is_primary` = FALSE
  AND `id` IN (
    SELECT primary_id
    FROM (
      SELECT MIN(id) AS primary_id
      FROM `mmf_print_ready_files`
      WHERE `status` = 'cached'
      GROUP BY `mmf_object_id`
    ) primary_files
  );

SET @has_old_object_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND INDEX_NAME = 'uq_mmf_print_ready_files_object'
);
SET @drop_old_object_unique := IF(
  @has_old_object_unique > 0,
  'ALTER TABLE `mmf_print_ready_files` DROP INDEX `uq_mmf_print_ready_files_object`',
  'SELECT 1'
);
PREPARE stmt FROM @drop_old_object_unique;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_mmf_selection_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND INDEX_NAME = 'uq_mmf_print_ready_files_selection'
);
SET @add_mmf_selection_unique := IF(
  @has_mmf_selection_unique = 0,
  'ALTER TABLE `mmf_print_ready_files` ADD UNIQUE KEY `uq_mmf_print_ready_files_selection` (`mmf_object_id`,`mmf_file_id`,`archive_entry_path`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_mmf_selection_unique;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_mmf_object_order_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND INDEX_NAME = 'idx_mmf_print_ready_files_object_order'
);
SET @add_mmf_object_order_idx := IF(
  @has_mmf_object_order_idx = 0,
  'ALTER TABLE `mmf_print_ready_files` ADD KEY `idx_mmf_print_ready_files_object_order` (`mmf_object_id`,`status`,`is_primary`,`sort_order`,`id`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_mmf_object_order_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
