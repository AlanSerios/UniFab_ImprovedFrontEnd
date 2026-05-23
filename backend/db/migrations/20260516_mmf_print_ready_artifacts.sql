CREATE TABLE IF NOT EXISTS `mmf_print_ready_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `mmf_object_id` int unsigned NOT NULL,
  `mmf_file_id` int unsigned DEFAULT NULL,
  `archive_entry_path` varchar(500) DEFAULT NULL,
  `archive_entry_name` varchar(255) DEFAULT NULL,
  `cached_file_url` varchar(500) NOT NULL,
  `model_snapshot_url` varchar(500) DEFAULT NULL,
  `original_file_name` varchar(255) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` int unsigned DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `source_url` varchar(500) DEFAULT NULL,
  `license_snapshot` json DEFAULT NULL,
  `source_snapshot` json DEFAULT NULL,
  `mapped_by` int unsigned DEFAULT NULL,
  `verified_by` int unsigned DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `status` enum('cached','failed','removed') NOT NULL DEFAULT 'cached',
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mmf_print_ready_files_object` (`mmf_object_id`),
  KEY `idx_mmf_print_ready_files_status` (`status`),
  KEY `fk_mmf_print_ready_files_mapped_by` (`mapped_by`),
  KEY `fk_mmf_print_ready_files_verified_by` (`verified_by`),
  CONSTRAINT `fk_mmf_print_ready_files_mapped_by` FOREIGN KEY (`mapped_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_mmf_print_ready_files_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO mmf_print_ready_files (
  mmf_object_id,
  cached_file_url,
  original_file_name,
  extension,
  source_url,
  source_snapshot,
  mapped_by,
  verified_by,
  verified_at,
  status,
  created_at,
  updated_at
)
SELECT
  d.mmf_object_id,
  ld.file_url,
  SUBSTRING_INDEX(ld.file_url, '/', -1),
  LOWER(CONCAT('.', SUBSTRING_INDEX(ld.file_url, '.', -1))),
  JSON_UNQUOTE(JSON_EXTRACT(d.mapping_metadata, '$.mmfUrl')),
  JSON_OBJECT(
    'mmfObjectId', d.mmf_object_id,
    'legacyLinkedLocalDesignId', d.linked_local_design_id,
    'legacyLocalTitle', ld.title,
    'backfilledAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')
  ),
  d.updated_by,
  d.print_ready_verified_by,
  d.print_ready_verified_at,
  'cached',
  NOW(),
  NOW()
FROM design_overrides d
JOIN local_designs ld ON ld.id = d.linked_local_design_id
LEFT JOIN mmf_print_ready_files existing
  ON existing.mmf_object_id = d.mmf_object_id
WHERE d.linked_local_design_id IS NOT NULL
  AND ld.file_url IS NOT NULL
  AND existing.id IS NULL;

UPDATE design_overrides d
JOIN mmf_print_ready_files mprf ON mprf.mmf_object_id = d.mmf_object_id
SET
  d.linked_local_design_id = NULL,
  d.mapping_status = 'mapped',
  d.mapping_metadata = JSON_SET(
    COALESCE(d.mapping_metadata, JSON_OBJECT()),
    '$.printReadyFileId',
    mprf.id,
    '$.cachedFileUrl',
    mprf.cached_file_url,
    '$.legacyLinkedLocalDesignClearedAt',
    DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ')
  )
WHERE d.linked_local_design_id IS NOT NULL;
