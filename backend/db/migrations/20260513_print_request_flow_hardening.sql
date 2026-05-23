-- Print Request Flow production hardening:
-- - durable payment slip metadata
-- - structured physical receipt verification metadata
-- - immutable transition/correction events for safer admin corrections

SET @has_payment_slip_generated_at := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'payment_slip_generated_at'
);

SET @add_payment_slip_metadata_sql := IF(
  @has_payment_slip_generated_at = 0,
  'ALTER TABLE print_requests
    ADD COLUMN payment_slip_generated_at DATETIME NULL AFTER payment_slip_url,
    ADD COLUMN payment_slip_generated_by INT UNSIGNED NULL AFTER payment_slip_generated_at,
    ADD KEY fk_print_requests_payment_slip_generated_by (payment_slip_generated_by),
    ADD CONSTRAINT fk_print_requests_payment_slip_generated_by
      FOREIGN KEY (payment_slip_generated_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''print_requests payment slip metadata already exists'' AS message'
);

PREPARE add_payment_slip_metadata_stmt FROM @add_payment_slip_metadata_sql;
EXECUTE add_payment_slip_metadata_stmt;
DEALLOCATE PREPARE add_payment_slip_metadata_stmt;

SET @has_receipt_reference_number := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'receipt_reference_number'
);

SET @add_receipt_verification_sql := IF(
  @has_receipt_reference_number = 0,
  'ALTER TABLE print_requests
    ADD COLUMN receipt_reference_number VARCHAR(120) NULL AFTER receipt_uploaded_at,
    ADD COLUMN receipt_verified_at DATETIME NULL AFTER receipt_reference_number,
    ADD COLUMN receipt_verified_by INT UNSIGNED NULL AFTER receipt_verified_at,
    ADD COLUMN receipt_verification_note TEXT NULL AFTER receipt_verified_by,
    ADD KEY fk_print_requests_receipt_verified_by (receipt_verified_by),
    ADD CONSTRAINT fk_print_requests_receipt_verified_by
      FOREIGN KEY (receipt_verified_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''print_requests receipt verification metadata already exists'' AS message'
);

PREPARE add_receipt_verification_stmt FROM @add_receipt_verification_sql;
EXECUTE add_receipt_verification_stmt;
DEALLOCATE PREPARE add_receipt_verification_stmt;

CREATE TABLE IF NOT EXISTS print_request_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  print_request_id INT UNSIGNED NOT NULL,
  event_type ENUM('transition','correction') NOT NULL,
  from_status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected') NULL,
  to_status ENUM('pending_review','design_in_progress','approved','payment_slip_issued','payment_verified','printing','completed','rejected') NULL,
  previous_state_snapshot JSON NULL,
  next_state_snapshot JSON NULL,
  changed_by INT UNSIGNED NOT NULL,
  changed_by_role ENUM('client','admin','system') NOT NULL,
  note TEXT NULL,
  reverted_at DATETIME NULL,
  reverted_by INT UNSIGNED NULL,
  reverted_by_event_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_print_request_events_request_created (print_request_id, created_at, id),
  KEY idx_print_request_events_type_reverted (event_type, reverted_at),
  KEY fk_print_request_events_changed_by (changed_by),
  KEY fk_print_request_events_reverted_by (reverted_by),
  KEY fk_print_request_events_reverted_by_event (reverted_by_event_id),
  CONSTRAINT fk_print_request_events_request
    FOREIGN KEY (print_request_id) REFERENCES print_requests (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_print_request_events_changed_by
    FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_print_request_events_reverted_by
    FOREIGN KEY (reverted_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_print_request_events_reverted_by_event
    FOREIGN KEY (reverted_by_event_id) REFERENCES print_request_events (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
