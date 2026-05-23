import pool from "../db/db.js";

const CORE_TABLES = [
  "users",
  "quote_assets",
  "quote_records",
  "quote_attempts",
  "cart_items",
  "request_drafts",
  "print_requests",
  "print_request_items",
  "local_designs",
  "local_design_files",
  "local_design_images",
  "file_objects",
  "file_references",
  "file_events",
];

async function getTableMetrics() {
  const [rows] = await pool.query(
    `
      SELECT
        table_name,
        table_rows,
        data_length,
        index_length
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (?)
      ORDER BY table_name ASC
    `,
    [CORE_TABLES],
  );

  return rows.map((row) => ({
    tableName: row.table_name || row.TABLE_NAME,
    estimatedRows: Number(row.table_rows || row.TABLE_ROWS || 0),
    dataBytes: Number(row.data_length || row.DATA_LENGTH || 0),
    indexBytes: Number(row.index_length || row.INDEX_LENGTH || 0),
  }));
}

async function getDatabaseSize() {
  const [rows] = await pool.query(
    `
      SELECT
        COALESCE(SUM(data_length), 0) AS data_bytes,
        COALESCE(SUM(index_length), 0) AS index_bytes
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    `,
  );

  return {
    dataBytes: Number(rows[0]?.data_bytes || 0),
    indexBytes: Number(rows[0]?.index_bytes || 0),
    totalBytes: Number(rows[0]?.data_bytes || 0) + Number(rows[0]?.index_bytes || 0),
  };
}

async function getSlowQueryCount() {
  try {
    const [rows] = await pool.query("SHOW GLOBAL STATUS LIKE 'Slow_queries'");
    return Number(rows[0]?.Value || rows[0]?.value || 0);
  } catch {
    return null;
  }
}

async function getQuoteAttemptFailureRate() {
  const [rows] = await pool.query(`
    SELECT
      COUNT(*) AS total_count,
      SUM(status = 'failed') AS failed_count
    FROM quote_attempts
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  `);
  const totalCount = Number(rows[0]?.total_count || 0);
  const failedCount = Number(rows[0]?.failed_count || 0);

  return {
    windowHours: 24,
    totalCount,
    failedCount,
    failureRate: totalCount > 0 ? failedCount / totalCount : 0,
  };
}

async function getCleanupFailures() {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*)
       FROM design_storage_cleanup_runs
       WHERE status = 'failed'
         AND started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS design_failures,
      (SELECT COUNT(*)
       FROM file_objects
       WHERE storage_status = 'delete_failed') AS file_delete_failures
  `);

  return {
    windowHours: 24,
    designCleanupFailures: Number(rows[0]?.design_failures || 0),
    fileDeleteFailures: Number(rows[0]?.file_delete_failures || 0),
  };
}

async function getFileReferenceInconsistencies() {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*)
       FROM file_references fr
       LEFT JOIN file_objects fo ON fo.id = fr.file_object_id
       WHERE fo.id IS NULL) AS missing_file_objects,
      (SELECT COUNT(*)
       FROM file_references fr
       INNER JOIN file_objects fo ON fo.id = fr.file_object_id
       WHERE fr.status = 'active'
         AND fo.storage_status <> 'present') AS active_unavailable_files
  `);

  return {
    missingFileObjects: Number(rows[0]?.missing_file_objects || 0),
    activeUnavailableFiles: Number(rows[0]?.active_unavailable_files || 0),
  };
}

async function getProductionDatabaseMetrics() {
  const [
    tables,
    databaseSize,
    slowQueries,
    quoteAttempts,
    cleanupFailures,
    fileReferences,
  ] = await Promise.all([
    getTableMetrics(),
    getDatabaseSize(),
    getSlowQueryCount(),
    getQuoteAttemptFailureRate(),
    getCleanupFailures(),
    getFileReferenceInconsistencies(),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    tables,
    databaseSize,
    slowQueries,
    quoteAttempts,
    cleanupFailures,
    fileReferences,
  };
}

export { getProductionDatabaseMetrics };
