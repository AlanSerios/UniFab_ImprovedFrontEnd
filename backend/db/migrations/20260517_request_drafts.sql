CREATE TABLE IF NOT EXISTS request_drafts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  draft_token CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  status ENUM('active','submitted','expired','abandoned') NOT NULL DEFAULT 'active',
  source ENUM('single_quote','cart','selected_cart') NOT NULL DEFAULT 'cart',
  cart_item_ids_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  submitted_print_request_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_drafts_token (draft_token),
  KEY idx_request_drafts_user_status_expires (user_id, status, expires_at),
  KEY idx_request_drafts_submitted_request (submitted_print_request_id),
  CONSTRAINT fk_request_drafts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_request_drafts_print_request
    FOREIGN KEY (submitted_print_request_id) REFERENCES print_requests(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
