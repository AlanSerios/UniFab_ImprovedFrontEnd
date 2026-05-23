import pool from "../db/db.js";

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;

  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(row.created_at).toISOString(),
      id: Number(row.id),
    }),
  ).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const id = Number(parsed.id);
    const createdAt = new Date(parsed.createdAt);

    if (!Number.isInteger(id) || id < 1 || Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}

async function createQuoteAttempt(payload) {
  const sql = `
    INSERT INTO quote_attempts (
      source_type,
      source_identifier,
      user_id,
      material,
      material_color_id,
      material_color_name,
      material_color_hex,
      print_quality,
      infill,
      quantity,
      file_original_name,
      status,
      error_status_code,
      error_message,
      quote_record_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    payload.sourceType,
    payload.sourceIdentifier ?? null,
    payload.userId ?? null,
    payload.material ?? null,
    payload.materialColorId ?? null,
    payload.materialColorName ?? null,
    payload.materialColorHex ?? null,
    payload.printQuality ?? null,
    payload.infill ?? null,
    payload.quantity ?? null,
    payload.fileOriginalName ?? null,
    payload.status,
    payload.errorStatusCode ?? null,
    payload.errorMessage ?? null,
    payload.quoteRecordId ?? null,
  ]);

  return result.insertId;
}

async function listQuoteAttempts({
  limit = 50,
  offset = 0,
  status,
  cursor,
} = {}) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
  const decodedCursor = decodeCursor(cursor);
  const normalizedOffset =
    decodedCursor || !Number.isInteger(offset) || offset < 0 ? 0 : offset;
  const params = [];
  const where = [];

  if (status === "success" || status === "failed") {
    where.push("qa.status = ?");
    params.push(status);
  }

  if (decodedCursor) {
    where.push("(qa.created_at < ? OR (qa.created_at = ? AND qa.id < ?))");
    params.push(decodedCursor.createdAt, decodedCursor.createdAt, decodedCursor.id);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      qa.id,
      qa.source_type,
      qa.source_identifier,
      qa.user_id,
      u.email AS user_email,
      qa.material,
      qa.material_color_id,
      qa.material_color_name,
      qa.material_color_hex,
      qa.print_quality,
      qa.infill,
      qa.quantity,
      qa.file_original_name,
      qa.status,
      qa.error_status_code,
      qa.error_message,
      qa.quote_record_id,
      qa.created_at
    FROM quote_attempts qa
    LEFT JOIN users u ON u.id = qa.user_id
    ${whereSql}
    ORDER BY qa.created_at DESC, qa.id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(sql, [
    ...params,
    normalizedLimit,
    normalizedOffset,
  ]);
  return {
    rows,
    nextCursor:
      rows.length === normalizedLimit ? encodeCursor(rows[rows.length - 1]) : null,
    limit: normalizedLimit,
    offset: normalizedOffset,
  };
}

async function deleteOldQuoteAttempts({ retentionDays = 30 } = {}) {
  const normalizedRetentionDays =
    Number.isInteger(Number(retentionDays)) && Number(retentionDays) > 0
      ? Number(retentionDays)
      : 30;
  const [result] = await pool.query(
    `
      DELETE FROM quote_attempts
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `,
    [normalizedRetentionDays],
  );

  return result.affectedRows;
}

export { createQuoteAttempt, deleteOldQuoteAttempts, listQuoteAttempts };
