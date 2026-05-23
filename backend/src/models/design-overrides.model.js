import pool from "../db/db.js";

async function getAllDesignOverrides() {
  const sql = `
    SELECT
      d.id,
      d.mmf_object_id,
      d.is_hidden,
      d.is_pinned,
      d.is_print_ready,
      d.linked_local_design_id,
      d.mapping_status,
      d.mapping_error,
      d.mapping_metadata,
      d.print_ready_verified_at,
      d.print_ready_verified_by,
      d.client_note,
      d.created_by,
      d.updated_by,
      d.created_at,
      d.updated_at,
      mprf.id AS print_ready_file_id,
      mprf.file_object_id AS print_ready_file_file_object_id,
      mprf.model_snapshot_file_object_id AS print_ready_file_model_snapshot_file_object_id,
      (SELECT public_path FROM file_objects WHERE id = mprf.file_object_id) AS print_ready_file_cached_file_url,
      (SELECT public_path FROM file_objects WHERE id = mprf.model_snapshot_file_object_id) AS print_ready_file_model_snapshot_url,
      mprf.original_file_name AS print_ready_file_original_file_name,
      mprf.extension AS print_ready_file_extension,
      mprf.file_size AS print_ready_file_size,
      mprf.status AS print_ready_file_status,
      mprf.verified_at AS print_ready_file_verified_at
    FROM design_overrides d
    LEFT JOIN mmf_print_ready_files mprf
      ON mprf.mmf_object_id = d.mmf_object_id
      AND mprf.status = 'cached'
      AND COALESCE(mprf.storage_status, 'present') = 'present'
      AND mprf.is_primary = TRUE
    ORDER BY d.updated_at DESC, d.id DESC
  `;

  const [rows] = await pool.query(sql);
  return rows;
}

function normalizePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 20;
  return Math.min(limit, 100);
}

async function listDesignOverridesForAdmin({
  page = 1,
  limit = 20,
  search = "",
  filter = "",
} = {}) {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const offset = (normalizedPage - 1) * normalizedLimit;
  const where = [];
  const params = [];

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    where.push("CAST(d.mmf_object_id AS CHAR) LIKE ?");
    params.push(`%${normalizedSearch}%`);
  }

  if (filter === "print_ready") {
    where.push("d.is_print_ready = TRUE");
  } else if (filter === "hidden") {
    where.push("d.is_hidden = TRUE");
  } else if (filter === "pinned") {
    where.push("d.is_pinned = TRUE");
  } else if (filter === "needs_file") {
    where.push(`
      d.is_print_ready = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM mmf_print_ready_files mprf_filter
        WHERE mprf_filter.mmf_object_id = d.mmf_object_id
          AND mprf_filter.status = 'cached'
          AND COALESCE(mprf_filter.storage_status, 'present') = 'present'
      )
    `);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const selectSql = `
    SELECT
      d.id,
      d.mmf_object_id,
      d.is_hidden,
      d.is_pinned,
      d.is_print_ready,
      d.linked_local_design_id,
      d.mapping_status,
      d.mapping_error,
      d.mapping_metadata,
      d.print_ready_verified_at,
      d.print_ready_verified_by,
      d.client_note,
      d.created_by,
      d.updated_by,
      d.created_at,
      d.updated_at,
      mprf.id AS print_ready_file_id,
      mprf.file_object_id AS print_ready_file_file_object_id,
      mprf.model_snapshot_file_object_id AS print_ready_file_model_snapshot_file_object_id,
      (SELECT public_path FROM file_objects WHERE id = mprf.file_object_id) AS print_ready_file_cached_file_url,
      (SELECT public_path FROM file_objects WHERE id = mprf.model_snapshot_file_object_id) AS print_ready_file_model_snapshot_url,
      mprf.original_file_name AS print_ready_file_original_file_name,
      mprf.extension AS print_ready_file_extension,
      mprf.file_size AS print_ready_file_size,
      mprf.status AS print_ready_file_status,
      mprf.verified_at AS print_ready_file_verified_at
    FROM design_overrides d
    LEFT JOIN mmf_print_ready_files mprf
      ON mprf.mmf_object_id = d.mmf_object_id
      AND mprf.status = 'cached'
      AND COALESCE(mprf.storage_status, 'present') = 'present'
      AND mprf.is_primary = TRUE
    ${whereSql}
    ORDER BY d.updated_at DESC, d.id DESC
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) AS count
    FROM design_overrides d
    ${whereSql}
  `;
  const countsSql = `
    SELECT
      COUNT(*) AS total,
      SUM(is_print_ready = TRUE) AS print_ready,
      SUM(is_hidden = TRUE) AS hidden,
      SUM(is_pinned = TRUE) AS pinned,
      SUM(
        is_print_ready = TRUE
        AND NOT EXISTS (
          SELECT 1
          FROM mmf_print_ready_files mprf_filter
          WHERE mprf_filter.mmf_object_id = design_overrides.mmf_object_id
            AND mprf_filter.status = 'cached'
            AND COALESCE(mprf_filter.storage_status, 'present') = 'present'
        )
      ) AS needs_file
    FROM design_overrides
  `;

  const [[rows], [countRows], [countSummaryRows]] = await Promise.all([
    pool.query(selectSql, [...params, normalizedLimit, offset]),
    pool.query(countSql, params),
    pool.query(countsSql),
  ]);

  const countSummary = countSummaryRows[0] || {};

  return {
    rows,
    page: normalizedPage,
    limit: normalizedLimit,
    totalCount: Number(countRows[0]?.count || 0),
    counts: {
      total: Number(countSummary.total || 0),
      printReady: Number(countSummary.print_ready || 0),
      hidden: Number(countSummary.hidden || 0),
      pinned: Number(countSummary.pinned || 0),
      needsFile: Number(countSummary.needs_file || 0),
    },
  };
}

