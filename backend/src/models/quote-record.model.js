import crypto from "crypto";
import pool from "../db/db.js";

const QUOTE_TOKEN_BYTES = 32;

function getExecutor(connection) {
  return connection || pool;
}

function createQuoteToken() {
  return crypto.randomBytes(QUOTE_TOKEN_BYTES).toString("hex");
}

function hashQuoteToken(quoteToken) {
  return crypto.createHash("sha256").update(String(quoteToken)).digest("hex");
}

function serializeJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

async function createQuoteRecord(payload, connection = null) {
  const executor = getExecutor(connection);
  const quoteToken = createQuoteToken();
  const quoteTokenHash = hashQuoteToken(quoteToken);

  const sql = `
    INSERT INTO quote_records (
      quote_token_hash,
      quote_asset_id,
      owner_user_id,
      source_type,
      design_id,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      thumbnail_file_object_id,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      estimated_cost,
      design_snapshot,
      quote_snapshot,
      pricing_config_snapshot,
      material_snapshot,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    quoteTokenHash,
    payload.quoteAssetId ?? null,
    payload.ownerUserId ?? null,
    payload.sourceType,
    payload.designId ?? null,
    payload.fileObjectId ?? null,
    payload.fileOriginalName ?? null,
    payload.fileMimeType ?? null,
    payload.fileSize ?? null,
    payload.thumbnailFileObjectId ?? null,
    payload.material,
    payload.materialColorId ?? null,
    payload.materialColorName ?? null,
    payload.materialColorHex ?? null,
    payload.printQuality,
    payload.infill,
    payload.quantity,
    payload.estimatedCost,
    serializeJson(payload.designSnapshot),
    serializeJson(payload.quoteSnapshot),
    serializeJson(payload.pricingConfigSnapshot),
    serializeJson(payload.materialSnapshot),
    payload.expiresAt,
  ]);

  const quoteRecord = await getQuoteRecordById(result.insertId, connection);

  return {
    quoteToken,
    quoteRecord,
  };
}

async function getQuoteRecordById(quoteRecordId, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    SELECT
      id,
      quote_token_hash,
      quote_asset_id,
      owner_user_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = quote_records.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      (SELECT public_path FROM file_objects WHERE id = quote_records.thumbnail_file_object_id) AS thumbnail_url,
      thumbnail_file_object_id,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      estimated_cost,
      design_snapshot,
      quote_snapshot,
      pricing_config_snapshot,
      material_snapshot,
      expires_at,
      used_at,
      created_at,
      updated_at
    FROM quote_records
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [quoteRecordId]);
  return rows[0] || null;
}

async function getValidQuoteRecordByToken(quoteToken, connection = null) {
  const executor = getExecutor(connection);
  const quoteTokenHash = hashQuoteToken(quoteToken);

  const sql = `
    SELECT
      id,
      quote_token_hash,
      quote_asset_id,
      owner_user_id,
      source_type,
      design_id,
      (SELECT public_path FROM file_objects WHERE id = quote_records.file_object_id) AS file_url,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      (SELECT public_path FROM file_objects WHERE id = quote_records.thumbnail_file_object_id) AS thumbnail_url,
      thumbnail_file_object_id,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      estimated_cost,
      design_snapshot,
      quote_snapshot,
      pricing_config_snapshot,
      material_snapshot,
      expires_at,
      used_at,
      created_at,
      updated_at
    FROM quote_records
    WHERE quote_token_hash = ?
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [quoteTokenHash]);
  return rows[0] || null;
}

