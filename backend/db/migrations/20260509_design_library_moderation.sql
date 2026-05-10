ALTER TABLE local_designs
  ADD COLUMN source_kind enum('lab','community') NOT NULL DEFAULT 'lab' AFTER id,
  ADD COLUMN moderation_status enum(
    'draft',
    'screening',
    'auto_approved',
    'needs_admin_review',
    'auto_rejected',
    'admin_approved',
    'admin_rejected',
    'hidden'
  ) NOT NULL DEFAULT 'admin_approved' AFTER category_id,
  ADD COLUMN is_print_ready tinyint(1) NOT NULL DEFAULT '1' AFTER moderation_status,
  ADD COLUMN ownership_confirmed tinyint(1) NOT NULL DEFAULT '0' AFTER license_type,
  ADD COLUMN policy_acknowledged tinyint(1) NOT NULL DEFAULT '0' AFTER ownership_confirmed,
  ADD COLUMN moderation_flags json DEFAULT NULL AFTER is_active,
  ADD COLUMN moderation_summary text DEFAULT NULL AFTER moderation_flags,
  ADD COLUMN moderation_feedback text DEFAULT NULL AFTER moderation_summary,
  ADD COLUMN moderation_decision_source enum('none','rules','ai','render','admin') NOT NULL DEFAULT 'none' AFTER moderation_feedback,
  ADD COLUMN published_at datetime DEFAULT NULL AFTER moderation_decision_source,
  ADD COLUMN reviewed_at datetime DEFAULT NULL AFTER published_at,
  ADD COLUMN reviewed_by int unsigned DEFAULT NULL AFTER reviewed_at,
  ADD COLUMN print_ready_at datetime DEFAULT NULL AFTER reviewed_by,
  ADD COLUMN print_ready_by int unsigned DEFAULT NULL AFTER print_ready_at,
  ADD KEY idx_local_designs_public_library (
    source_kind,
    moderation_status,
    is_active,
    archived_at,
    created_at,
    id
  ),
  ADD KEY idx_local_designs_owner_status (
    uploaded_by,
    moderation_status,
    created_at,
    id
  ),
  ADD KEY fk_local_designs_reviewed_by (reviewed_by),
  ADD KEY fk_local_designs_print_ready_by (print_ready_by),
  ADD CONSTRAINT fk_local_designs_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_local_designs_print_ready_by
    FOREIGN KEY (print_ready_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE local_design_audit_events (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  local_design_id int NOT NULL,
  actor_id int unsigned DEFAULT NULL,
  actor_type enum('system','user','admin') NOT NULL DEFAULT 'system',
  event_type varchar(80) NOT NULL,
  from_status varchar(80) DEFAULT NULL,
  to_status varchar(80) DEFAULT NULL,
  summary text DEFAULT NULL,
  metadata json DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_design_audit_design_created (local_design_id, created_at, id),
  KEY idx_design_audit_actor_created (actor_id, created_at, id),
  CONSTRAINT fk_design_audit_design
    FOREIGN KEY (local_design_id) REFERENCES local_designs (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_design_audit_actor
    FOREIGN KEY (actor_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE local_design_moderation_renders (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  local_design_id int NOT NULL,
  angle_label varchar(80) NOT NULL,
  image_url varchar(1000) DEFAULT NULL,
  moderation_status enum('pending','passed','flagged','failed') NOT NULL DEFAULT 'pending',
  moderation_flags json DEFAULT NULL,
  moderation_summary text DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_design_renders_design_created (local_design_id, created_at, id),
  CONSTRAINT fk_design_renders_design
    FOREIGN KEY (local_design_id) REFERENCES local_designs (id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
