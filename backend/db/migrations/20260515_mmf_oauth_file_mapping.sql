CREATE TABLE IF NOT EXISTS external_integration_tokens (
  id int unsigned NOT NULL AUTO_INCREMENT,
  provider varchar(80) NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_type varchar(40) NOT NULL DEFAULT 'Bearer',
  expires_at timestamp NULL DEFAULT NULL,
  scope varchar(500) DEFAULT NULL,
  account_user_id varchar(120) DEFAULT NULL,
  connected_by int unsigned DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_integration_tokens_provider (provider),
  KEY idx_external_integration_tokens_expires_at (expires_at),
  KEY fk_external_integration_tokens_connected_by (connected_by),
  CONSTRAINT fk_external_integration_tokens_connected_by
    FOREIGN KEY (connected_by)
    REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
