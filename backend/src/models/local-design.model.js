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
  ld.latest_moderation_run_id,
  ld.moderation_content_hash,
  ld.moderation_policy_version,
  ld.published_at,
  ld.reviewed_at,
  ld.reviewed_by,
  ld.print_ready_at,
  ld.print_ready_by,
  ld.is_featured,
  ld.featured_rank,
  ld.featured_at,
  ld.featured_by,
  ld.library_note,
  ld.is_library_hidden,
  ld.title,
  ld.description,
  (
    SELECT fo.public_path
    FROM local_design_images ldi
    INNER JOIN file_objects fo ON fo.id = ldi.file_object_id
    WHERE ldi.local_design_id = ld.id
      AND COALESCE(ldi.status, 'active') = 'active'
      AND COALESCE(ldi.storage_status, 'present') = 'present'
    ORDER BY ldi.is_primary DESC, ldi.sort_order ASC, ldi.id ASC
    LIMIT 1
  ) AS thumbnail_url,
  (
    SELECT fo.public_path
    FROM local_design_files ldf
    INNER JOIN file_objects fo ON fo.id = ldf.file_object_id
    WHERE ldf.local_design_id = ld.id
      AND COALESCE(ldf.status, 'active') = 'active'
      AND COALESCE(ldf.storage_status, 'present') = 'present'
    ORDER BY ldf.is_primary DESC, ldf.sort_order ASC, ldf.id ASC
    LIMIT 1
  ) AS file_url,
  (
    SELECT snapshot_fo.public_path
    FROM local_design_files ldf
    INNER JOIN file_objects snapshot_fo
      ON snapshot_fo.id = ldf.model_snapshot_file_object_id
    WHERE ldf.local_design_id = ld.id
      AND COALESCE(ldf.status, 'active') = 'active'
      AND COALESCE(ldf.storage_status, 'present') = 'present'
    ORDER BY ldf.is_primary DESC, ldf.sort_order ASC, ldf.id ASC
    LIMIT 1
  ) AS model_snapshot_url,
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
  ld.deleted_at,
  ld.deleted_by,
  ld.delete_reason,
  ld.created_at,
  ld.updated_at
`;

const LOCAL_DESIGN_FILE_SELECT = `
  ldf.*,
  fo.public_path AS file_url,
  snapshot_fo.public_path AS model_snapshot_url
`;

const LOCAL_DESIGN_IMAGE_SELECT = `
  ldi.*,
  fo.public_path AS image_url
`;

const PUBLIC_LIBRARY_MODERATION_CONDITION = `
  (
    ld.moderation_status = 'admin_approved'
    OR (
      ld.moderation_status = 'auto_approved'
      AND ld.latest_moderation_run_id IS NOT NULL
      AND ld.moderation_content_hash IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM local_design_moderation_runs ldmr
        WHERE ldmr.id = ld.latest_moderation_run_id
          AND ldmr.local_design_id = ld.id
          AND ldmr.status = 'completed'
          AND ldmr.final_decision = 'auto_approved'
          AND ldmr.content_hash = ld.moderation_content_hash
      )
    )
  )
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

