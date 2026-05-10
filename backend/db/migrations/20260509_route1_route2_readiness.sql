-- Route 1/2 production-readiness fixes:
-- - store server-side Terms acceptance snapshots for print requests
-- - retire the client receipt-upload-only payment_submitted status

SET @has_terms_accepted_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'terms_accepted_at'
);

SET @add_terms_accepted_at_sql := IF(
  @has_terms_accepted_at = 0,
  'ALTER TABLE print_requests ADD COLUMN terms_accepted_at DATETIME NULL AFTER receipt_uploaded_at',
  'SELECT ''print_requests.terms_accepted_at already exists'' AS message'
);

PREPARE add_terms_accepted_at_stmt FROM @add_terms_accepted_at_sql;
EXECUTE add_terms_accepted_at_stmt;
DEALLOCATE PREPARE add_terms_accepted_at_stmt;

SET @has_terms_version := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'print_requests'
    AND column_name = 'terms_version'
);

SET @add_terms_version_sql := IF(
  @has_terms_version = 0,
  'ALTER TABLE print_requests ADD COLUMN terms_version VARCHAR(50) NULL AFTER terms_accepted_at',
  'SELECT ''print_requests.terms_version already exists'' AS message'
);

PREPARE add_terms_version_stmt FROM @add_terms_version_sql;
EXECUTE add_terms_version_stmt;
DEALLOCATE PREPARE add_terms_version_stmt;

UPDATE print_requests
SET status = 'payment_slip_issued'
WHERE status = 'payment_submitted';

UPDATE print_request_status_history
SET status = 'payment_slip_issued',
    note = COALESCE(note, 'Legacy payment_submitted status mapped to payment_slip_issued after client receipt upload was retired.')
WHERE status = 'payment_submitted';

ALTER TABLE print_requests
  MODIFY COLUMN status ENUM(
    'pending_review',
    'design_in_progress',
    'approved',
    'payment_slip_issued',
    'payment_verified',
    'printing',
    'completed',
    'rejected'
  ) NOT NULL DEFAULT 'pending_review';

ALTER TABLE print_request_status_history
  MODIFY COLUMN status ENUM(
    'pending_review',
    'design_in_progress',
    'approved',
    'payment_slip_issued',
    'payment_verified',
    'printing',
    'completed',
    'rejected'
  ) NOT NULL;
