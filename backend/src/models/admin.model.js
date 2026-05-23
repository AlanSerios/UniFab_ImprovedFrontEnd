import pool from "../db/db.js";

function normalizeLimit(value, fallback = 20, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizePage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

async function createAdminAuditEvent(
  {
    actorId = null,
    eventType,
    entityType,
    entityId = null,
    summary = null,
    metadata = null,
  },
  connection = null,
) {
  const executor = connection || pool;
  const [result] = await executor.query(
    `
      INSERT INTO admin_audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        summary,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      actorId,
      eventType,
      entityType,
      entityId === null ? null : String(entityId),
      summary,
      serializeJson(metadata),
    ],
  );

  return result.insertId;
}

async function listAdminAuditEvents({ page, limit, entityType, actorId } = {}) {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit, 25, 100);
  const offset = (normalizedPage - 1) * normalizedLimit;
  const where = [];
  const params = [];

  if (entityType) {
    where.push("aae.entity_type = ?");
    params.push(entityType);
  }

  if (actorId) {
    where.push("aae.actor_id = ?");
    params.push(actorId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[countRows], [rows]] = await Promise.all([
    pool.query(
      `
        SELECT COUNT(*) AS total_count
        FROM admin_audit_events aae
        ${whereSql}
      `,
      params,
    ),
    pool.query(
      `
        SELECT
          aae.id,
          aae.actor_id,
          aae.event_type,
          aae.entity_type,
          aae.entity_id,
          aae.summary,
          aae.metadata,
          aae.created_at,
          u.email AS actor_email,
          u.first_name AS actor_first_name,
          u.last_name AS actor_last_name
        FROM admin_audit_events aae
        LEFT JOIN users u ON u.id = aae.actor_id
        ${whereSql}
        ORDER BY aae.created_at DESC, aae.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, normalizedLimit, offset],
    ),
  ]);

  return {
    rows,
    page: normalizedPage,
    limit: normalizedLimit,
    totalCount: Number(countRows[0]?.total_count || 0),
  };
}

async function listAdminUsers({ page, limit, search, role, verified } = {}) {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit, 25, 100);
  const offset = (normalizedPage - 1) * normalizedLimit;
  const where = [];
  const params = [];

  if (search) {
    where.push(
      "(LOWER(email) LIKE ? OR LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)",
    );
    const pattern = `%${String(search).trim().toLowerCase()}%`;
    params.push(pattern, pattern, pattern);
  }

  if (role === "admin") {
    where.push("is_admin = TRUE");
  } else if (role === "client") {
    where.push("is_admin = FALSE");
  }

  if (verified === "true") {
    where.push("is_email_verified = TRUE");
  } else if (verified === "false") {
    where.push("is_email_verified = FALSE");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[countRows], [rows], [roleRows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total_count FROM users ${whereSql}`, params),
    pool.query(
      `
        SELECT
          id,
          first_name,
          last_name,
          email,
          user_type,
          is_admin,
          is_email_verified,
          created_at,
          updated_at
        FROM users
        ${whereSql}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, normalizedLimit, offset],
    ),
    pool.query(
      `
        SELECT
          SUM(is_admin = TRUE) AS admin_count,
          SUM(is_admin = FALSE) AS client_count,
          SUM(is_email_verified = TRUE) AS verified_count,
          SUM(is_email_verified = FALSE) AS unverified_count
        FROM users
      `,
    ),
  ]);

  return {
    rows,
    counts: {
      admins: Number(roleRows[0]?.admin_count || 0),
      clients: Number(roleRows[0]?.client_count || 0),
      verified: Number(roleRows[0]?.verified_count || 0),
      unverified: Number(roleRows[0]?.unverified_count || 0),
    },
    page: normalizedPage,
    limit: normalizedLimit,
    totalCount: Number(countRows[0]?.total_count || 0),
  };
}

async function countAdminUsers(connection = null) {
  const executor = connection || pool;
  const [rows] = await executor.query(
    "SELECT COUNT(*) AS count FROM users WHERE is_admin = TRUE",
  );
  return Number(rows[0]?.count || 0);
}

async function getAdminUserById(userId, connection = null) {
  const executor = connection || pool;
  const [rows] = await executor.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        user_type,
        is_admin,
        is_email_verified,
        created_at,
        updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId],
  );
  return rows[0] || null;
}

async function updateAdminUserFlags(
  { userId, isAdmin, isEmailVerified },
  connection = null,
) {
  const executor = connection || pool;
  const [result] = await executor.query(
    `
      UPDATE users
      SET
        is_admin = COALESCE(?, is_admin),
        is_email_verified = COALESCE(?, is_email_verified)
      WHERE id = ?
    `,
    [
      isAdmin === undefined ? null : Boolean(isAdmin),
      isEmailVerified === undefined ? null : Boolean(isEmailVerified),
      userId,
    ],
  );

  if (result.affectedRows === 0) return null;
  return getAdminUserById(userId, connection);
}