function normalizeLocalDesignFileRow(row) {
  return {
    id: row.id,
    localDesignId: row.local_design_id,
    fileUrl: row.file_url,
    fileObjectId: row.file_object_id,
    modelSnapshotUrl: row.model_snapshot_url,
    modelSnapshotFileObjectId: row.model_snapshot_file_object_id,
    originalFileName: row.original_file_name,
    extension: row.extension,
    fileSize: row.file_size,
    checksumSha256: row.checksum_sha256,
    sortOrder: Number(row.sort_order || 0),
    isPrimary: Boolean(row.is_primary),
    isPrintReady: Boolean(row.is_print_ready),
    status: row.status || "active",
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    replacedById: row.replaced_by_id,
    removalReason: row.removal_reason,
    storageStatus: row.storage_status || "present",
    storageDeletedAt: row.storage_deleted_at,
    storageDeleteReason: row.storage_delete_reason,
    storageCleanupJobId: row.storage_cleanup_job_id,
    lastStorageCheckAt: row.last_storage_check_at,
    printReadyAt: row.print_ready_at,
    printReadyBy: row.print_ready_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLocalDesignImageRow(row) {
  return {
    id: row.id,
    localDesignId: row.local_design_id,
    imageUrl: row.image_url,
    fileObjectId: row.file_object_id,
    originalFileName: row.original_file_name,
    checksumSha256: row.checksum_sha256,
    sortOrder: Number(row.sort_order || 0),
    isPrimary: Boolean(row.is_primary),
    status: row.status || "active",
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    replacedById: row.replaced_by_id,
    removalReason: row.removal_reason,
    storageStatus: row.storage_status || "present",
    storageDeletedAt: row.storage_deleted_at,
    storageDeleteReason: row.storage_delete_reason,
    storageCleanupJobId: row.storage_cleanup_job_id,
    lastStorageCheckAt: row.last_storage_check_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dedupeNormalizedRows(rows, getKeys) {
  const seenKeys = new Set();
  const dedupedRows = [];

  for (const row of rows) {
    const keys = getKeys(row).filter(Boolean);
    const hasSeenKey = keys.some((key) => seenKeys.has(key));

    if (hasSeenKey) {
      continue;
    }

    for (const key of keys) {
      seenKeys.add(key);
    }

    dedupedRows.push(row);
  }

  return dedupedRows;
}

async function attachFilesAndImagesToLocalDesigns(localDesigns, connection = null) {
  if (!Array.isArray(localDesigns) || localDesigns.length === 0) {
    return localDesigns;
  }

  const executor = getExecutor(connection);
  const designIds = localDesigns.map((item) => item.id);
  const [fileRows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_FILE_SELECT}
      FROM local_design_files ldf
      LEFT JOIN file_objects fo ON fo.id = ldf.file_object_id
      LEFT JOIN file_objects snapshot_fo ON snapshot_fo.id = ldf.model_snapshot_file_object_id
      WHERE ldf.local_design_id IN (?)
      ORDER BY
        ldf.local_design_id ASC,
        FIELD(COALESCE(ldf.status, 'active'), 'active', 'replaced', 'removed'),
        ldf.is_primary DESC,
        ldf.sort_order ASC,
        ldf.id ASC
    `,
    [designIds],
  );
  const [imageRows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_IMAGE_SELECT}
      FROM local_design_images ldi
      LEFT JOIN file_objects fo ON fo.id = ldi.file_object_id
      WHERE ldi.local_design_id IN (?)
      ORDER BY
        ldi.local_design_id ASC,
        FIELD(COALESCE(ldi.status, 'active'), 'active', 'replaced', 'removed'),
        ldi.is_primary DESC,
        ldi.sort_order ASC,
        ldi.id ASC
    `,
    [designIds],
  );

  const filesByDesignId = new Map();
  const imagesByDesignId = new Map();

  for (const row of fileRows) {
    const currentFiles = filesByDesignId.get(row.local_design_id) || [];
    currentFiles.push(normalizeLocalDesignFileRow(row));
    filesByDesignId.set(row.local_design_id, currentFiles);
  }

  for (const row of imageRows) {
    const currentImages = imagesByDesignId.get(row.local_design_id) || [];
    currentImages.push(normalizeLocalDesignImageRow(row));
    imagesByDesignId.set(row.local_design_id, currentImages);
  }

  return localDesigns.map((item) => ({
    ...item,
    files: dedupeNormalizedRows(filesByDesignId.get(item.id) || [], (file) => [
      file.status === "active" && file.checksumSha256
        ? `active-checksum:${file.checksumSha256}`
        : null,
      file.status === "active" && file.fileUrl ? `active-url:${file.fileUrl}` : null,
      file.status !== "active" ? `inactive-id:${file.id}` : null,
    ]),
    images: dedupeNormalizedRows(imagesByDesignId.get(item.id) || [], (image) => [
      image.status === "active" && image.checksumSha256
        ? `active-checksum:${image.checksumSha256}`
        : null,
      image.status === "active" && image.imageUrl
        ? `active-url:${image.imageUrl}`
        : null,
      image.status !== "active" ? `inactive-id:${image.id}` : null,
    ]),
  }));
}

async function getLocalDesignRows(sql, params = [], connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(sql, params);
  return hydrateLocalDesignRows(rows, connection);
}

async function hydrateLocalDesignRows(rows, connection = null) {
  const rowsWithTags = await attachTagsToLocalDesigns(rows, connection);
  return attachFilesAndImagesToLocalDesigns(rowsWithTags, connection);
}

async function getAllLocalDesignsForAdmin({
  archived = false,
  sourceKind = null,
  statuses = [],
  search = null,
  printReady = null,
  page = 1,
  limit = 20,
} = {}) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), 100)
      : 20;
  const offset = (normalizedPage - 1) * normalizedLimit;
  const params = [];
  const where = [`ld.archived_at ${archived ? "IS NOT NULL" : "IS NULL"}`];
  const countWhere = [...where];
  const countParams = [];

  if (sourceKind) {
    where.push("ld.source_kind = ?");
    countWhere.push("ld.source_kind = ?");
    params.push(sourceKind);
    countParams.push(sourceKind);
  }

  if (search) {
    const searchPattern = `%${String(search).trim().toLowerCase()}%`;
    const searchSql = `(
      LOWER(ld.title) LIKE ?
      OR LOWER(ld.description) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM users u
        WHERE u.id = ld.uploaded_by
          AND (
            LOWER(u.email) LIKE ?
            OR LOWER(u.first_name) LIKE ?
            OR LOWER(u.last_name) LIKE ?
          )
      )
    )`;
    where.push(searchSql);
    countWhere.push(searchSql);
    params.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
    countParams.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (printReady === true || printReady === false) {
    where.push("ld.is_print_ready = ?");
    countWhere.push("ld.is_print_ready = ?");
    params.push(printReady);
    countParams.push(printReady);
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
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM local_designs ld
    WHERE ${where.join(" AND ")}
  `;
  const statusCountsSql = `
    SELECT ld.moderation_status AS status, COUNT(*) AS count
    FROM local_designs ld
    WHERE ${countWhere.join(" AND ")}
    GROUP BY ld.moderation_status
  `;
  const [[rows], [countRows], [statusCountRows]] = await Promise.all([
    pool.query(sql, [...params, normalizedLimit, offset]),
    pool.query(countSql, params),
    pool.query(statusCountsSql, countParams),
  ]);

  const hydratedRows = await hydrateLocalDesignRows(rows);

  return {
    rows: hydratedRows,
    statusCounts: statusCountRows,
    totalCount: Number(countRows[0]?.total_count || 0),
    page: normalizedPage,
    limit: normalizedLimit,
  };
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
      AND ld.deleted_at IS NULL
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
    WHERE ld.id = ?
      AND ld.is_active = TRUE
      AND ld.archived_at IS NULL
      AND ld.deleted_at IS NULL
      AND ld.is_library_hidden = FALSE
      AND ${PUBLIC_LIBRARY_MODERATION_CONDITION}
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    sourceKind,
    title,
    description,
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

async function createLocalDesignFile(
  {
    localDesignId,
    fileUrl,
    fileObjectId = null,
    modelSnapshotUrl = null,
    modelSnapshotFileObjectId = null,
    originalFileName = null,
    extension = null,
    fileSize = null,
    checksumSha256 = null,
    sortOrder = 0,
    isPrimary = false,
    isPrintReady = false,
    printReadyAt = null,
    printReadyBy = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO local_design_files (
        local_design_id,
        file_object_id,
        model_snapshot_file_object_id,
        original_file_name,
        extension,
        file_size,
        checksum_sha256,
        sort_order,
        is_primary,
        is_print_ready,
        print_ready_at,
        print_ready_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      localDesignId,
      fileObjectId,
      modelSnapshotFileObjectId,
      originalFileName,
      extension,
      fileSize,
      checksumSha256,
      sortOrder,
      isPrimary,
      isPrintReady,
      printReadyAt,
      printReadyBy,
    ],
  );

  return getLocalDesignFileById(result.insertId, connection);
}

async function createLocalDesignImage(
  {
    localDesignId,
    imageUrl,
    fileObjectId = null,
    originalFileName = null,
    checksumSha256 = null,
    sortOrder = 0,
    isPrimary = false,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO local_design_images (
        local_design_id,
        file_object_id,
        original_file_name,
        checksum_sha256,
        sort_order,
        is_primary
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      localDesignId,
      fileObjectId,
      originalFileName,
      checksumSha256,
      sortOrder,
      isPrimary,
    ],
  );

  return getLocalDesignImageById(result.insertId, connection);
}

async function getLocalDesignFileById(fileId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_FILE_SELECT}
      FROM local_design_files ldf
      LEFT JOIN file_objects fo ON fo.id = ldf.file_object_id
      LEFT JOIN file_objects snapshot_fo ON snapshot_fo.id = ldf.model_snapshot_file_object_id
      WHERE ldf.id = ?
      LIMIT 1
    `,
    [fileId],
  );

  return rows[0] ? normalizeLocalDesignFileRow(rows[0]) : null;
}

async function getLocalDesignImageById(imageId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_IMAGE_SELECT}
      FROM local_design_images ldi
      LEFT JOIN file_objects fo ON fo.id = ldi.file_object_id
      WHERE ldi.id = ?
      LIMIT 1
    `,
    [imageId],
  );

  return rows[0] ? normalizeLocalDesignImageRow(rows[0]) : null;
}

async function getLocalDesignFileByChecksum(
  { localDesignId, checksumSha256 },
  connection = null,
) {
  if (!checksumSha256) {
    return null;
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_FILE_SELECT}
      FROM local_design_files ldf
      LEFT JOIN file_objects fo ON fo.id = ldf.file_object_id
      LEFT JOIN file_objects snapshot_fo ON snapshot_fo.id = ldf.model_snapshot_file_object_id
      WHERE ldf.local_design_id = ?
        AND ldf.checksum_sha256 = ?
        AND COALESCE(ldf.status, 'active') = 'active'
      ORDER BY ldf.is_primary DESC, ldf.sort_order ASC, ldf.id ASC
      LIMIT 1
    `,
    [localDesignId, checksumSha256],
  );

  return rows[0] ? normalizeLocalDesignFileRow(rows[0]) : null;
}

