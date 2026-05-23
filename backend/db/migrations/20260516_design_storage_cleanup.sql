-- Design storage retention cleanup support.

SET @has_local_design_files_storage_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_files'
    AND COLUMN_NAME = 'storage_status'
);

SET @add_local_design_files_storage_columns := IF(
  @has_local_design_files_storage_status = 0,
  'ALTER TABLE `local_design_files`
    ADD COLUMN `storage_status` enum(''present'',''delete_pending'',''deleted'',''missing'',''delete_failed'') NOT NULL DEFAULT ''present'' AFTER `removal_reason`,
    ADD COLUMN `storage_deleted_at` datetime DEFAULT NULL AFTER `storage_status`,
    ADD COLUMN `storage_delete_reason` varchar(500) DEFAULT NULL AFTER `storage_deleted_at`,
    ADD COLUMN `storage_cleanup_job_id` bigint unsigned DEFAULT NULL AFTER `storage_delete_reason`,
    ADD COLUMN `last_storage_check_at` datetime DEFAULT NULL AFTER `storage_cleanup_job_id`,
    ADD KEY `idx_local_design_files_storage_cleanup` (`storage_status`, `status`, `removed_at`, `local_design_id`, `id`)',
  'SELECT ''local_design_files storage cleanup columns already exist'' AS message'
);
PREPARE stmt FROM @add_local_design_files_storage_columns;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_local_design_images_storage_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND COLUMN_NAME = 'storage_status'
);

SET @add_local_design_images_storage_columns := IF(
  @has_local_design_images_storage_status = 0,
  'ALTER TABLE `local_design_images`
    ADD COLUMN `storage_status` enum(''present'',''delete_pending'',''deleted'',''missing'',''delete_failed'') NOT NULL DEFAULT ''present'' AFTER `removal_reason`,
    ADD COLUMN `storage_deleted_at` datetime DEFAULT NULL AFTER `storage_status`,
    ADD COLUMN `storage_delete_reason` varchar(500) DEFAULT NULL AFTER `storage_deleted_at`,
    ADD COLUMN `storage_cleanup_job_id` bigint unsigned DEFAULT NULL AFTER `storage_delete_reason`,
    ADD COLUMN `last_storage_check_at` datetime DEFAULT NULL AFTER `storage_cleanup_job_id`,
    ADD KEY `idx_local_design_images_storage_cleanup` (`storage_status`, `status`, `removed_at`, `local_design_id`, `id`)',
  'SELECT ''local_design_images storage cleanup columns already exist'' AS message'
);
PREPARE stmt FROM @add_local_design_images_storage_columns;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_mmf_print_ready_files_storage_status := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND COLUMN_NAME = 'storage_status'
);

SET @add_mmf_print_ready_files_storage_columns := IF(
  @has_mmf_print_ready_files_storage_status = 0,
  'ALTER TABLE `mmf_print_ready_files`
    ADD COLUMN `storage_status` enum(''present'',''delete_pending'',''deleted'',''missing'',''delete_failed'') NOT NULL DEFAULT ''present'' AFTER `error_message`,
    ADD COLUMN `storage_deleted_at` datetime DEFAULT NULL AFTER `storage_status`,
    ADD COLUMN `storage_delete_reason` varchar(500) DEFAULT NULL AFTER `storage_deleted_at`,
    ADD COLUMN `storage_cleanup_job_id` bigint unsigned DEFAULT NULL AFTER `storage_delete_reason`,
    ADD COLUMN `last_storage_check_at` datetime DEFAULT NULL AFTER `storage_cleanup_job_id`,
    ADD KEY `idx_mmf_print_ready_files_storage_cleanup` (`storage_status`, `status`, `updated_at`, `id`)',
  'SELECT ''mmf_print_ready_files storage cleanup columns already exist'' AS message'
);
PREPARE stmt FROM @add_mmf_print_ready_files_storage_columns;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
