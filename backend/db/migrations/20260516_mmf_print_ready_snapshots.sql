SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'mmf_print_ready_files'
    AND column_name = 'model_snapshot_url'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE mmf_print_ready_files ADD COLUMN model_snapshot_url varchar(500) DEFAULT NULL AFTER cached_file_url',
  'SELECT ''mmf_print_ready_files.model_snapshot_url already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
