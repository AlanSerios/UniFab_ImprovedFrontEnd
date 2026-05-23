import pool from "../db/db.js";

const DEFAULT_LIMIT = 5000;

function normalizePositiveInteger(value, fallback, max = 100000) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

async function countQuery(sql, params) {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

async function deleteQuery({ dryRun, sql, countSql, params }) {
  if (dryRun) {
    return countQuery(countSql, params);
  }

  const [result] = await pool.query(sql, params);
  return result.affectedRows;
}

async function cleanupDatabaseRetention({
  dryRun = true,
  limit = DEFAULT_LIMIT,
  fileAccessEventRetentionDays = Number(
    process.env.FILE_ACCESS_EVENT_RETENTION_DAYS || 180,
  ),
  moderationRetentionDays = Number(
    process.env.DESIGN_MODERATION_RETENTION_DAYS || 180,
  ),
  designAuditRetentionDays = Number(
    process.env.DESIGN_AUDIT_EVENT_RETENTION_DAYS || 365,
  ),
  printRequestEventRetentionDays = Number(
    process.env.PRINT_REQUEST_EVENT_RETENTION_DAYS || 365,
  ),
} = {}) {
  const normalizedLimit = normalizePositiveInteger(limit, DEFAULT_LIMIT);
  const normalizedFileAccessDays = normalizePositiveInteger(
    fileAccessEventRetentionDays,
    180,
    3650,
  );
  const normalizedModerationDays = normalizePositiveInteger(
    moderationRetentionDays,
    180,
    3650,
  );
  const normalizedDesignAuditDays = normalizePositiveInteger(
    designAuditRetentionDays,
    365,
    3650,
  );
  const normalizedPrintRequestDays = normalizePositiveInteger(
    printRequestEventRetentionDays,
    365,
    3650,
  );
  const result = {
    dryRun,
    limit: normalizedLimit,
    retentionDays: {
      fileAccessEvents: normalizedFileAccessDays,
      designModeration: normalizedModerationDays,
      designAudit: normalizedDesignAuditDays,
      printRequestEvents: normalizedPrintRequestDays,
    },
    fileEvents: 0,
    moderationRunItems: 0,
    moderationRuns: 0,
    localDesignAuditEvents: 0,
    printRequestEvents: 0,
    printRequestStatusHistory: 0,
  };

  result.fileEvents = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM file_events
      WHERE event_type IN ('access_granted', 'access_denied')
        AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      LIMIT ?
    `,
    sql: `
      DELETE FROM file_events
      WHERE event_type IN ('access_granted', 'access_denied')
        AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      LIMIT ?
    `,
    params: [normalizedFileAccessDays, normalizedLimit],
  });

  result.moderationRunItems = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM local_design_moderation_run_items ldmri
      INNER JOIN local_design_moderation_runs ldmr ON ldmr.id = ldmri.run_id
      LEFT JOIN local_designs ld ON ld.latest_moderation_run_id = ldmr.id
      WHERE ldmr.status IN ('completed', 'failed')
        AND ldmr.completed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND ld.id IS NULL
      LIMIT ?
    `,
    sql: `
      DELETE FROM local_design_moderation_run_items
      WHERE id IN (
        SELECT id FROM (
          SELECT ldmri.id
          FROM local_design_moderation_run_items ldmri
          INNER JOIN local_design_moderation_runs ldmr ON ldmr.id = ldmri.run_id
          LEFT JOIN local_designs ld ON ld.latest_moderation_run_id = ldmr.id
          WHERE ldmr.status IN ('completed', 'failed')
            AND ldmr.completed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            AND ld.id IS NULL
          LIMIT ?
        ) candidates
      )
    `,
    params: [normalizedModerationDays, normalizedLimit],
  });

  result.moderationRuns = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM local_design_moderation_runs ldmr
      LEFT JOIN local_designs ld ON ld.latest_moderation_run_id = ldmr.id
      LEFT JOIN local_design_moderation_run_items ldmri ON ldmri.run_id = ldmr.id
      WHERE ldmr.status IN ('completed', 'failed')
        AND ldmr.completed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND ld.id IS NULL
        AND ldmri.id IS NULL
      LIMIT ?
    `,
    sql: `
      DELETE FROM local_design_moderation_runs
      WHERE id IN (
        SELECT id FROM (
          SELECT ldmr.id
          FROM local_design_moderation_runs ldmr
          LEFT JOIN local_designs ld ON ld.latest_moderation_run_id = ldmr.id
          LEFT JOIN local_design_moderation_run_items ldmri ON ldmri.run_id = ldmr.id
          WHERE ldmr.status IN ('completed', 'failed')
            AND ldmr.completed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            AND ld.id IS NULL
            AND ldmri.id IS NULL
          LIMIT ?
        ) candidates
      )
    `,
    params: [normalizedModerationDays, normalizedLimit],
  });

  result.localDesignAuditEvents = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM local_design_audit_events
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      LIMIT ?
    `,
    sql: `
      DELETE FROM local_design_audit_events
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
      LIMIT ?
    `,
    params: [normalizedDesignAuditDays, normalizedLimit],
  });

  result.printRequestEvents = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM print_request_events pre
      INNER JOIN print_requests pr ON pr.id = pre.print_request_id
      WHERE pre.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND pr.status IN ('completed', 'rejected', 'cancelled')
      LIMIT ?
    `,
    sql: `
      DELETE FROM print_request_events
      WHERE id IN (
        SELECT id FROM (
          SELECT pre.id
          FROM print_request_events pre
          INNER JOIN print_requests pr ON pr.id = pre.print_request_id
          WHERE pre.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            AND pr.status IN ('completed', 'rejected', 'cancelled')
          LIMIT ?
        ) candidates
      )
    `,
    params: [normalizedPrintRequestDays, normalizedLimit],
  });

  result.printRequestStatusHistory = await deleteQuery({
    dryRun,
    countSql: `
      SELECT COUNT(*) AS count
      FROM print_request_status_history prsh
      INNER JOIN print_requests pr ON pr.id = prsh.print_request_id
      WHERE prsh.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND pr.status IN ('completed', 'rejected', 'cancelled')
      LIMIT ?
    `,
    sql: `
      DELETE FROM print_request_status_history
      WHERE id IN (
        SELECT id FROM (
          SELECT prsh.id
          FROM print_request_status_history prsh
          INNER JOIN print_requests pr ON pr.id = prsh.print_request_id
          WHERE prsh.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            AND pr.status IN ('completed', 'rejected', 'cancelled')
          LIMIT ?
        ) candidates
      )
    `,
    params: [normalizedPrintRequestDays, normalizedLimit],
  });

  return result;
}

function startDatabaseRetentionCleanupJob({
  intervalMinutes = Number(process.env.DB_RETENTION_CLEANUP_INTERVAL_MINUTES || 240),
  limit = Number(process.env.DB_RETENTION_CLEANUP_LIMIT || DEFAULT_LIMIT),
} = {}) {
  const normalizedIntervalMinutes = Number(intervalMinutes);

  if (
    !Number.isFinite(normalizedIntervalMinutes) ||
    normalizedIntervalMinutes <= 0
  ) {
    return null;
  }

  let isRunning = false;

  const runCleanup = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const result = await cleanupDatabaseRetention({
        dryRun: false,
        limit,
      });
      const deletedCount = Object.entries(result)
        .filter(([, value]) => typeof value === "number")
        .reduce((sum, [, value]) => sum + value, 0);

      if (deletedCount > 0) {
        console.log("Database retention cleanup result:", result);
      }
    } catch (error) {
      console.error("Database retention cleanup failed:", error);
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(
    runCleanup,
    normalizedIntervalMinutes * 60 * 1000,
  );
  timer.unref?.();
  return timer;
}

export { cleanupDatabaseRetention, startDatabaseRetentionCleanupJob };