async function getLocalDesignImageByUrl(
  { localDesignId, imageUrl },
  connection = null,
) {
  if (!imageUrl) {
    return null;
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_IMAGE_SELECT}
      FROM local_design_images ldi
      LEFT JOIN file_objects fo ON fo.id = ldi.file_object_id
      WHERE ldi.local_design_id = ?
        AND fo.public_path = ?
        AND COALESCE(ldi.status, 'active') = 'active'
      ORDER BY ldi.is_primary DESC, ldi.sort_order ASC, ldi.id ASC
      LIMIT 1
    `,
    [localDesignId, imageUrl],
  );

  return rows[0] ? normalizeLocalDesignImageRow(rows[0]) : null;
}

async function getLocalDesignImageByChecksum(
  { localDesignId, checksumSha256 },
  connection = null,
) {
  if (!checksumSha256) {
    return null;
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_IMAGE_SELECT}
      FROM local_design_images ldi
      LEFT JOIN file_objects fo ON fo.id = ldi.file_object_id
      WHERE ldi.local_design_id = ?
        AND ldi.checksum_sha256 = ?
        AND COALESCE(ldi.status, 'active') = 'active'
      ORDER BY ldi.is_primary DESC, ldi.sort_order ASC, ldi.id ASC
      LIMIT 1
    `,
    [localDesignId, checksumSha256],
  );

  return rows[0] ? normalizeLocalDesignImageRow(rows[0]) : null;
}