async function getDesignOverrideById(overrideId) {
  const sql = `
    SELECT
      d.id,
      d.mmf_object_id,
      d.is_hidden,
      d.is_pinned,
      d.is_print_ready,
      d.linked_local_design_id,
      d.mapping_status,
      d.mapping_error,
      d.mapping_metadata,
      d.print_ready_verified_at,
      d.print_ready_verified_by,
      d.client_note,
      d.created_by,
      d.updated_by,
      d.created_at,
      d.updated_at,
      mprf.id AS print_ready_file_id,
      mprf.file_object_id AS print_ready_file_file_object_id,
      mprf.model_snapshot_file_object_id AS print_ready_file_model_snapshot_file_object_id,
      (SELECT public_path FROM file_objects WHERE id = mprf.file_object_id) AS print_ready_file_cached_file_url,
      (SELECT public_path FROM file_objects WHERE id = mprf.model_snapshot_file_object_id) AS print_ready_file_model_snapshot_url,
      mprf.original_file_name AS print_ready_file_original_file_name,
      mprf.extension AS print_ready_file_extension,
      mprf.file_size AS print_ready_file_size,
      mprf.status AS print_ready_file_status,
      mprf.verified_at AS print_ready_file_verified_at
    FROM design_overrides d
    LEFT JOIN mmf_print_ready_files mprf
      ON mprf.mmf_object_id = d.mmf_object_id
      AND mprf.status = 'cached'
      AND COALESCE(mprf.storage_status, 'present') = 'present'
      AND mprf.is_primary = TRUE
    WHERE d.id = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [overrideId]);
  return rows[0] || null;
}

async function getDesignOverrideByMmfObjectId(mmfObjectId) {
  const sql = `
    SELECT
      d.id,
      d.mmf_object_id,
      d.is_hidden,
      d.is_pinned,
      d.is_print_ready,
      d.linked_local_design_id,
      d.mapping_status,
      d.mapping_error,
      d.mapping_metadata,
      d.print_ready_verified_at,
      d.print_ready_verified_by,
      d.client_note,
      d.created_by,
      d.updated_by,
      d.created_at,
      d.updated_at,
      mprf.id AS print_ready_file_id,
      mprf.file_object_id AS print_ready_file_file_object_id,
      mprf.model_snapshot_file_object_id AS print_ready_file_model_snapshot_file_object_id,
      (SELECT public_path FROM file_objects WHERE id = mprf.file_object_id) AS print_ready_file_cached_file_url,
      (SELECT public_path FROM file_objects WHERE id = mprf.model_snapshot_file_object_id) AS print_ready_file_model_snapshot_url,
      mprf.original_file_name AS print_ready_file_original_file_name,
      mprf.extension AS print_ready_file_extension,
      mprf.file_size AS print_ready_file_size,
      mprf.status AS print_ready_file_status,
      mprf.verified_at AS print_ready_file_verified_at
    FROM design_overrides d
    LEFT JOIN mmf_print_ready_files mprf
      ON mprf.mmf_object_id = d.mmf_object_id
      AND mprf.status = 'cached'
      AND COALESCE(mprf.storage_status, 'present') = 'present'
      AND mprf.is_primary = TRUE
    WHERE d.mmf_object_id = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [mmfObjectId]);
  return rows[0] || null;
}

