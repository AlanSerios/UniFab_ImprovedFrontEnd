CREATE TABLE IF NOT EXISTS admin_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id INT UNSIGNED NULL,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  summary VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_events_created (created_at, id),
  KEY idx_admin_audit_events_actor_created (actor_id, created_at, id),
  KEY idx_admin_audit_events_entity (entity_type, entity_id, created_at, id),
  CONSTRAINT fk_admin_audit_events_actor
    FOREIGN KEY (actor_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS site_content (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_key VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NULL,
  metadata JSON NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_content_key (content_key),
  KEY idx_site_content_updated_by (updated_by),
  CONSTRAINT fk_site_content_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO site_content (content_key, title, body, metadata)
VALUES
  (
    'homepage_intro',
    'Homepage Intro',
    'USTP-CDO Fabrication Laboratory provides campus 3D printing support through quotes, request review, and managed print workflows.',
    JSON_OBJECT('placement', 'home')
  ),
  (
    'lab_hours',
    'Lab Hours',
    'Monday to Friday, 8:00 AM to 5:00 PM. Service availability may change during holidays and maintenance periods.',
    JSON_OBJECT('placement', 'service')
  ),
  (
    'contact_details',
    'Contact Details',
    'Visit the FabLab office for receipt verification and print pickup coordination.',
    JSON_OBJECT('placement', 'contact')
  ),
  (
    'service_notice',
    'Service Notice',
    'Print requests are reviewed by lab staff before payment slip issuance.',
    JSON_OBJECT('placement', 'notice', 'isActive', true)
  )
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  body = VALUES(body),
  metadata = VALUES(metadata);

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'local_designs'
    AND INDEX_NAME = 'idx_local_designs_admin_queue'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE local_designs ADD KEY idx_local_designs_admin_queue (archived_at, source_kind, moderation_status, created_at, id)',
  'SELECT ''idx_local_designs_admin_queue exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'idx_users_admin_verified_created'
);
SET @sql := IF(
  @has_idx = 0,
  'ALTER TABLE users ADD KEY idx_users_admin_verified_created (is_admin, is_email_verified, created_at, id)',
  'SELECT ''idx_users_admin_verified_created exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