async function getLocalDesignFileForQuote({
  localDesignId,
  designFileId = null,
  connection = null,
}) {
  const executor = getExecutor(connection);
  const params = [localDesignId];
  let idCondition = "";

  if (designFileId !== null && designFileId !== undefined && designFileId !== "") {
    idCondition = "AND ldf.id = ?";
    params.push(designFileId);
  }

  const [rows] = await executor.query(
    `
      SELECT ${LOCAL_DESIGN_FILE_SELECT}
      FROM local_design_files ldf
      LEFT JOIN file_objects fo ON fo.id = ldf.file_object_id
      LEFT JOIN file_objects snapshot_fo ON snapshot_fo.id = ldf.model_snapshot_file_object_id
      WHERE ldf.local_design_id = ?
        ${idCondition}
        AND COALESCE(ldf.status, 'active') = 'active'
        AND COALESCE(ldf.storage_status, 'present') = 'present'
        AND ldf.is_print_ready = TRUE
      ORDER BY ldf.is_primary DESC, ldf.sort_order ASC, ldf.id ASC
      LIMIT 1
    `,
    params,
  );

  return rows[0] ? normalizeLocalDesignFileRow(rows[0]) : null;
}

async function updateLocalDesignFilePrintReady(
  {
    localDesignId,
    designFileId,
    isPrintReady,
    printReadyAt = null,
    printReadyBy = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_design_files
      SET
        is_print_ready = ?,
        print_ready_at = ?,
        print_ready_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND local_design_id = ?
        AND COALESCE(status, 'active') = 'active'
    `,
    [isPrintReady, printReadyAt, printReadyBy, designFileId, localDesignId],
  );

  return result.affectedRows > 0
    ? getLocalDesignFileById(designFileId, connection)
    : null;
}

async function syncLocalDesignPrintReadySummary(localDesignId, connection = null) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      UPDATE local_designs ld
      SET
        is_print_ready = EXISTS (
          SELECT 1
          FROM local_design_files ldf
          WHERE ldf.local_design_id = ld.id
            AND COALESCE(ldf.status, 'active') = 'active'
            AND COALESCE(ldf.storage_status, 'present') = 'present'
            AND ldf.is_print_ready = TRUE
        ),
        print_ready_at = (
          SELECT MAX(ldf.print_ready_at)
          FROM local_design_files ldf
          WHERE ldf.local_design_id = ld.id
            AND COALESCE(ldf.status, 'active') = 'active'
            AND COALESCE(ldf.storage_status, 'present') = 'present'
            AND ldf.is_print_ready = TRUE
        ),
        print_ready_by = (
          SELECT ldf.print_ready_by
          FROM local_design_files ldf
          WHERE ldf.local_design_id = ld.id
            AND COALESCE(ldf.status, 'active') = 'active'
            AND COALESCE(ldf.storage_status, 'present') = 'present'
            AND ldf.is_print_ready = TRUE
          ORDER BY ldf.print_ready_at DESC, ldf.id DESC
          LIMIT 1
        )
      WHERE ld.id = ?
    `,
    [localDesignId],
  );

  return getLocalDesignByIdForAdmin(localDesignId, connection);
}

