-- Durable full-asset AI moderation runs for community Design Library submissions.
-- This migration is intentionally idempotent so it can recover from partial runs.

SET @add_latest_moderation_run_id := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_designs`
      ADD COLUMN `latest_moderation_run_id` bigint unsigned DEFAULT NULL AFTER `moderation_decision_source`',
    'SELECT ''local_designs.latest_moderation_run_id already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND COLUMN_NAME = 'latest_moderation_run_id'
);
PREPARE stmt FROM @add_latest_moderation_run_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_moderation_content_hash := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_designs`
      ADD COLUMN `moderation_content_hash` char(64) DEFAULT NULL AFTER `latest_moderation_run_id`',
    'SELECT ''local_designs.moderation_content_hash already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND COLUMN_NAME = 'moderation_content_hash'
);
PREPARE stmt FROM @add_moderation_content_hash;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_moderation_policy_version := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_designs`
      ADD COLUMN `moderation_policy_version` varchar(80) DEFAULT NULL AFTER `moderation_content_hash`',
    'SELECT ''local_designs.moderation_policy_version already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND COLUMN_NAME = 'moderation_policy_version'
);
PREPARE stmt FROM @add_moderation_policy_version;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_idx_latest_moderation_run := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_designs`
      ADD KEY `idx_local_designs_latest_moderation_run` (`latest_moderation_run_id`)',
    'SELECT ''idx_local_designs_latest_moderation_run already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND INDEX_NAME = 'idx_local_designs_latest_moderation_run'
);
PREPARE stmt FROM @add_idx_latest_moderation_run;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_idx_public_moderation_hash := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `local_designs`
      ADD KEY `idx_local_designs_public_moderation_hash` (
        `moderation_status`,
        `latest_moderation_run_id`,
        `moderation_content_hash`
      )',
    'SELECT ''idx_local_designs_public_moderation_hash already exists'' AS message'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND INDEX_NAME = 'idx_local_designs_public_moderation_hash'
);
PREPARE stmt FROM @add_idx_public_moderation_hash;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS local_design_moderation_runs (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  local_design_id int NOT NULL,
  trigger_kind enum('publish','owner_edit','admin_recheck','startup_retry') NOT NULL,
  actor_id int unsigned DEFAULT NULL,
  actor_type enum('system','user','admin') NOT NULL DEFAULT 'system',
  status enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  provider varchar(40) NOT NULL DEFAULT 'openai',
  moderation_model varchar(120) NOT NULL,
  policy_model varchar(120) DEFAULT NULL,
  policy_version varchar(80) NOT NULL,
  content_hash char(64) NOT NULL,
  final_decision enum('auto_approved','needs_admin_review') DEFAULT NULL,
  summary text DEFAULT NULL,
  feedback text DEFAULT NULL,
  flags json DEFAULT NULL,
  error_message text DEFAULT NULL,
  queued_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at datetime DEFAULT NULL,
  completed_at datetime DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ldmr_design_created (local_design_id, created_at, id),
  KEY idx_ldmr_status_queue (status, queued_at, id),
  KEY idx_ldmr_design_hash_decision (
    local_design_id,
    content_hash,
    status,
    final_decision
  ),
  KEY fk_ldmr_actor (actor_id),
  CONSTRAINT fk_ldmr_design
    FOREIGN KEY (local_design_id) REFERENCES local_designs (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ldmr_actor
    FOREIGN KEY (actor_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS local_design_moderation_run_items (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  run_id bigint unsigned NOT NULL,
  local_design_id int NOT NULL,
  item_type enum(
    'metadata',
    'file_name',
    'image_name',
    'gallery_image',
    'model_snapshot',
    'model_render',
    'policy_classification'
  ) NOT NULL,
  local_design_file_id int unsigned DEFAULT NULL,
  local_design_image_id int unsigned DEFAULT NULL,
  file_object_id bigint unsigned DEFAULT NULL,
  label varchar(500) NOT NULL,
  input_hash char(64) NOT NULL,
  status enum('pending','passed','flagged','failed','skipped') NOT NULL DEFAULT 'pending',
  provider varchar(40) NOT NULL DEFAULT 'openai',
  model varchar(120) DEFAULT NULL,
  categories json DEFAULT NULL,
  category_scores json DEFAULT NULL,
  policy_result json DEFAULT NULL,
  summary text DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ldmri_run_created (run_id, created_at, id),
  KEY idx_ldmri_design_type_status (local_design_id, item_type, status),
  KEY idx_ldmri_file_object (file_object_id),
  KEY idx_ldmri_design_file (local_design_file_id),
  KEY idx_ldmri_design_image (local_design_image_id),
  CONSTRAINT fk_ldmri_run
    FOREIGN KEY (run_id) REFERENCES local_design_moderation_runs (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ldmri_design
    FOREIGN KEY (local_design_id) REFERENCES local_designs (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ldmri_design_file
    FOREIGN KEY (local_design_file_id) REFERENCES local_design_files (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ldmri_design_image
    FOREIGN KEY (local_design_image_id) REFERENCES local_design_images (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ldmri_file_object
    FOREIGN KEY (file_object_id) REFERENCES file_objects (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
