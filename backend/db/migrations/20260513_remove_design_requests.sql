-- Removes the retired custom design request workflow from active tables.
-- Historical quote/request snapshots remain intact as JSON for audit context.

UPDATE quote_records
SET source_type = CASE
  WHEN design_id IS NOT NULL THEN 'library'
  ELSE 'upload'
END
WHERE source_type = 'design_request';

UPDATE print_requests
SET
  source_type = CASE
    WHEN design_id IS NOT NULL THEN 'library'
    ELSE 'upload'
  END,
  archived_at = CASE
    WHEN design_id IS NULL AND archived_at IS NULL THEN NOW()
    ELSE archived_at
  END
WHERE source_type = 'design_request';

SET @has_print_request_design_request_fk := (
  SELECT COUNT(*)
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND constraint_name = 'fk_print_requests_design_request'
    AND constraint_type = 'FOREIGN KEY'
);

SET @drop_print_request_design_request_fk_sql := IF(
  @has_print_request_design_request_fk = 1,
  'ALTER TABLE print_requests DROP FOREIGN KEY fk_print_requests_design_request',
  'SELECT ''fk_print_requests_design_request already absent'' AS message'
);

PREPARE drop_print_request_design_request_fk_stmt FROM @drop_print_request_design_request_fk_sql;
EXECUTE drop_print_request_design_request_fk_stmt;
DEALLOCATE PREPARE drop_print_request_design_request_fk_stmt;

SET @has_print_request_design_request_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND index_name = 'fk_print_requests_design_request'
);

SET @drop_print_request_design_request_index_sql := IF(
  @has_print_request_design_request_index > 0,
  'ALTER TABLE print_requests DROP INDEX fk_print_requests_design_request',
  'SELECT ''fk_print_requests_design_request index already absent'' AS message'
);

PREPARE drop_print_request_design_request_index_stmt FROM @drop_print_request_design_request_index_sql;
EXECUTE drop_print_request_design_request_index_stmt;
DEALLOCATE PREPARE drop_print_request_design_request_index_stmt;

SET @has_print_request_design_request_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'design_request_id'
);

SET @drop_print_request_design_request_id_sql := IF(
  @has_print_request_design_request_id = 1,
  'ALTER TABLE print_requests DROP COLUMN design_request_id',
  'SELECT ''print_requests.design_request_id already absent'' AS message'
);

PREPARE drop_print_request_design_request_id_stmt FROM @drop_print_request_design_request_id_sql;
EXECUTE drop_print_request_design_request_id_stmt;
DEALLOCATE PREPARE drop_print_request_design_request_id_stmt;

SET @has_quote_design_request_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'quote_records'
    AND column_name = 'design_request_id'
);

SET @drop_quote_design_request_id_sql := IF(
  @has_quote_design_request_id = 1,
  'ALTER TABLE quote_records DROP COLUMN design_request_id',
  'SELECT ''quote_records.design_request_id already absent'' AS message'
);

PREPARE drop_quote_design_request_id_stmt FROM @drop_quote_design_request_id_sql;
EXECUTE drop_quote_design_request_id_stmt;
DEALLOCATE PREPARE drop_quote_design_request_id_stmt;

ALTER TABLE quote_records
  MODIFY source_type enum('upload','library','mmf') NOT NULL;

ALTER TABLE print_requests
  MODIFY source_type enum('upload','library','mmf') NOT NULL;

DROP TABLE IF EXISTS design_requests;