async function syncLocalDesignPrimaryAssetSummary(localDesignId, connection = null) {
  return getLocalDesignByIdForAdmin(localDesignId, connection);
}

async function countActiveLocalDesignFiles(localDesignId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT COUNT(*) AS total_count
      FROM local_design_files
      WHERE local_design_id = ?
        AND COALESCE(status, 'active') = 'active'
    `,
    [localDesignId],
  );

  return Number(rows[0]?.total_count || 0);
}

async function markLocalDesignFileRemoved(
  {
    localDesignId,
    fileId,
    removedBy = null,
    status = "removed",
    replacedById = null,
    removalReason = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_design_files
      SET
        status = ?,
        removed_at = NOW(),
        removed_by = ?,
        replaced_by_id = ?,
        removal_reason = ?,
        is_primary = FALSE,
        is_print_ready = FALSE,
        print_ready_at = NULL,
        print_ready_by = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND local_design_id = ?
        AND COALESCE(status, 'active') = 'active'
    `,
    [status, removedBy, replacedById, removalReason, fileId, localDesignId],
  );

  return result.affectedRows > 0
    ? getLocalDesignFileById(fileId, connection)
    : null;
}

async function markLocalDesignImageRemoved(
  {
    localDesignId,
    imageId,
    removedBy = null,
    status = "removed",
    replacedById = null,
    removalReason = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_design_images
      SET
        status = ?,
        removed_at = NOW(),
        removed_by = ?,
        replaced_by_id = ?,
        removal_reason = ?,
        is_primary = FALSE,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND local_design_id = ?
        AND COALESCE(status, 'active') = 'active'
    `,
    [status, removedBy, replacedById, removalReason, imageId, localDesignId],
  );

  return result.affectedRows > 0
    ? getLocalDesignImageById(imageId, connection)
    : null;
}

async function setLocalDesignPrimaryFile(
  { localDesignId, fileId },
  connection = null,
) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      UPDATE local_design_files
      SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE local_design_id = ?
    `,
    [localDesignId],
  );

  if (fileId) {
    await executor.query(
      `
        UPDATE local_design_files
        SET is_primary = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND local_design_id = ?
          AND COALESCE(status, 'active') = 'active'
      `,
      [fileId, localDesignId],
    );
  }
}

