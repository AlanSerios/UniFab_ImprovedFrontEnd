import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function normalizeQuoteAsset(row) {
  if (!row) return null;

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    sourceType: row.source_type,
    designId: row.design_id,
    fileObjectId: row.file_object_id,
    fileUrl: row.file_url,
    fileOriginalName: row.file_original_name,
    fileMimeType: row.file_mime_type,
    fileSize: row.file_size,
    thumbnailFileObjectId: row.thumbnail_file_object_id,
    thumbnailUrl: row.thumbnail_url,
    status: row.status,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getQuoteAssetById(quoteAssetId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        qa.*,
        fo.public_path AS file_url,
        tfo.public_path AS thumbnail_url
      FROM quote_assets qa
      LEFT JOIN file_objects fo ON fo.id = qa.file_object_id
      LEFT JOIN file_objects tfo ON tfo.id = qa.thumbnail_file_object_id
      WHERE qa.id = ?
      LIMIT 1
    `,
    [quoteAssetId],
  );

  return normalizeQuoteAsset(rows[0]);
}

async function createQuoteAsset(payload, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO quote_assets (
        owner_user_id,
        source_type,
        design_id,
        file_object_id,
        file_original_name,
        file_mime_type,
        file_size,
        thumbnail_file_object_id,
        status,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
    [
      payload.ownerUserId ?? null,
      payload.sourceType,
      payload.designId ?? null,
      payload.fileObjectId ?? null,
      payload.fileOriginalName ?? null,
      payload.fileMimeType ?? null,
      payload.fileSize ?? null,
      payload.thumbnailFileObjectId ?? null,
      payload.expiresAt,
    ],
  );

  return getQuoteAssetById(result.insertId, connection);
}

async function updateQuoteAssetExpiry(quoteAssetId, expiresAt, connection = null) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      UPDATE quote_assets
      SET expires_at = ?, status = 'active'
      WHERE id = ?
        AND status = 'active'
    `,
    [expiresAt, quoteAssetId],
  );

  return getQuoteAssetById(quoteAssetId, connection);
}

async function claimQuoteAssetForUser(quoteAssetId, userId, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE quote_assets
      SET owner_user_id = ?
      WHERE id = ?
        AND (owner_user_id IS NULL OR owner_user_id = ?)
    `,
    [userId, quoteAssetId, userId],
  );

  return result.affectedRows > 0;
}

async function markQuoteAssetUsed(quoteAssetId, connection = null) {
  if (!quoteAssetId) return false;

  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE quote_assets
      SET status = 'used', used_at = NOW()
      WHERE id = ?
        AND status = 'active'
    `,
    [quoteAssetId],
  );

  return result.affectedRows > 0;
}

async function markQuoteAssetExpired(quoteAssetId, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE quote_assets
      SET status = 'expired'
      WHERE id = ?
        AND status = 'active'
    `,
    [quoteAssetId],
  );

  return result.affectedRows > 0;
}

async function getExpiredUnusedQuoteAssets({
  limit = 100,
  graceHours = 0,
} = {}) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  const normalizedGraceHours =
    Number.isFinite(Number(graceHours)) && Number(graceHours) >= 0
      ? Number(graceHours)
      : 0;

  const [rows] = await pool.query(
    `
      SELECT
        qa.*,
        fo.public_path AS file_url,
        tfo.public_path AS thumbnail_url
      FROM quote_assets qa
      LEFT JOIN file_objects fo ON fo.id = qa.file_object_id
      LEFT JOIN file_objects tfo ON tfo.id = qa.thumbnail_file_object_id
      WHERE qa.status = 'active'
        AND qa.expires_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND NOT EXISTS (
          SELECT 1
          FROM quote_records qr
          INNER JOIN cart_items ci ON ci.quote_record_id = qr.id
          WHERE qr.quote_asset_id = qa.id
            AND ci.status = 'active'
            AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM quote_records qr
          WHERE qr.quote_asset_id = qa.id
            AND qr.used_at IS NOT NULL
        )
      ORDER BY qa.expires_at ASC, qa.id ASC
      LIMIT ?
    `,
    [normalizedGraceHours, normalizedLimit],
  );

  return rows.map(normalizeQuoteAsset);
}

async function deleteUnusedQuoteRecordsForAsset(quoteAssetId, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      DELETE FROM quote_records
      WHERE quote_asset_id = ?
        AND used_at IS NULL
    `,
    [quoteAssetId],
  );

  return result.affectedRows;
}

export {
  claimQuoteAssetForUser,
  createQuoteAsset,
  deleteUnusedQuoteRecordsForAsset,
  getExpiredUnusedQuoteAssets,
  getQuoteAssetById,
  markQuoteAssetExpired,
  markQuoteAssetUsed,
  updateQuoteAssetExpiry,
};
