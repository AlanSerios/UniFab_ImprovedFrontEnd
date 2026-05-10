import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

const LOCAL_DESIGN_SELECT = `
  ld.id,
  ld.source_kind,
  ld.moderation_status,
  ld.is_print_ready,
  ld.ownership_confirmed,
  ld.policy_acknowledged,
  ld.moderation_flags,
  ld.moderation_summary,
  ld.moderation_feedback,
  ld.moderation_decision_source,
  ld.published_at,
  ld.reviewed_at,
  ld.reviewed_by,
  ld.print_ready_at,
  ld.print_ready_by,
  ld.title,
  ld.description,
  ld.thumbnail_url,
  ld.file_url,
  ld.material,
  ld.dimensions,
  ld.license_type,
  ld.category_id,
  dc.name AS category_name,
  dc.slug AS category_slug,
  dc.description AS category_description,
  ld.is_active,
  ld.uploaded_by,
  ld.archived_at,
  ld.archived_by,
  ld.created_at,
  ld.updated_at
`;

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeName(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
}

async function attachTagsToLocalDesigns(localDesigns, connection = null) {
  if (!Array.isArray(localDesigns) || localDesigns.length === 0) {
    return localDesigns;
  }

  const executor = getExecutor(connection);
  const designIds = localDesigns.map((item) => item.id);

  const [tagRows] = await executor.query(
    `
      SELECT
        ldt.local_design_id,
        dt.id,
        dt.name,
        dt.slug
      FROM local_design_tags ldt
      INNER JOIN design_tags dt ON dt.id = ldt.tag_id
      WHERE ldt.local_design_id IN (?)
        AND dt.is_active = TRUE
      ORDER BY dt.name ASC
    `,
    [designIds],
  );

  const tagsByDesignId = new Map();

  for (const tagRow of tagRows) {
    const currentTags = tagsByDesignId.get(tagRow.local_design_id) || [];
    currentTags.push({
      id: tagRow.id,
      name: tagRow.name,
      slug: tagRow.slug,
    });
    tagsByDesignId.set(tagRow.local_design_id, currentTags);
  }

  return localDesigns.map((item) => ({
    ...item,
    tags: tagsByDesignId.get(item.id) || [],
  }));
}

async function getLocalDesignRows(sql, params = [], connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(sql, params);
  return attachTagsToLocalDesigns(rows, connection);
}

async function getActiveLocalDesigns() {
  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ld.is_active = TRUE AND ld.archived_at IS NULL AND ld.moderation_status IN ('auto_approved', 'admin_approved')
    ORDER BY ld.created_at DESC
  `;

  return getLocalDesignRows(sql);
}

async function getAllLocalDesignsForAdmin({
  archived = false,
  sourceKind = null,
  statuses = [],
} = {}) {
  const params = [];
  const where = [`ld.archived_at ${archived ? "IS NOT NULL" : "IS NULL"}`];

  if (sourceKind) {
    where.push("ld.source_kind = ?");
    params.push(sourceKind);
  }

  if (Array.isArray(statuses) && statuses.length > 0) {
    where.push(
      `ld.moderation_status IN (${statuses.map(() => "?").join(", ")})`,
    );
    params.push(...statuses);
  }

  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ${where.join(" AND ")}
    ORDER BY ld.created_at DESC
  `;

  return getLocalDesignRows(sql, params);
}

async function getLocalDesignsByOwner(ownerId, { status = null } = {}) {
  const params = [ownerId];
  let statusSql = "";

  if (status) {
    statusSql = "AND ld.moderation_status = ?";
    params.push(status);
  }

  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ld.uploaded_by = ?
      AND ld.source_kind = 'community'
      AND ld.archived_at IS NULL
      ${statusSql}
    ORDER BY ld.updated_at DESC, ld.id DESC
  `;

  return getLocalDesignRows(sql, params);
}

async function getLocalDesignById(designId, connection = null) {
  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ld.id = ? AND ld.is_active = TRUE AND ld.archived_at IS NULL
    LIMIT 1
  `;

  const rows = await getLocalDesignRows(sql, [designId], connection);
  return rows[0] || null;
}