async function listSiteContent() {
  const [rows] = await pool.query(
    `
      SELECT
        sc.id,
        sc.content_key,
        sc.title,
        sc.body,
        sc.metadata,
        sc.updated_by,
        sc.created_at,
        sc.updated_at,
        u.email AS updated_by_email
      FROM site_content sc
      LEFT JOIN users u ON u.id = sc.updated_by
      ORDER BY sc.content_key ASC
    `,
  );

  return rows;
}

async function updateSiteContentItem(
  { contentKey, title, body, metadata, updatedBy },
  connection = null,
) {
  const executor = connection || pool;
  await executor.query(
    `
      INSERT INTO site_content (
        content_key,
        title,
        body,
        metadata,
        updated_by
      )
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        body = VALUES(body),
        metadata = VALUES(metadata),
        updated_by = VALUES(updated_by)
    `,
    [contentKey, title, body, serializeJson(metadata), updatedBy],
  );

  const [rows] = await executor.query(
    `
      SELECT
        id,
        content_key,
        title,
        body,
        metadata,
        updated_by,
        created_at,
        updated_at
      FROM site_content
      WHERE content_key = ?
      LIMIT 1
    `,
    [contentKey],
  );

  return rows[0] || null;
}

async function getAdminDashboardMetrics() {
  const [
    [requestRows],
    [communityRows],
    [quoteRows],
    [fileRows],
    [mmfRows],
    [readinessRows],
    [userRows],
  ] = await Promise.all([
    pool.query(`
      SELECT status, COUNT(*) AS count
      FROM print_requests
      WHERE archived_at IS NULL
      GROUP BY status
    `),
    pool.query(`
      SELECT moderation_status AS status, COUNT(*) AS count
      FROM local_designs
      WHERE source_kind = 'community'
        AND archived_at IS NULL
        AND deleted_at IS NULL
      GROUP BY moderation_status
    `),
    pool.query(`
      SELECT
        COUNT(*) AS total_count,
        SUM(status = 'failed') AS failed_count
      FROM quote_attempts
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `),
    pool.query(`
      SELECT
        SUM(storage_status = 'missing') AS missing_count,
        SUM(storage_status = 'delete_failed') AS delete_failed_count,
        SUM(storage_status = 'delete_pending') AS delete_pending_count
      FROM file_objects
    `),
    pool.query(`
      SELECT
        SUM(mapping_status = 'failed') AS failed_count,
        SUM(
          is_print_ready = TRUE
          AND linked_local_design_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM mmf_print_ready_files mprf
            WHERE mprf.mmf_object_id = design_overrides.mmf_object_id
              AND mprf.status = 'cached'
          )
        ) AS needs_file_count,
        SUM(is_print_ready = TRUE) AS print_ready_count
      FROM design_overrides
    `),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM materials WHERE is_active = TRUE) AS active_materials,
        (SELECT COUNT(*) FROM slicer_profiles WHERE is_active = TRUE AND validation_status = 'passed') AS active_valid_profiles,
        (SELECT COUNT(*) FROM slicer_profiles WHERE validation_status = 'failed') AS failed_profiles
    `),
    pool.query(`
      SELECT
        COUNT(*) AS total_count,
        SUM(is_admin = TRUE) AS admin_count,
        SUM(is_email_verified = FALSE) AS unverified_count
      FROM users
    `),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    printRequests: requestRows,
    communityDesigns: communityRows,
    quoteAttempts24h: {
      totalCount: Number(quoteRows[0]?.total_count || 0),
      failedCount: Number(quoteRows[0]?.failed_count || 0),
    },
    files: {
      missingCount: Number(fileRows[0]?.missing_count || 0),
      deleteFailedCount: Number(fileRows[0]?.delete_failed_count || 0),
      deletePendingCount: Number(fileRows[0]?.delete_pending_count || 0),
    },
    mmf: {
      failedCount: Number(mmfRows[0]?.failed_count || 0),
      needsFileCount: Number(mmfRows[0]?.needs_file_count || 0),
      printReadyCount: Number(mmfRows[0]?.print_ready_count || 0),
    },
    readiness: {
      activeMaterials: Number(readinessRows[0]?.active_materials || 0),
      activeValidProfiles: Number(readinessRows[0]?.active_valid_profiles || 0),
      failedProfiles: Number(readinessRows[0]?.failed_profiles || 0),
    },
    users: {
      totalCount: Number(userRows[0]?.total_count || 0),
      adminCount: Number(userRows[0]?.admin_count || 0),
      unverifiedCount: Number(userRows[0]?.unverified_count || 0),
    },
  };
}

export {
  countAdminUsers,
  createAdminAuditEvent,
  getAdminDashboardMetrics,
  getAdminUserById,
  listAdminAuditEvents,
  listAdminUsers,
  listSiteContent,
  updateAdminUserFlags,
  updateSiteContentItem,
};
