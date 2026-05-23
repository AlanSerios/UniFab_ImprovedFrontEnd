SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'print_requests'
    AND INDEX_NAME = 'idx_print_requests_client_archive_status_created'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE print_requests ADD KEY idx_print_requests_client_archive_status_created (client_id, archived_at, status, created_at, id)',
  'SELECT ''idx_print_requests_client_archive_status_created exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'print_requests'
    AND INDEX_NAME = 'idx_print_requests_archive_status_source_created'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE print_requests ADD KEY idx_print_requests_archive_status_source_created (archived_at, status, source_type, created_at, id)',
  'SELECT ''idx_print_requests_archive_status_source_created exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'file_objects'
    AND INDEX_NAME = 'idx_file_objects_status_created'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE file_objects ADD KEY idx_file_objects_status_created (storage_status, created_at, id)',
  'SELECT ''idx_file_objects_status_created exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'quote_records'
    AND INDEX_NAME = 'idx_quote_records_owner_used_expires_created'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE quote_records ADD KEY idx_quote_records_owner_used_expires_created (owner_user_id, used_at, expires_at, created_at, id)',
  'SELECT ''idx_quote_records_owner_used_expires_created exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'quote_assets'
    AND INDEX_NAME = 'idx_quote_assets_owner_status_expires_id'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE quote_assets ADD KEY idx_quote_assets_owner_status_expires_id (owner_user_id, status, expires_at, id)',
  'SELECT ''idx_quote_assets_owner_status_expires_id exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND INDEX_NAME = 'idx_local_designs_public_high_traffic'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE local_designs ADD KEY idx_local_designs_public_high_traffic (source_kind, moderation_status, is_active, archived_at, deleted_at, created_at, id)',
  'SELECT ''idx_local_designs_public_high_traffic exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
