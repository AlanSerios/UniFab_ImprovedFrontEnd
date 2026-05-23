-- Cart-based multi-object print requests.
-- Runs after 20260513_print_request_flow_hardening.sql because it extends
-- print_request_events and print_request_status_history status enums.
-- Written defensively so it can be rerun after a partially failed migration.

SET @has_quote_thumbnail_url := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND column_name = 'thumbnail_url'
);

SET @sql := IF(
  @has_quote_thumbnail_url = 0,
  'ALTER TABLE quote_records ADD COLUMN thumbnail_url VARCHAR(500) NULL AFTER file_size',
  'SELECT ''quote_records.thumbnail_url already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_requestor_name := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'requestor_name'
);

SET @sql := IF(
  @has_requestor_name = 0,
  'ALTER TABLE print_requests
    ADD COLUMN requestor_name VARCHAR(160) NULL AFTER file_size,
    ADD COLUMN contact_number VARCHAR(60) NULL AFTER requestor_name,
    ADD COLUMN college_department VARCHAR(160) NULL AFTER contact_number,
    ADD COLUMN purpose TEXT NULL AFTER college_department',
  'SELECT ''print_requests client info fields already exist'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE print_requests
  MODIFY status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NOT NULL DEFAULT 'pending_review';

ALTER TABLE print_request_events
  MODIFY from_status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NULL,
  MODIFY to_status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NULL;

ALTER TABLE print_request_status_history
  MODIFY status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected','cancelled') NOT NULL;

CREATE TABLE IF NOT EXISTS print_request_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  print_request_id INT UNSIGNED NOT NULL,
  source_type ENUM('upload','library','mmf') NOT NULL,
  design_id INT NULL,
  file_url VARCHAR(500) NULL,
  file_original_name VARCHAR(255) NULL,
  file_mime_type VARCHAR(120) NULL,
  file_size INT UNSIGNED NULL,
  thumbnail_url VARCHAR(500) NULL,
  design_snapshot JSON NULL,
  quote_token VARCHAR(64) NULL,
  quote_snapshot JSON NOT NULL,
  pricing_config_snapshot JSON NOT NULL,
  material_snapshot JSON NOT NULL,
  material VARCHAR(50) NOT NULL,
  material_color_id BIGINT UNSIGNED NULL,
  material_color_name VARCHAR(80) NULL,
  material_color_hex VARCHAR(7) NULL,
  print_quality ENUM('draft','standard','fine') NOT NULL,
  infill DECIMAL(5,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  estimated_cost DECIMAL(10,2) NOT NULL,
  confirmed_cost DECIMAL(10,2) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_print_request_items_request (print_request_id, id),
  KEY idx_print_request_items_design_id (design_id),
  KEY idx_print_request_items_source_type (source_type),
  KEY idx_print_request_items_material_color_id (material_color_id),
  CONSTRAINT fk_print_request_items_request
    FOREIGN KEY (print_request_id) REFERENCES print_requests (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_print_request_items_local_design
    FOREIGN KEY (design_id) REFERENCES local_designs (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_print_request_items_material_color
    FOREIGN KEY (material_color_id) REFERENCES material_colors (id) ON DELETE SET NULL,
  CONSTRAINT chk_print_request_items_infill CHECK (infill >= 0 AND infill <= 100),
  CONSTRAINT chk_print_request_items_quantity CHECK (quantity >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