async function getReusableUploadQuoteRecordByToken(
  quoteToken,
  connection = null,
) {
  const executor = getExecutor(connection);
  const quoteTokenHash = hashQuoteToken(quoteToken);

  const sql = `
    SELECT
      qr.id,
      qr.quote_token_hash,
      qr.quote_asset_id,
      qr.owner_user_id,
      qr.source_type,
      qr.design_id,
      fo.public_path AS file_url,
      qr.file_object_id,
      qr.file_original_name,
      qr.file_mime_type,
      qr.file_size,
      tfo.public_path AS thumbnail_url,
      qr.thumbnail_file_object_id,
      qr.material,
      qr.material_color_id,
      qr.material_color_name,
      qr.material_color_hex,
      qr.print_quality,
      qr.infill,
      qr.quantity,
      qr.estimated_cost,
      qr.design_snapshot,
      qr.quote_snapshot,
      qr.pricing_config_snapshot,
      qr.material_snapshot,
      qr.expires_at,
      qr.used_at,
      qr.created_at,
      qr.updated_at,
      fo.storage_key AS file_storage_key,
      fo.storage_status AS file_storage_status,
      fo.deleted_at AS file_deleted_at
    FROM quote_records qr
    LEFT JOIN file_objects fo ON fo.id = qr.file_object_id
    LEFT JOIN file_objects tfo ON tfo.id = qr.thumbnail_file_object_id
    WHERE qr.quote_token_hash = ?
      AND qr.source_type = 'upload'
      AND qr.used_at IS NULL
      AND qr.expires_at > NOW()
      AND qr.file_object_id IS NOT NULL
      AND fo.storage_status = 'present'
      AND fo.deleted_at IS NULL
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [quoteTokenHash]);
  return rows[0] || null;
}

async function claimQuoteRecordForUser(quoteRecordId, userId, connection = null) {
  const executor = getExecutor(connection);

  const [result] = await executor.query(
    `
      UPDATE quote_records
      SET owner_user_id = ?
      WHERE id = ?
        AND (owner_user_id IS NULL OR owner_user_id = ?)
    `,
    [userId, quoteRecordId, userId],
  );

  if (result.affectedRows === 0) {
    return false;
  }

  await executor.query(
    `
      UPDATE file_references
      SET owner_user_id = ?
      WHERE reference_type = 'quote_record'
        AND reference_id = ?
        AND status = 'active'
    `,
    [userId, quoteRecordId],
  );

  await executor.query(
    `
      UPDATE quote_assets qa
      INNER JOIN quote_records qr ON qr.quote_asset_id = qa.id
      SET qa.owner_user_id = ?
      WHERE qr.id = ?
        AND (qa.owner_user_id IS NULL OR qa.owner_user_id = ?)
    `,
    [userId, quoteRecordId, userId],
  );

  await executor.query(
    `
      UPDATE file_references fr
      INNER JOIN quote_records qr
        ON qr.quote_asset_id = fr.reference_id
      SET fr.owner_user_id = ?
      WHERE qr.id = ?
        AND fr.reference_type = 'quote_asset'
        AND fr.status = 'active'
    `,
    [userId, quoteRecordId],
  );

  return true;
}

async function markQuoteRecordUsed(quoteRecordId, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    UPDATE quote_records
    SET used_at = NOW()
    WHERE id = ? AND used_at IS NULL
  `;

  const [result] = await executor.query(sql, [quoteRecordId]);
  return result.affectedRows > 0;
}

async function getExpiredUnusedQuoteRecords({
  limit = 100,
  graceHours = 0,
} = {}) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  const normalizedGraceHours =
    Number.isFinite(Number(graceHours)) && Number(graceHours) >= 0
      ? Number(graceHours)
      : 0;

  const sql = `
    SELECT
      id,
      quote_asset_id,
      source_type,
      owner_user_id,
      (SELECT public_path FROM file_objects WHERE id = quote_records.file_object_id) AS file_url,
      file_object_id,
      (SELECT public_path FROM file_objects WHERE id = quote_records.thumbnail_file_object_id) AS thumbnail_url,
      thumbnail_file_object_id,
      expires_at,
      created_at
    FROM quote_records
    WHERE used_at IS NULL
      AND quote_asset_id IS NULL
      AND expires_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
      AND NOT EXISTS (
        SELECT 1
        FROM cart_items ci
        WHERE ci.quote_record_id = quote_records.id
          AND ci.status = 'active'
          AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
    ORDER BY expires_at ASC, id ASC
    LIMIT ?
  `;

  const [rows] = await pool.query(sql, [normalizedGraceHours, normalizedLimit]);
  return rows;
}

async function deleteQuoteRecordById(quoteRecordId, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    DELETE FROM quote_records
    WHERE id = ?
  `;

  const [result] = await executor.query(sql, [quoteRecordId]);
  return result.affectedRows > 0;
}

export {
  claimQuoteRecordForUser,
  createQuoteRecord,
  getReusableUploadQuoteRecordByToken,
  getValidQuoteRecordByToken,
  markQuoteRecordUsed,
  getExpiredUnusedQuoteRecords,
  deleteQuoteRecordById,
};
