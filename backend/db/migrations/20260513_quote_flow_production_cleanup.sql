-- Quote Flow production cleanup:
-- - profile dry-run validation metadata and events
-- - quote attempt diagnostics for admin readiness review

SET @has_slicer_profile_validation_status := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'slicer_profiles'
    AND column_name = 'validation_status'
);

SET @add_slicer_profile_validation_status_sql := IF(
  @has_slicer_profile_validation_status = 0,
  'ALTER TABLE slicer_profiles ADD COLUMN validation_status ENUM(''not_run'',''passed'',''failed'') NOT NULL DEFAULT ''not_run'' AFTER is_active',
  'SELECT ''slicer_profiles.validation_status already exists'' AS message'
);

PREPARE add_slicer_profile_validation_status_stmt FROM @add_slicer_profile_validation_status_sql;
EXECUTE add_slicer_profile_validation_status_stmt;
DEALLOCATE PREPARE add_slicer_profile_validation_status_stmt;

SET @has_slicer_profile_validation_message := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'slicer_profiles'
    AND column_name = 'validation_message'
);

SET @add_slicer_profile_validation_message_sql := IF(
  @has_slicer_profile_validation_message = 0,
  'ALTER TABLE slicer_profiles ADD COLUMN validation_message TEXT NULL AFTER validation_status',
  'SELECT ''slicer_profiles.validation_message already exists'' AS message'
);

PREPARE add_slicer_profile_validation_message_stmt FROM @add_slicer_profile_validation_message_sql;
EXECUTE add_slicer_profile_validation_message_stmt;
DEALLOCATE PREPARE add_slicer_profile_validation_message_stmt;

SET @has_slicer_profile_validated_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'slicer_profiles'
    AND column_name = 'validated_at'
);

SET @add_slicer_profile_validated_at_sql := IF(
  @has_slicer_profile_validated_at = 0,
  'ALTER TABLE slicer_profiles ADD COLUMN validated_at DATETIME NULL AFTER validation_message',
  'SELECT ''slicer_profiles.validated_at already exists'' AS message'
);

PREPARE add_slicer_profile_validated_at_stmt FROM @add_slicer_profile_validated_at_sql;
EXECUTE add_slicer_profile_validated_at_stmt;
DEALLOCATE PREPARE add_slicer_profile_validated_at_stmt;

CREATE TABLE IF NOT EXISTS slicer_profile_validation_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_id BIGINT UNSIGNED NULL,
  material_key VARCHAR(50) NOT NULL,
  quality ENUM('draft','standard','fine') NOT NULL,
  profile_original_name VARCHAR(255) NULL,
  profile_filename VARCHAR(255) NULL,
  status ENUM('passed','failed') NOT NULL,
  message TEXT NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_slicer_profile_validation_events_created_at (created_at),
  KEY idx_slicer_profile_validation_events_status (status),
  KEY fk_slicer_profile_validation_events_material (material_id),
  KEY fk_slicer_profile_validation_events_uploaded_by (uploaded_by),
  CONSTRAINT fk_slicer_profile_validation_events_material
    FOREIGN KEY (material_id) REFERENCES materials (id) ON DELETE SET NULL,
  CONSTRAINT fk_slicer_profile_validation_events_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS quote_attempts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_type ENUM('upload','library','mmf') NOT NULL,
  source_identifier VARCHAR(120) NULL,
  user_id INT UNSIGNED NULL,
  material VARCHAR(50) NULL,
  material_color_id BIGINT UNSIGNED NULL,
  material_color_name VARCHAR(80) NULL,
  material_color_hex VARCHAR(7) NULL,
  print_quality ENUM('draft','standard','fine') NULL,
  infill DECIMAL(5,2) NULL,
  quantity INT UNSIGNED NULL,
  file_original_name VARCHAR(255) NULL,
  status ENUM('success','failed') NOT NULL,
  error_status_code INT UNSIGNED NULL,
  error_message TEXT NULL,
  quote_record_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quote_attempts_created_at (created_at),
  KEY idx_quote_attempts_status_created_at (status, created_at),
  KEY idx_quote_attempts_source_type (source_type),
  KEY fk_quote_attempts_user (user_id),
  KEY fk_quote_attempts_quote_record (quote_record_id),
  CONSTRAINT fk_quote_attempts_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_quote_attempts_quote_record
    FOREIGN KEY (quote_record_id) REFERENCES quote_records (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
