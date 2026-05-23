-- Server-owned cart and quote ownership workflow.
-- Keeps public quote review available while making carts authenticated and per-user.

SET @has_quote_owner_user_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND column_name = 'owner_user_id'
);

SET @sql := IF(
  @has_quote_owner_user_id = 0,
  'ALTER TABLE quote_records
    ADD COLUMN owner_user_id INT UNSIGNED NULL AFTER quote_token_hash,
    ADD KEY idx_quote_records_owner_user (owner_user_id, used_at, expires_at),
    ADD CONSTRAINT fk_quote_records_owner_user FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''quote_records.owner_user_id already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS cart_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  quote_record_id INT UNSIGNED NOT NULL,
  status ENUM('active','submitted','removed') NOT NULL DEFAULT 'active',
  submitted_at DATETIME NULL,
  removed_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_items_user_quote (user_id, quote_record_id),
  KEY idx_cart_items_user_status_created (user_id, status, created_at, id),
  KEY idx_cart_items_quote_status (quote_record_id, status),
  CONSTRAINT fk_cart_items_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cart_items_quote_record
    FOREIGN KEY (quote_record_id) REFERENCES quote_records (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
