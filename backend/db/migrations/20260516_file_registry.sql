-- Central file registry for production-safe ownership, permissions, audit, and cleanup.

CREATE TABLE IF NOT EXISTS `file_objects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `storage_provider` enum('local','s3') NOT NULL DEFAULT 'local',
  `storage_key` varchar(1000) NOT NULL,
  `public_path` varchar(1000) DEFAULT NULL,
  `original_file_name` varchar(500) DEFAULT NULL,
  `mime_type` varchar(255) DEFAULT NULL,
  `extension` varchar(32) DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `visibility` enum('private','public') NOT NULL DEFAULT 'private',
  `storage_status` enum('present','delete_pending','deleted','missing','delete_failed') NOT NULL DEFAULT 'present',
  `created_by` int unsigned DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int unsigned DEFAULT NULL,
  `delete_reason` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_file_objects_storage_key` (`storage_key`(255)),
  KEY `idx_file_objects_checksum_size` (`checksum_sha256`,`file_size`),
  KEY `idx_file_objects_storage_status` (`storage_status`,`deleted_at`,`id`),
  KEY `idx_file_objects_created_by` (`created_by`),
  KEY `idx_file_objects_deleted_by` (`deleted_by`),
  CONSTRAINT `fk_file_objects_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_objects_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `file_references` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_object_id` bigint unsigned NOT NULL,
  `reference_type` enum(
    'quote_record',
    'print_request',
    'print_request_item',
    'local_design',
    'local_design_file',
    'local_design_image',
    'local_design_moderation_render',
    'mmf_print_ready_file',
    'slicer_profile'
  ) NOT NULL,
  `reference_id` bigint unsigned NOT NULL,
  `reference_column` varchar(100) DEFAULT NULL,
  `file_role` enum('model','thumbnail','payment_slip','profile','moderation_render','source_archive','other') NOT NULL,
  `owner_user_id` int unsigned DEFAULT NULL,
  `visibility` enum('private','public') DEFAULT NULL,
  `status` enum('active','replaced','removed','expired','archived','deleted') NOT NULL DEFAULT 'active',
  `detached_at` datetime DEFAULT NULL,
  `detach_reason` varchar(500) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_references_file_status` (`file_object_id`,`status`,`reference_type`),
  KEY `idx_file_references_reference` (`reference_type`,`reference_id`,`status`),
  KEY `idx_file_references_owner` (`owner_user_id`,`status`,`created_at`),
  CONSTRAINT `fk_file_references_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_file_references_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `file_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_reference_id` bigint unsigned DEFAULT NULL,
  `event_type` enum(
    'registered',
    'attached',
    'detached',
    'duplicate_reused',
    'access_granted',
    'access_denied',
    'delete_pending',
    'physical_deleted',
    'cleanup_skipped',
    'cleanup_failed',
    'backfilled'
  ) NOT NULL,
  `actor_id` int unsigned DEFAULT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_events_file` (`file_object_id`,`created_at`,`id`),
  KEY `idx_file_events_reference` (`file_reference_id`,`created_at`,`id`),
  KEY `idx_file_events_actor` (`actor_id`,`created_at`,`id`),
  CONSTRAINT `fk_file_events_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_events_reference` FOREIGN KEY (`file_reference_id`) REFERENCES `file_references` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_file_events_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @add_quote_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `quote_records`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `file_url`,
      ADD COLUMN `thumbnail_file_object_id` bigint unsigned DEFAULT NULL AFTER `thumbnail_url`,
      ADD KEY `idx_quote_records_file_object` (`file_object_id`),
      ADD KEY `idx_quote_records_thumbnail_file_object` (`thumbnail_file_object_id`),
      ADD CONSTRAINT `fk_quote_records_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT `fk_quote_records_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''quote_records file object columns already exist'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'quote_records'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_quote_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_print_request_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `print_requests`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `file_url`,
      ADD COLUMN `payment_slip_file_object_id` bigint unsigned DEFAULT NULL AFTER `payment_slip_url`,
      ADD KEY `idx_print_requests_file_object` (`file_object_id`),
      ADD KEY `idx_print_requests_payment_slip_file_object` (`payment_slip_file_object_id`),
      ADD CONSTRAINT `fk_print_requests_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT `fk_print_requests_payment_slip_file_object` FOREIGN KEY (`payment_slip_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''print_requests file object columns already exist'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'print_requests'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_print_request_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_print_request_item_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `print_request_items`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `file_url`,
      ADD COLUMN `thumbnail_file_object_id` bigint unsigned DEFAULT NULL AFTER `thumbnail_url`,
      ADD KEY `idx_print_request_items_file_object` (`file_object_id`),
      ADD KEY `idx_print_request_items_thumbnail_file_object` (`thumbnail_file_object_id`),
      ADD CONSTRAINT `fk_print_request_items_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT `fk_print_request_items_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''print_request_items file object columns already exist'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'print_request_items'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_print_request_item_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_local_design_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_design_files`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `file_url`,
      ADD COLUMN `model_snapshot_file_object_id` bigint unsigned DEFAULT NULL AFTER `model_snapshot_url`,
      ADD KEY `idx_local_design_files_file_object` (`file_object_id`),
      ADD KEY `idx_local_design_files_snapshot_file_object` (`model_snapshot_file_object_id`),
      ADD CONSTRAINT `fk_local_design_files_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT `fk_local_design_files_snapshot_file_object` FOREIGN KEY (`model_snapshot_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''local_design_files file object columns already exist'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_files'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_local_design_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_local_design_image_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_design_images`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `image_url`,
      ADD KEY `idx_local_design_images_file_object` (`file_object_id`),
      ADD CONSTRAINT `fk_local_design_images_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''local_design_images file object column already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_images'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_local_design_image_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_mmf_print_ready_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `mmf_print_ready_files`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `cached_file_url`,
      ADD COLUMN `model_snapshot_file_object_id` bigint unsigned DEFAULT NULL AFTER `model_snapshot_url`,
      ADD KEY `idx_mmf_print_ready_files_file_object` (`file_object_id`),
      ADD KEY `idx_mmf_print_ready_files_snapshot_file_object` (`model_snapshot_file_object_id`),
      ADD CONSTRAINT `fk_mmf_print_ready_files_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT `fk_mmf_print_ready_files_snapshot_file_object` FOREIGN KEY (`model_snapshot_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''mmf_print_ready_files file object columns already exist'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mmf_print_ready_files'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_mmf_print_ready_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_slicer_profile_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `slicer_profiles`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `profile_filename`,
      ADD KEY `idx_slicer_profiles_file_object` (`file_object_id`),
      ADD CONSTRAINT `fk_slicer_profiles_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''slicer_profiles file object column already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'slicer_profiles'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_slicer_profile_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_local_design_render_file_object_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_design_moderation_renders`
      ADD COLUMN `file_object_id` bigint unsigned DEFAULT NULL AFTER `image_url`,
      ADD KEY `idx_local_design_renders_file_object` (`file_object_id`),
      ADD CONSTRAINT `fk_local_design_renders_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT ''local_design_moderation_renders file object column already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_design_moderation_renders'
    AND COLUMN_NAME = 'file_object_id'
);
PREPARE stmt FROM @add_local_design_render_file_object_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
