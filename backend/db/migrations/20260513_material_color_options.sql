-- Material color options for quote and print request snapshots.

CREATE TABLE IF NOT EXISTS material_colors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_id BIGINT UNSIGNED NOT NULL,
  color_name VARCHAR(80) NOT NULL,
  hex_code VARCHAR(7) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_material_colors_material_name (material_id, color_name),
  KEY idx_material_colors_material_active_order (material_id, is_active, display_order, color_name),
  CONSTRAINT fk_material_colors_material
    FOREIGN KEY (material_id) REFERENCES materials (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @has_quote_material_color_id := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND column_name = 'material_color_id'
);

SET @add_quote_material_color_sql := IF(
  @has_quote_material_color_id = 0,
  'ALTER TABLE quote_records
    ADD COLUMN material_color_id BIGINT UNSIGNED NULL AFTER material,
    ADD COLUMN material_color_name VARCHAR(80) NULL AFTER material_color_id,
    ADD COLUMN material_color_hex VARCHAR(7) NULL AFTER material_color_name,
    ADD KEY idx_quote_records_material_color_id (material_color_id),
    ADD CONSTRAINT fk_quote_records_material_color FOREIGN KEY (material_color_id) REFERENCES material_colors (id) ON DELETE SET NULL',
  'SELECT ''quote_records material color columns already exist'' AS message'
);

PREPARE add_quote_material_color_stmt FROM @add_quote_material_color_sql;
EXECUTE add_quote_material_color_stmt;
DEALLOCATE PREPARE add_quote_material_color_stmt;

SET @has_quote_attempt_material_color_id := (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'quote_attempts'
    ),
    (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'quote_attempts'
        AND column_name = 'material_color_id'
    ),
    -1
  )
);

SET @add_quote_attempt_material_color_sql := IF(
  @has_quote_attempt_material_color_id = 0,
  'ALTER TABLE quote_attempts
    ADD COLUMN material_color_id BIGINT UNSIGNED NULL AFTER material,
    ADD COLUMN material_color_name VARCHAR(80) NULL AFTER material_color_id,
    ADD COLUMN material_color_hex VARCHAR(7) NULL AFTER material_color_name',
  IF(
    @has_quote_attempt_material_color_id = -1,
    'SELECT ''quote_attempts table not present yet; quote diagnostics migration creates color columns'' AS message',
    'SELECT ''quote_attempts material color columns already exist'' AS message'
  )
);

PREPARE add_quote_attempt_material_color_stmt FROM @add_quote_attempt_material_color_sql;
EXECUTE add_quote_attempt_material_color_stmt;
DEALLOCATE PREPARE add_quote_attempt_material_color_stmt;

SET @has_print_request_material_color_id := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'material_color_id'
);

SET @add_print_request_material_color_sql := IF(
  @has_print_request_material_color_id = 0,
  'ALTER TABLE print_requests
    ADD COLUMN material_color_id BIGINT UNSIGNED NULL AFTER material,
    ADD COLUMN material_color_name VARCHAR(80) NULL AFTER material_color_id,
    ADD COLUMN material_color_hex VARCHAR(7) NULL AFTER material_color_name,
    ADD KEY idx_print_requests_material_color_id (material_color_id),
    ADD CONSTRAINT fk_print_requests_material_color FOREIGN KEY (material_color_id) REFERENCES material_colors (id) ON DELETE SET NULL',
  'SELECT ''print_requests material color columns already exist'' AS message'
);

PREPARE add_print_request_material_color_stmt FROM @add_print_request_material_color_sql;
EXECUTE add_print_request_material_color_stmt;
DEALLOCATE PREPARE add_print_request_material_color_stmt;
