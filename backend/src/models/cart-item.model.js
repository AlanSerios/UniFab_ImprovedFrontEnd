import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

const QUOTE_RECORD_COLUMNS = `
  qr.id AS quote_record_id,
  qr.quote_asset_id,
  qr.owner_user_id,
  qr.source_type,
  qr.design_id,
  (SELECT public_path FROM file_objects WHERE id = qr.file_object_id) AS file_url,
  qr.file_object_id,
  qr.file_original_name,
  qr.file_mime_type,
  qr.file_size,
  (SELECT public_path FROM file_objects WHERE id = qr.thumbnail_file_object_id) AS thumbnail_url,
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
  qr.created_at AS quote_created_at,
  qr.updated_at AS quote_updated_at
`;

function normalizeCartRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    quote_record_id: row.quote_record_id,
    status: row.status,
    submitted_at: row.submitted_at,
    removed_at: row.removed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    quoteRecord: {
      id: row.quote_record_id,
      quote_asset_id: row.quote_asset_id,
      owner_user_id: row.owner_user_id,
      source_type: row.source_type,
      design_id: row.design_id,
      file_url: row.file_url,
      file_object_id: row.file_object_id,
      file_original_name: row.file_original_name,
      file_mime_type: row.file_mime_type,
      file_size: row.file_size,
      thumbnail_url: row.thumbnail_url,
      thumbnail_file_object_id: row.thumbnail_file_object_id,
      material: row.material,
      material_color_id: row.material_color_id,
      material_color_name: row.material_color_name,
      material_color_hex: row.material_color_hex,
      print_quality: row.print_quality,
      infill: row.infill,
      quantity: row.quantity,
      estimated_cost: row.estimated_cost,
      design_snapshot: row.design_snapshot,
      quote_snapshot: row.quote_snapshot,
      pricing_config_snapshot: row.pricing_config_snapshot,
      material_snapshot: row.material_snapshot,
      expires_at: row.expires_at,
      used_at: row.used_at,
      created_at: row.quote_created_at,
      updated_at: row.quote_updated_at,
    },
  };
}

async function upsertCartItem({ userId, quoteRecordId }, connection = null) {
  const executor = getExecutor(connection);

  await executor.query(
    `
      INSERT INTO cart_items (user_id, quote_record_id, status, submitted_at, removed_at)
      VALUES (?, ?, 'active', NULL, NULL)
      ON DUPLICATE KEY UPDATE
        status = 'active',
        submitted_at = NULL,
        removed_at = NULL,
        created_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId, quoteRecordId],
  );
}

async function getActiveCartItemForQuoteRecord(
  { userId, quoteRecordId },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        ci.*,
        ${QUOTE_RECORD_COLUMNS}
      FROM cart_items ci
      INNER JOIN quote_records qr ON qr.id = ci.quote_record_id
      WHERE ci.user_id = ?
        AND ci.quote_record_id = ?
        AND ci.status = 'active'
      LIMIT 1
    `,
    [userId, quoteRecordId],
  );

  return normalizeCartRow(rows[0]);
}

async function listActiveCartItemsForUser({
  userId,
  retentionDays = 30,
} = {}, connection = null) {
  const executor = getExecutor(connection);
  const normalizedRetentionDays =
    Number.isInteger(Number(retentionDays)) && Number(retentionDays) > 0
      ? Number(retentionDays)
      : 30;
  const [rows] = await executor.query(
    `
      SELECT
        ci.*,
        ${QUOTE_RECORD_COLUMNS}
      FROM cart_items ci
      INNER JOIN quote_records qr ON qr.id = ci.quote_record_id
      WHERE ci.user_id = ?
        AND ci.status = 'active'
        AND ci.created_at >= DATE_SUB(NOW(), INTERVAL ${normalizedRetentionDays} DAY)
      ORDER BY ci.created_at ASC, ci.id ASC
    `,
    [userId],
  );

  return rows.map(normalizeCartRow);
}

async function removeCartItemForUser({ userId, cartItemId }, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE cart_items
      SET status = 'removed', removed_at = NOW()
      WHERE user_id = ?
        AND id = ?
        AND status = 'active'
    `,
    [userId, cartItemId],
  );

  return result.affectedRows > 0;
}

async function clearActiveCartForUser({ userId }, connection = null) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE cart_items
      SET status = 'removed', removed_at = NOW()
      WHERE user_id = ?
        AND status = 'active'
    `,
    [userId],
  );

  return result.affectedRows;
}

async function markCartItemsSubmittedForUser(
  { userId, quoteRecordIds },
  connection = null,
) {
  if (!quoteRecordIds.length) return 0;

  const executor = getExecutor(connection);
  const placeholders = quoteRecordIds.map(() => "?").join(", ");
  const [result] = await executor.query(
    `
      UPDATE cart_items
      SET status = 'submitted', submitted_at = NOW()
      WHERE user_id = ?
        AND status = 'active'
        AND quote_record_id IN (${placeholders})
    `,
    [userId, ...quoteRecordIds],
  );

  return result.affectedRows;
}

export {
  clearActiveCartForUser,
  getActiveCartItemForQuoteRecord,
  listActiveCartItemsForUser,
  markCartItemsSubmittedForUser,
  removeCartItemForUser,
  upsertCartItem,
};