async function getLocalDesignByIdForAdmin(designId, connection = null) {
  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ld.id = ?
    LIMIT 1
  `;

  const rows = await getLocalDesignRows(sql, [designId], connection);
  return rows[0] || null;
}

async function createLocalDesign(
  {
    title,
    description,
    thumbnailUrl,
    fileUrl,
    material,
    dimensions,
    licenseType,
    categoryId,
    uploadedBy,
    isActive = true,
    sourceKind = "lab",
    moderationStatus = "admin_approved",
    isPrintReady = true,
    ownershipConfirmed = false,
    policyAcknowledged = false,
    moderationFlags = null,
    moderationSummary = null,
    moderationFeedback = null,
    moderationDecisionSource = "none",
    publishedAt = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);

  const sql = `
    INSERT INTO local_designs (
      source_kind,
      title,
      description,
      thumbnail_url,
      file_url,
      material,
      dimensions,
      license_type,
      category_id,
      moderation_status,
      is_print_ready,
      ownership_confirmed,
      policy_acknowledged,
      is_active,
      moderation_flags,
      moderation_summary,
      moderation_feedback,
      moderation_decision_source,
      published_at,
      uploaded_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    sourceKind,
    title,
    description,
    thumbnailUrl,
    fileUrl,
    material,
    dimensions,
    licenseType,
    categoryId ?? null,
    moderationStatus,
    isPrintReady,
    ownershipConfirmed,
    policyAcknowledged,
    isActive,
    moderationFlags ? JSON.stringify(moderationFlags) : null,
    moderationSummary,
    moderationFeedback,
    moderationDecisionSource,
    publishedAt,
    uploadedBy,
  ]);

  return getLocalDesignByIdForAdmin(result.insertId, connection);
}

async function updateLocalDesignById(designId, payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE local_designs
    SET
      title = ?,
      description = ?,
      thumbnail_url = ?,
      file_url = ?,
      material = ?,
      dimensions = ?,
      license_type = ?,
      category_id = ?,
      is_active = ?
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [
    payload.title,
    payload.description,
    payload.thumbnailUrl,
    payload.fileUrl,
    payload.material,
    payload.dimensions,
    payload.licenseType,
    payload.categoryId ?? null,
    payload.isActive,
    designId,
  ]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId);
}