async function setLocalDesignPrimaryImage(
  { localDesignId, imageId },
  connection = null,
) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      UPDATE local_design_images
      SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE local_design_id = ?
    `,
    [localDesignId],
  );

  if (imageId) {
    await executor.query(
      `
        UPDATE local_design_images
        SET is_primary = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND local_design_id = ?
          AND COALESCE(status, 'active') = 'active'
      `,
      [imageId, localDesignId],
    );
  }
}

async function reorderLocalDesignFiles(
  { localDesignId, orderedFileIds = [] },
  connection = null,
) {
  const executor = getExecutor(connection);
  for (const [index, fileId] of orderedFileIds.entries()) {
    await executor.query(
      `
        UPDATE local_design_files
        SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND local_design_id = ?
          AND COALESCE(status, 'active') = 'active'
      `,
      [index, fileId, localDesignId],
    );
  }
}

async function reorderLocalDesignImages(
  { localDesignId, orderedImageIds = [] },
  connection = null,
) {
  const executor = getExecutor(connection);
  for (const [index, imageId] of orderedImageIds.entries()) {
    await executor.query(
      `
        UPDATE local_design_images
        SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND local_design_id = ?
          AND COALESCE(status, 'active') = 'active'
      `,
      [index, imageId, localDesignId],
    );
  }
}

async function updateLocalDesignById(designId, payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE local_designs
    SET
      title = ?,
      description = ?,
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
    latestModerationRunId = undefined,
    moderationContentHash = undefined,
    moderationPolicyVersion = undefined,
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
        latest_moderation_run_id = COALESCE(?, latest_moderation_run_id),
        moderation_content_hash = COALESCE(?, moderation_content_hash),
        moderation_policy_version = COALESCE(?, moderation_policy_version),
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
      latestModerationRunId ?? null,
      moderationContentHash ?? null,
      moderationPolicyVersion ?? null,
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

  const [printRequestRows] = await pool.query(printRequestSql, [designId]);

  return {
    printRequestCount: Number(printRequestRows[0]?.total_count || 0),
  };
}

async function updateLocalDesignLibraryCuration(
  designId,
  {
    isFeatured = false,
    featuredRank = 0,
    libraryNote = null,
    isLibraryHidden = false,
    actorId = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);

  const [result] = await executor.query(
    `
      UPDATE local_designs
      SET
        is_featured = ?,
        featured_rank = ?,
        featured_at = CASE
          WHEN ? = TRUE AND is_featured = FALSE THEN NOW()
          WHEN ? = TRUE THEN featured_at
          ELSE NULL
        END,
        featured_by = CASE
          WHEN ? = TRUE THEN ?
          ELSE NULL
        END,
        library_note = ?,
        is_library_hidden = ?
      WHERE id = ?
    `,
    [
      Boolean(isFeatured),
      Number(featuredRank) || 0,
      Boolean(isFeatured),
      Boolean(isFeatured),
      Boolean(isFeatured),
      actorId,
      libraryNote,
      Boolean(isLibraryHidden),
      designId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId, connection);
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

async function getDesignTagsByIds(tagIds = [], connection = null) {
  const uniqueTagIds = [...new Set(tagIds.map(Number).filter(Boolean))];

  if (uniqueTagIds.length === 0) {
    return [];
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT id, name, slug, is_active, created_at, updated_at
      FROM design_tags
      WHERE id IN (?)
      ORDER BY name ASC
    `,
    [uniqueTagIds],
  );

  return rows;
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

