CREATE TABLE IF NOT EXISTS `quote_assets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` int unsigned DEFAULT NULL,
  `source_type` enum('upload','library','mmf') NOT NULL,
  `design_id` int unsigned DEFAULT NULL,
  `file_object_id` bigint unsigned DEFAULT NULL,
  `file_original_name` varchar(255) DEFAULT NULL,
  `file_mime_type` varchar(120) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `thumbnail_file_object_id` bigint unsigned DEFAULT NULL,
  `status` enum('active','used','expired','deleted') NOT NULL DEFAULT 'active',
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote_assets_owner_status_expires` (`owner_user_id`,`status`,`expires_at`),
  KEY `idx_quote_assets_status_expires` (`status`,`expires_at`,`id`),
  KEY `idx_quote_assets_file_object` (`file_object_id`),
  KEY `idx_quote_assets_thumbnail_file_object` (`thumbnail_file_object_id`),
  CONSTRAINT `fk_quote_assets_file_object` FOREIGN KEY (`file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_assets_owner_user` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quote_assets_thumbnail_file_object` FOREIGN KEY (`thumbnail_file_object_id`) REFERENCES `file_objects` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @has_quote_asset_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND column_name = 'quote_asset_id'
);

SET @add_quote_asset_id_sql := IF(
  @has_quote_asset_id = 0,
  'ALTER TABLE quote_records ADD COLUMN quote_asset_id BIGINT UNSIGNED NULL AFTER quote_token_hash',
  'SELECT ''quote_records.quote_asset_id already exists'' AS message'
);

PREPARE add_quote_asset_id_stmt FROM @add_quote_asset_id_sql;
EXECUTE add_quote_asset_id_stmt;
DEALLOCATE PREPARE add_quote_asset_id_stmt;

SET @has_quote_records_asset_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND index_name = 'idx_quote_records_asset_created'
);

SET @add_quote_records_asset_index_sql := IF(
  @has_quote_records_asset_index = 0,
  'CREATE INDEX idx_quote_records_asset_created ON quote_records(quote_asset_id, created_at, id)',
  'SELECT ''idx_quote_records_asset_created already exists'' AS message'
);

PREPARE add_quote_records_asset_index_stmt FROM @add_quote_records_asset_index_sql;
EXECUTE add_quote_records_asset_index_stmt;
DEALLOCATE PREPARE add_quote_records_asset_index_stmt;

SET @has_quote_records_asset_fk := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'quote_records'
    AND constraint_name = 'fk_quote_records_asset'
);

SET @add_quote_records_asset_fk_sql := IF(
  @has_quote_records_asset_fk = 0,
  'ALTER TABLE quote_records ADD CONSTRAINT fk_quote_records_asset FOREIGN KEY (quote_asset_id) REFERENCES quote_assets (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_quote_records_asset already exists'' AS message'
);

PREPARE add_quote_records_asset_fk_stmt FROM @add_quote_records_asset_fk_sql;
EXECUTE add_quote_records_asset_fk_stmt;
DEALLOCATE PREPARE add_quote_records_asset_fk_stmt;
