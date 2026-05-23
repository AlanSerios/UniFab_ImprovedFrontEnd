-- Printables-inspired UniFab Design Library catalog support.

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'is_featured'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER print_ready_by',
  'SELECT ''local_designs.is_featured already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'featured_rank'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN featured_rank INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_featured',
  'SELECT ''local_designs.featured_rank already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'featured_at'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN featured_at DATETIME NULL AFTER featured_rank',
  'SELECT ''local_designs.featured_at already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'featured_by'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN featured_by INT UNSIGNED NULL AFTER featured_at',
  'SELECT ''local_designs.featured_by already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'library_note'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN library_note TEXT NULL AFTER featured_by',
  'SELECT ''local_designs.library_note already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_column := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND column_name = 'is_library_hidden'
);
SET @sql := IF(
  @has_column = 0,
  'ALTER TABLE local_designs ADD COLUMN is_library_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER library_note',
  'SELECT ''local_designs.is_library_hidden already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND index_name = 'idx_local_designs_library_sections'
);
SET @sql := IF(
  @has_index = 0,
  'ALTER TABLE local_designs ADD KEY idx_local_designs_library_sections (is_library_hidden, is_featured, is_print_ready, source_kind, featured_rank, created_at, id)',
  'SELECT ''idx_local_designs_library_sections already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'local_designs'
    AND index_name = 'fk_local_designs_featured_by'
);
SET @sql := IF(
  @has_index = 0,
  'ALTER TABLE local_designs ADD KEY fk_local_designs_featured_by (featured_by)',
  'SELECT ''fk_local_designs_featured_by index already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_constraint := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'local_designs'
    AND constraint_name = 'fk_local_designs_featured_by'
);
SET @sql := IF(
  @has_constraint = 0,
  'ALTER TABLE local_designs ADD CONSTRAINT fk_local_designs_featured_by FOREIGN KEY (featured_by) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_local_designs_featured_by constraint already exists'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS saved_designs (
  user_id INT UNSIGNED NOT NULL,
  local_design_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, local_design_id),
  KEY idx_saved_designs_design_id (local_design_id),
  KEY idx_saved_designs_user_created (user_id, created_at, local_design_id),
  CONSTRAINT fk_saved_designs_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_saved_designs_local_design
    FOREIGN KEY (local_design_id) REFERENCES local_designs (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