async function createDesignOverride({
  mmfObjectId,
  isHidden = false,
  isPinned = false,
  isPrintReady = false,
  linkedLocalDesignId = null,
  mappingStatus = "not_requested",
  mappingError = null,
  mappingMetadata = null,
  printReadyVerifiedAt = null,
  printReadyVerifiedBy = null,
  clientNote = null,
  createdBy,
  updatedBy,
}) {
  const sql = `
    INSERT INTO design_overrides (
      mmf_object_id,
      is_hidden,
      is_pinned,
      is_print_ready,
      linked_local_design_id,
      mapping_status,
      mapping_error,
      mapping_metadata,
      print_ready_verified_at,
      print_ready_verified_by,
      client_note,
      created_by,
      updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    mmfObjectId,
    isHidden,
    isPinned,
    isPrintReady,
    linkedLocalDesignId,
    mappingStatus,
    mappingError,
    mappingMetadata ? JSON.stringify(mappingMetadata) : null,
    printReadyVerifiedAt,
    printReadyVerifiedBy,
    clientNote,
    createdBy,
    updatedBy,
  ]);

  return getDesignOverrideById(result.insertId);
}

async function updateDesignOverrideById(overrideId, payload) {
  const sql = `
    UPDATE design_overrides
    SET
      is_hidden = ?,
      is_pinned = ?,
      is_print_ready = ?,
      linked_local_design_id = ?,
      mapping_status = ?,
      mapping_error = ?,
      mapping_metadata = ?,
      print_ready_verified_at = ?,
      print_ready_verified_by = ?,
      client_note = ?,
      updated_by = ?
    WHERE id = ?
  `;

  const [result] = await pool.query(sql, [
    payload.isHidden,
    payload.isPinned,
    payload.isPrintReady,
    payload.linkedLocalDesignId ?? null,
    payload.mappingStatus ?? "not_requested",
    payload.mappingError ?? null,
    payload.mappingMetadata ? JSON.stringify(payload.mappingMetadata) : null,
    payload.printReadyVerifiedAt ?? null,
    payload.printReadyVerifiedBy ?? null,
    payload.clientNote,
    payload.updatedBy,
    overrideId,
  ]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getDesignOverrideById(overrideId);
}

async function deleteDesignOverrideById(overrideId) {
  const sql = `
    DELETE FROM design_overrides
    WHERE id = ?
  `;

  const [result] = await pool.query(sql, [overrideId]);
  return result.affectedRows > 0;
}

async function getDesignOverridesByMmfObjectIds(mmfObjectIds) {
  if (!Array.isArray(mmfObjectIds) || mmfObjectIds.length === 0) {
    return [];
  }

  const normalizedIds = [...new Set(mmfObjectIds.map(Number))].filter(
    (value) => Number.isInteger(value) && value > 0,
  );

  if (normalizedIds.length === 0) {
    return [];
  }

  const placeholders = normalizedIds.map(() => "?").join(", ");

  const sql = `
    SELECT
      d.id,
      d.mmf_object_id,
      d.is_hidden,
      d.is_pinned,
      d.is_print_ready,
      d.linked_local_design_id,
      d.mapping_status,
      d.mapping_error,
      d.mapping_metadata,
      d.print_ready_verified_at,
      d.print_ready_verified_by,
      d.client_note,
      d.created_by,
      d.updated_by,
      d.created_at,
      d.updated_at,
      mprf.id AS print_ready_file_id,
      mprf.file_object_id AS print_ready_file_file_object_id,
      mprf.model_snapshot_file_object_id AS print_ready_file_model_snapshot_file_object_id,
      (SELECT public_path FROM file_objects WHERE id = mprf.file_object_id) AS print_ready_file_cached_file_url,
      (SELECT public_path FROM file_objects WHERE id = mprf.model_snapshot_file_object_id) AS print_ready_file_model_snapshot_url,
      mprf.original_file_name AS print_ready_file_original_file_name,
      mprf.extension AS print_ready_file_extension,
      mprf.file_size AS print_ready_file_size,
      mprf.status AS print_ready_file_status,
      mprf.verified_at AS print_ready_file_verified_at
    FROM design_overrides d
    LEFT JOIN mmf_print_ready_files mprf
      ON mprf.mmf_object_id = d.mmf_object_id
      AND mprf.status = 'cached'
      AND COALESCE(mprf.storage_status, 'present') = 'present'
      AND mprf.is_primary = TRUE
    WHERE d.mmf_object_id IN (${placeholders})
  `;

  const [rows] = await pool.query(sql, normalizedIds);
  return rows;
}

export {
  getAllDesignOverrides,
  listDesignOverridesForAdmin,
  getDesignOverrideById,
  getDesignOverrideByMmfObjectId,
  getDesignOverridesByMmfObjectIds,
  createDesignOverride,
  updateDesignOverrideById,
  deleteDesignOverrideById,
};

