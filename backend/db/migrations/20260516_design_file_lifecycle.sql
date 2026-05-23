-- Production-ready Design Library file lifecycle and soft-delete support.

SET @has_local_designs_deleted_at := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND COLUMN_NAME = 'deleted_at'
);
SET @add_local_designs_deleted_columns := IF(
  @has_local_designs_deleted_at = 0,
  'ALTER TABLE `local_designs`
    ADD COLUMN `deleted_at` datetime DEFAULT NULL AFTER `archived_by`,
    ADD COLUMN `deleted_by` int unsigned DEFAULT NULL AFTER `deleted_at`,
    ADD COLUMN `delete_reason` text DEFAULT NULL AFTER `deleted_by`,
    ADD KEY `idx_local_designs_deleted_at` (`deleted_at`),
    ADD KEY `fk_local_designs_deleted_by` (`deleted_by`),
    ADD CONSTRAINT `fk_local_designs_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''local_designs delete columns already exist'' AS message'
);
PREPARE stmt FROM @add_local_designs_deleted_columns;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_files_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_files'
    AND COLUMN_NAME = 'status'
);
SET @add_local_design_file_lifecycle := IF(
  @has_local_design_files_status = 0,
  'ALTER TABLE `local_design_files`
    ADD COLUMN `status` enum(''active'',''replaced'',''removed'') NOT NULL DEFAULT ''active'' AFTER `is_print_ready`,
    ADD COLUMN `removed_at` datetime DEFAULT NULL AFTER `status`,
    ADD COLUMN `removed_by` int unsigned DEFAULT NULL AFTER `removed_at`,
    ADD COLUMN `replaced_by_id` int unsigned DEFAULT NULL AFTER `removed_by`,
    ADD COLUMN `removal_reason` varchar(500) DEFAULT NULL AFTER `replaced_by_id`,
    ADD KEY `idx_local_design_files_status` (`local_design_id`, `status`, `is_primary`, `sort_order`, `id`),
    ADD KEY `fk_local_design_files_removed_by` (`removed_by`),
    ADD KEY `fk_local_design_files_replaced_by` (`replaced_by_id`),
    ADD CONSTRAINT `fk_local_design_files_removed_by` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `fk_local_design_files_replaced_by` FOREIGN KEY (`replaced_by_id`) REFERENCES `local_design_files` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''local_design_files lifecycle columns already exist'' AS message'
);
PREPARE stmt FROM @add_local_design_file_lifecycle;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_images_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND COLUMN_NAME = 'status'
);
SET @add_local_design_image_lifecycle := IF(
  @has_local_design_images_status = 0,
  'ALTER TABLE `local_design_images`
    ADD COLUMN `status` enum(''active'',''replaced'',''removed'') NOT NULL DEFAULT ''active'' AFTER `is_primary`,
    ADD COLUMN `removed_at` datetime DEFAULT NULL AFTER `status`,
    ADD COLUMN `removed_by` int unsigned DEFAULT NULL AFTER `removed_at`,
    ADD COLUMN `replaced_by_id` int unsigned DEFAULT NULL AFTER `removed_by`,
    ADD COLUMN `removal_reason` varchar(500) DEFAULT NULL AFTER `replaced_by_id`,
    ADD KEY `idx_local_design_images_status` (`local_design_id`, `status`, `is_primary`, `sort_order`, `id`),
    ADD KEY `fk_local_design_images_removed_by` (`removed_by`),
    ADD KEY `fk_local_design_images_replaced_by` (`replaced_by_id`),
    ADD CONSTRAINT `fk_local_design_images_removed_by` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `fk_local_design_images_replaced_by` FOREIGN KEY (`replaced_by_id`) REFERENCES `local_design_images` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''local_design_images lifecycle columns already exist'' AS message'
);
PREPARE stmt FROM @add_local_design_image_lifecycle;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `mmf_print_ready_files`
  MODIFY `status` enum('cached','failed','removed','archived') NOT NULL DEFAULT 'cached';