async function updateDesignCategoryById({
  categoryId,
  name,
  description = null,
  isActive = true,
  userId = null,
}) {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return null;
  }

  const slug = toSlug(normalizedName);
  const [result] = await pool.query(
    `
      UPDATE design_categories
      SET
        name = ?,
        slug = ?,
        description = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
    `,
    [
      normalizedName,
      slug,
      normalizeName(description),
      Boolean(isActive),
      userId,
      categoryId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getDesignCategoryById(categoryId);
}

async function updateDesignTagById({
  tagId,
  name,
  isActive = true,
  userId = null,
}) {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return null;
  }

  const slug = toSlug(normalizedName);
  const [result] = await pool.query(
    `
      UPDATE design_tags
      SET
        name = ?,
        slug = ?,
        is_active = ?,
        updated_by = ?
      WHERE id = ?
    `,
    [normalizedName, slug, Boolean(isActive), userId, tagId],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  const rows = await getDesignTagsByIds([tagId]);
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

async function deleteLocalDesignById(designId, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    DELETE FROM local_designs
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [designId]);
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

async function softDeleteCommunityDesignById(
  { designId, deletedBy, deleteReason = null },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_designs
      SET
        deleted_at = NOW(),
        deleted_by = ?,
        delete_reason = ?,
        is_active = FALSE,
        is_library_hidden = TRUE,
        is_print_ready = FALSE,
        print_ready_at = NULL,
        print_ready_by = NULL
      WHERE id = ?
        AND source_kind = 'community'
        AND deleted_at IS NULL
    `,
    [deletedBy, deleteReason, designId],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getLocalDesignByIdForAdmin(designId, connection);
}

async function updateLocalDesignThumbnailUrl(
  designId,
  thumbnailUrl,
  connection = null,
) {
  return getLocalDesignByIdForAdmin(designId, connection);
}

async function getLatestLocalDesignModelSnapshotUrl(
  localDesignId,
  connection = null,
) {
  const executor = getExecutor(connection);

  const [rows] = await executor.query(
    `
      SELECT fo.public_path AS image_url
      FROM local_design_moderation_renders ldmr
      INNER JOIN file_objects fo ON fo.id = ldmr.file_object_id
      WHERE ldmr.local_design_id = ?
        AND ldmr.angle_label = 'model_snapshot'
        AND fo.public_path IS NOT NULL
      ORDER BY ldmr.created_at DESC, ldmr.id DESC
      LIMIT 1
    `,
    [localDesignId],
  );

  return rows[0]?.image_url || null;
}

async function createLocalDesignModelSnapshotRender(
  { localDesignId, imageUrl, fileObjectId = null },
  connection = null,
) {
  const executor = getExecutor(connection);

  await executor.query(
    `
      INSERT INTO local_design_moderation_renders (
        local_design_id,
        angle_label,
        file_object_id,
        moderation_status,
        moderation_summary
      )
      VALUES (?, 'model_snapshot', ?, 'passed', ?)
    `,
    [
      localDesignId,
      fileObjectId,
      "Generated model snapshot for public Design Library preview.",
    ],
  );

  return imageUrl;
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

async function searchActiveLocalDesigns({
  searchQuery = null,
  category = null,
  tag = null,
  sourceKind = null,
  printReady = null,
  sort = "newest",
  page = 1,
  limit = 12,
} = {}) {
  const params = [];
  const where = [
    "ld.is_active = TRUE",
    "ld.archived_at IS NULL",
    "ld.deleted_at IS NULL",
    "ld.is_library_hidden = FALSE",
    PUBLIC_LIBRARY_MODERATION_CONDITION,
  ];

  if (searchQuery) {
    where.push(`(
      ld.title LIKE ?
      OR ld.description LIKE ?
      OR ld.material LIKE ?
      OR ld.dimensions LIKE ?
      OR ld.license_type LIKE ?
      OR dc.name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM local_design_tags ldt
        INNER JOIN design_tags dt ON dt.id = ldt.tag_id
        WHERE ldt.local_design_id = ld.id
          AND dt.is_active = TRUE
          AND dt.name LIKE ?
      )
    )`);

    const likeQuery = `%${searchQuery}%`;
    params.push(
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
    );
  }

  if (category) {
    where.push("(dc.slug = ? OR dc.name = ?)");
    params.push(category, category);
  }

  if (tag) {
    where.push(`EXISTS (
      SELECT 1
      FROM local_design_tags ldt
      INNER JOIN design_tags dt ON dt.id = ldt.tag_id
      WHERE ldt.local_design_id = ld.id
        AND dt.is_active = TRUE
        AND (dt.slug = ? OR dt.name = ?)
    )`);
    params.push(tag, tag);
  }

  if (sourceKind) {
    where.push("ld.source_kind = ?");
    params.push(sourceKind);
  }

  if (printReady !== null) {
    where.push("ld.is_print_ready = ?");
    params.push(Boolean(printReady));
  }

  const orderByMap = {
    newest: "ld.created_at DESC, ld.id DESC",
    oldest: "ld.created_at ASC, ld.id ASC",
    title_asc: "ld.title ASC, ld.id DESC",
    title_desc: "ld.title DESC, ld.id DESC",
    print_ready: "ld.is_print_ready DESC, ld.created_at DESC, ld.id DESC",
  };

  const orderBy = orderByMap[sort] || orderByMap.newest;
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 12, 1), 48);
  const offset = (normalizedPage - 1) * normalizedLimit;

  const countSql = `
    SELECT COUNT(DISTINCT ld.id) AS total_count
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ${where.join(" AND ")}
  `;

  const [countRows] = await pool.query(countSql, params);
  const totalCount = Number(countRows[0]?.total_count || 0);

  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const rows = await getLocalDesignRows(sql, [
    ...params,
    normalizedLimit,
    offset,
  ]);

  return {
    items: rows,
    page: normalizedPage,
    limit: normalizedLimit,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / normalizedLimit), 1),
  };
}

async function listLibrarySectionDesigns({
  sourceKind = null,
  printReady = null,
  featured = null,
  limit = 8,
} = {}) {
  const params = [];
  const where = [
    "ld.is_active = TRUE",
    "ld.archived_at IS NULL",
    "ld.deleted_at IS NULL",
    "ld.is_library_hidden = FALSE",
    PUBLIC_LIBRARY_MODERATION_CONDITION,
  ];

  if (sourceKind) {
    where.push("ld.source_kind = ?");
    params.push(sourceKind);
  }

  if (printReady !== null) {
    where.push("ld.is_print_ready = ?");
    params.push(Boolean(printReady));
  }

  if (featured !== null) {
    where.push("ld.is_featured = ?");
    params.push(Boolean(featured));
  }

  const normalizedLimit = Math.min(Math.max(Number(limit) || 8, 1), 24);

  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT}
    FROM local_designs ld
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE ${where.join(" AND ")}
    ORDER BY
      ld.is_featured DESC,
      ld.featured_rank ASC,
      ld.featured_at DESC,
      ld.created_at DESC,
      ld.id DESC
    LIMIT ?
  `;

  return getLocalDesignRows(sql, [...params, normalizedLimit]);
}

async function getSavedDesignsByUser(userId) {
  const sql = `
    SELECT
      ${LOCAL_DESIGN_SELECT},
      sd.created_at AS saved_at
    FROM saved_designs sd
    INNER JOIN local_designs ld ON ld.id = sd.local_design_id
    LEFT JOIN design_categories dc ON dc.id = ld.category_id
    WHERE sd.user_id = ?
      AND ld.is_active = TRUE
      AND ld.archived_at IS NULL
      AND ld.deleted_at IS NULL
      AND ld.is_library_hidden = FALSE
      AND ${PUBLIC_LIBRARY_MODERATION_CONDITION}
    ORDER BY sd.created_at DESC, sd.local_design_id DESC
  `;

  return getLocalDesignRows(sql, [userId]);
}

async function getSavedDesignIdsByUser(userId) {
  const [rows] = await pool.query(
    `
      SELECT sd.local_design_id
      FROM saved_designs sd
      INNER JOIN local_designs ld ON ld.id = sd.local_design_id
      WHERE sd.user_id = ?
        AND ld.deleted_at IS NULL
    `,
    [userId],
  );

  return rows.map((row) => Number(row.local_design_id));
}

async function saveDesignForUser({ userId, localDesignId }) {
  await pool.query(
    `
      INSERT INTO saved_designs (user_id, local_design_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE created_at = created_at
    `,
    [userId, localDesignId],
  );

  return true;
}

async function unsaveDesignForUser({ userId, localDesignId }) {
  const [result] = await pool.query(
    `
      DELETE FROM saved_designs
      WHERE user_id = ? AND local_design_id = ?
    `,
    [userId, localDesignId],
  );

  return result.affectedRows > 0;
}

export {
  getAllLocalDesignsForAdmin,
  getLocalDesignsByOwner,
  getLocalDesignById,
  getLocalDesignByIdForAdmin,
  getLocalDesignAuditEvents,
  getDesignCategoryById,
  getDesignTagsByIds,
  createLocalDesign,
  createLocalDesignFile,
  createLocalDesignImage,
  getLocalDesignFileById,
  getLocalDesignFileByChecksum,
  getLocalDesignImageByUrl,
  getLocalDesignImageByChecksum,
  getLocalDesignFileForQuote,
  updateLocalDesignById,
  updateLocalDesignFilePrintReady,
  syncLocalDesignPrimaryAssetSummary,
  countActiveLocalDesignFiles,
  markLocalDesignFileRemoved,
  markLocalDesignImageRemoved,
  setLocalDesignPrimaryFile,
  setLocalDesignPrimaryImage,
  reorderLocalDesignFiles,
  reorderLocalDesignImages,
  updateLocalDesignModerationState,
  syncLocalDesignPrintReadySummary,
  archiveLocalDesignById,
  countLocalDesignReferences,
  deleteLocalDesignById,
  softDeleteCommunityDesignById,
  createLocalDesignAuditEvent,
  listDesignCategories,
  listDesignTags,
  upsertDesignCategoryByName,
  upsertDesignTagByName,
  updateDesignCategoryById,
  updateDesignTagById,
  replaceLocalDesignTags,
  updateCommunityDesignById,
  updateLocalDesignThumbnailUrl,
  getLatestLocalDesignModelSnapshotUrl,
  createLocalDesignModelSnapshotRender,
  searchActiveLocalDesigns,
  listLibrarySectionDesigns,
  updateLocalDesignLibraryCuration,
  getSavedDesignsByUser,
  getSavedDesignIdsByUser,
  saveDesignForUser,
  unsaveDesignForUser,
};