async function updateLocalDesignModerationState(
  designId,
  {
    moderationStatus,
    isActive,
    isPrintReady,
    moderationFlags = null,
    moderationSummary = null,
    moderationFeedback = null,
    moderationDecisionSource = "none",
    reviewedBy = null,
    publishedAt = null,
    reviewedAt = null,
    printReadyAt = null,
    printReadyBy = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);

  const [result] = await executor.query(
    `
      UPDATE local_designs
      SET
        moderation_status = ?,
        is_active = ?,
        is_print_ready = ?,
        moderation_flags = ?,
        moderation_summary = ?,
        moderation_feedback = ?,
        moderation_decision_source = ?,
        reviewed_by = ?,
        published_at = COALESCE(?, published_at),
        reviewed_at = ?,
        print_ready_at = ?,
        print_ready_by = ?
      WHERE id = ?
    `,
    [
      moderationStatus,
      isActive,
      isPrintReady,
      moderationFlags ? JSON.stringify(moderationFlags) : null,
      moderationSummary,
      moderationFeedback,
      moderationDecisionSource,
      reviewedBy,
      publishedAt,
      reviewedAt,
      printReadyAt,
      printReadyBy,
      designId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId, connection);
}

async function deactivateLocalDesignById(designId) {
  const sql = `
    UPDATE local_designs
    SET is_active = FALSE
    WHERE id = ?
  `;

  const [result] = await pool.query(sql, [designId]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId);
}

async function archiveLocalDesignById(designId, archivedBy) {
  const sql = `
    UPDATE local_designs
    SET
      archived_at = NOW(),
      archived_by = ?
    WHERE id = ? AND archived_at IS NULL
  `;

  const [result] = await pool.query(sql, [archivedBy, designId]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId);
}

async function countLocalDesignReferences(designId) {
  const printRequestSql = `
    SELECT COUNT(*) AS total_count
    FROM print_requests
    WHERE design_id = ?
  `;

  const designRequestSql = `
    SELECT COUNT(*) AS total_count
    FROM design_requests
    WHERE result_design_id = ?
  `;

  const [[printRequestRows], [designRequestRows]] = await Promise.all([
    pool.query(printRequestSql, [designId]),
    pool.query(designRequestSql, [designId]),
  ]);

  return {
    printRequestCount: Number(printRequestRows[0]?.total_count || 0),
    designRequestCount: Number(designRequestRows[0]?.total_count || 0),
  };
}

async function listDesignCategories({ activeOnly = true } = {}) {
  const whereSql = activeOnly ? "WHERE is_active = TRUE" : "";
  const [rows] = await pool.query(
    `
      SELECT
        id,
        name,
        slug,
        description,
        is_active,
        created_at,
        updated_at
      FROM design_categories
      ${whereSql}
      ORDER BY name ASC
    `,
  );

  return rows;
}

async function listDesignTags({ activeOnly = true } = {}) {
  const whereSql = activeOnly ? "WHERE is_active = TRUE" : "";
  const [rows] = await pool.query(
    `
      SELECT
        id,
        name,
        slug,
        is_active,
        created_at,
        updated_at
      FROM design_tags
      ${whereSql}
      ORDER BY name ASC
    `,
  );

  return rows;
}

async function getDesignCategoryById(categoryId, connection = null) {
  if (!categoryId) {
    return null;
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT id, name, slug, description, is_active, created_at, updated_at
      FROM design_categories
      WHERE id = ?
      LIMIT 1
    `,
    [categoryId],
  );

  return rows[0] || null;
}

async function upsertDesignCategoryByName({
  name,
  description = null,
  userId = null,
  connection = null,
}) {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return null;
  }

  const executor = getExecutor(connection);
  const slug = toSlug(normalizedName);

  await executor.query(
    `
      INSERT INTO design_categories (
        name,
        slug,
        description,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, ?, TRUE, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = COALESCE(VALUES(description), description),
        is_active = TRUE,
        updated_by = VALUES(updated_by)
    `,
    [normalizedName, slug, description, userId, userId],
  );

  const [rows] = await executor.query(
    `
      SELECT id, name, slug, description, is_active, created_at, updated_at
      FROM design_categories
      WHERE slug = ?
      LIMIT 1
    `,
    [slug],
  );

  return rows[0] || null;
}

async function upsertDesignTagByName({
  name,
  userId = null,
  connection = null,
}) {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return null;
  }

  const executor = getExecutor(connection);
  const slug = toSlug(normalizedName);

  await executor.query(
    `
      INSERT INTO design_tags (
        name,
        slug,
        is_active,
        created_by,
        updated_by
      )
      VALUES (?, ?, TRUE, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        is_active = TRUE,
        updated_by = VALUES(updated_by)
    `,
    [normalizedName, slug, userId, userId],
  );

  const [rows] = await executor.query(
    `
      SELECT id, name, slug, is_active, created_at, updated_at
      FROM design_tags
      WHERE slug = ?
      LIMIT 1
    `,
    [slug],
  );

  return rows[0] || null;
}

async function replaceLocalDesignTags({
  localDesignId,
  tagIds = [],
  connection = null,
}) {
  const executor = getExecutor(connection);
  const uniqueTagIds = [...new Set(tagIds.map(Number).filter(Boolean))];

  await executor.query(
    "DELETE FROM local_design_tags WHERE local_design_id = ?",
    [localDesignId],
  );

  if (uniqueTagIds.length === 0) {
    return [];
  }

  await executor.query(
    `
      INSERT INTO local_design_tags (local_design_id, tag_id)
      VALUES ?
    `,
    [uniqueTagIds.map((tagId) => [localDesignId, tagId])],
  );

  const [rows] = await executor.query(
    `
      SELECT dt.id, dt.name, dt.slug, dt.is_active, dt.created_at, dt.updated_at
      FROM local_design_tags ldt
      INNER JOIN design_tags dt ON dt.id = ldt.tag_id
      WHERE ldt.local_design_id = ?
      ORDER BY dt.name ASC
    `,
    [localDesignId],
  );

  return rows;
}

async function deleteLocalDesignById(designId) {
  const sql = `
    DELETE FROM local_designs
    WHERE id = ?
  `;

  const [result] = await pool.query(sql, [designId]);
  return result.affectedRows > 0;
}

async function createLocalDesignAuditEvent(
  {
    localDesignId,
    actorId = null,
    actorType = "system",
    eventType,
    fromStatus = null,
    toStatus = null,
    summary = null,
    metadata = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);

  await executor.query(
    `
      INSERT INTO local_design_audit_events (
        local_design_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        summary,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      localDesignId,
      actorId,
      actorType,
      eventType,
      fromStatus,
      toStatus,
      summary,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

async function updateCommunityDesignById(designId, payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE local_designs
    SET
      title = ?,
      description = ?,
      thumbnail_url = ?,
      file_url = ?,
      material = ?,
      dimensions = ?,
      license_type = ?,
      category_id = ?,
      ownership_confirmed = ?,
      policy_acknowledged = ?,
      moderation_status = ?,
      is_active = ?,
      is_print_ready = ?,
      moderation_feedback = ?,
      moderation_summary = ?,
      moderation_decision_source = ?
    WHERE id = ?
      AND source_kind = 'community'
  `;

  const [result] = await executor.query(sql, [
    payload.title,
    payload.description,
    payload.thumbnailUrl,
    payload.fileUrl,
    payload.material,
    payload.dimensions,
    payload.licenseType,
    payload.categoryId ?? null,
    payload.ownershipConfirmed,
    payload.policyAcknowledged,
    payload.moderationStatus,
    payload.isActive,
    payload.isPrintReady,
    payload.moderationFeedback,
    payload.moderationSummary,
    payload.moderationDecisionSource,
    designId,
  ]);

  if (result.affectedRows === 0) return null;
  return getLocalDesignByIdForAdmin(designId, connection);
}

async function getLocalDesignAuditEvents(localDesignId, connection = null) {
  const executor = getExecutor(connection);

  const [rows] = await executor.query(
    `
      SELECT
        id,
        local_design_id,
        actor_id,
        actor_type,
        event_type,
        from_status,
        to_status,
        summary,
        metadata,
        created_at
      FROM local_design_audit_events
      WHERE local_design_id = ?
      ORDER BY created_at DESC, id DESC
    `,
    [localDesignId],
  );

  return rows;
}

export {
  getActiveLocalDesigns,
  getAllLocalDesignsForAdmin,
  getLocalDesignsByOwner,
  getLocalDesignById,
  getLocalDesignByIdForAdmin,
  getLocalDesignAuditEvents,
  getDesignCategoryById,
  createLocalDesign,
  updateLocalDesignById,
  updateLocalDesignModerationState,
  deactivateLocalDesignById,
  archiveLocalDesignById,
  countLocalDesignReferences,
  deleteLocalDesignById,
  createLocalDesignAuditEvent,
  listDesignCategories,
  listDesignTags,
  upsertDesignCategoryByName,
  upsertDesignTagByName,
  replaceLocalDesignTags,
  updateCommunityDesignById,
};
