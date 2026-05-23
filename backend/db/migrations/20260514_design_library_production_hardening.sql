ALTER TABLE design_overrides
  ADD COLUMN mapping_status enum('not_requested','needs_file','mapped','manual_link','failed') NOT NULL DEFAULT 'not_requested' AFTER linked_local_design_id,
  ADD COLUMN mapping_error text AFTER mapping_status,
  ADD COLUMN mapping_metadata json DEFAULT NULL AFTER mapping_error,
  ADD COLUMN print_ready_verified_at timestamp NULL DEFAULT NULL AFTER mapping_metadata,
  ADD COLUMN print_ready_verified_by int unsigned DEFAULT NULL AFTER print_ready_verified_at,
  ADD KEY idx_design_overrides_mapping_status (mapping_status),
  ADD KEY fk_design_overrides_print_ready_verified_by (print_ready_verified_by),
  ADD CONSTRAINT fk_design_overrides_print_ready_verified_by
    FOREIGN KEY (print_ready_verified_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE design_overrides
SET
  mapping_status = CASE
    WHEN is_print_ready = TRUE AND linked_local_design_id IS NOT NULL THEN 'manual_link'
    WHEN is_print_ready = TRUE AND linked_local_design_id IS NULL THEN 'needs_file'
    ELSE 'not_requested'
  END,
  mapping_metadata = CASE
    WHEN is_print_ready = TRUE THEN JSON_OBJECT(
      'backfilled', TRUE,
      'note', 'Backfilled from existing MMF override during Design Library hardening migration.'
    )
    ELSE mapping_metadata
  END
WHERE mapping_status = 'not_requested';
