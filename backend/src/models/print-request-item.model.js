import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function serializeJson(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

const PRINT_REQUEST_ITEM_SELECT = `
  pri.*,
  (SELECT public_path FROM file_objects WHERE id = pri.file_object_id) AS file_url,
  (SELECT public_path FROM file_objects WHERE id = pri.thumbnail_file_object_id) AS thumbnail_url
`;

async function createPrintRequestItem(payload, connection = null) {
  const executor = getExecutor(connection);

  const sql = `
    INSERT INTO print_request_items (
      print_request_id,
      source_type,
      design_id,
      file_object_id,
      file_original_name,
      file_mime_type,
      file_size,
      thumbnail_file_object_id,
      design_snapshot,
      quote_token,
      quote_snapshot,
      pricing_config_snapshot,
      material_snapshot,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      estimated_cost,
      confirmed_cost
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    payload.printRequestId,
    payload.sourceType,
    payload.designId ?? null,
    payload.fileObjectId ?? null,
    payload.fileOriginalName ?? null,
    payload.fileMimeType ?? null,
    payload.fileSize ?? null,
    payload.thumbnailFileObjectId ?? null,
    serializeJson(payload.designSnapshot),
    payload.quoteToken ?? null,
    serializeJson(payload.quoteSnapshot),
    serializeJson(payload.pricingConfigSnapshot),
    serializeJson(payload.materialSnapshot),
    payload.material,
    payload.materialColorId ?? null,
    payload.materialColorName ?? null,
    payload.materialColorHex ?? null,
    payload.printQuality,
    payload.infill,
    payload.quantity,
    payload.estimatedCost,
    payload.confirmedCost ?? null,
  ]);

  return getPrintRequestItemById(result.insertId, connection);
}

async function getPrintRequestItemById(itemId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT *
      FROM (
        SELECT ${PRINT_REQUEST_ITEM_SELECT}
        FROM print_request_items pri
        WHERE pri.id = ?
      ) normalized_print_request_items
      LIMIT 1
    `,
    [itemId],
  );

  return rows[0] || null;
}

async function getPrintRequestItemsByRequestId(requestId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${PRINT_REQUEST_ITEM_SELECT}
      FROM print_request_items pri
      WHERE pri.print_request_id = ?
      ORDER BY id ASC
    `,
    [requestId],
  );

  return rows;
}

async function getPrintRequestItemForRequest(
  requestId,
  itemId,
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT ${PRINT_REQUEST_ITEM_SELECT}
      FROM print_request_items pri
      WHERE pri.print_request_id = ? AND pri.id = ?
      LIMIT 1
    `,
    [requestId, itemId],
  );

  return rows[0] || null;
}

async function updatePrintRequestItemConfirmedCosts(
  requestId,
  itemCosts = [],
  connection = null,
) {
  const executor = getExecutor(connection);

  for (const itemCost of itemCosts) {
    await executor.query(
      `
        UPDATE print_request_items
        SET confirmed_cost = ?
        WHERE print_request_id = ? AND id = ?
      `,
      [itemCost.confirmedCost, requestId, itemCost.itemId],
    );
  }

  return getPrintRequestItemsByRequestId(requestId, connection);
}

export {
  createPrintRequestItem,
  getPrintRequestItemById,
  getPrintRequestItemForRequest,
  getPrintRequestItemsByRequestId,
  updatePrintRequestItemConfirmedCosts,
};
