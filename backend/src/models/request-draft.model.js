import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function normalizeRequestDraft(row) {
  if (!row) return null;

  return {
    id: row.id,
    draft_token: row.draft_token,
    user_id: row.user_id,
    status: row.status,
    source: row.source,
    cart_item_ids: row.cart_item_ids
      ? String(row.cart_item_ids)
          .split(",")
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [],
    expires_at: row.expires_at,
    submitted_print_request_id: row.submitted_print_request_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createRequestDraft(
  {
    draftToken,
    userId,
    source,
    cartItemIds,
    expiresAt,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO request_drafts (
        draft_token,
        user_id,
        status,
        source,
        expires_at
      )
      VALUES (?, ?, 'active', ?, ?)
    `,
    [
      draftToken,
      userId,
      source,
      expiresAt,
    ],
  );

  for (const cartItemId of cartItemIds) {
    await executor.query(
      `
        INSERT INTO request_draft_items (draft_id, cart_item_id)
        VALUES (?, ?)
      `,
      [result.insertId, cartItemId],
    );
  }

  return getRequestDraftById(result.insertId, connection);
}

async function getRequestDraftById(draftId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        rd.*,
        (
          SELECT GROUP_CONCAT(rdi.cart_item_id ORDER BY rdi.cart_item_id ASC)
          FROM request_draft_items rdi
          WHERE rdi.draft_id = rd.id
        ) AS cart_item_ids
      FROM request_drafts rd
      WHERE rd.id = ?
      LIMIT 1
    `,
    [draftId],
  );

  return normalizeRequestDraft(rows[0]);
}

async function getRequestDraftByTokenForUser(
  { draftToken, userId },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        rd.*,
        (
          SELECT GROUP_CONCAT(rdi.cart_item_id ORDER BY rdi.cart_item_id ASC)
          FROM request_draft_items rdi
          WHERE rdi.draft_id = rd.id
        ) AS cart_item_ids
      FROM request_drafts rd
      WHERE rd.draft_token = ?
        AND rd.user_id = ?
      LIMIT 1
    `,
    [draftToken, userId],
  );

  return normalizeRequestDraft(rows[0]);
}

async function markRequestDraftSubmitted(
  { draftId, printRequestId },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE request_drafts
      SET status = 'submitted',
        submitted_print_request_id = ?
      WHERE id = ?
        AND status = 'active'
        AND expires_at > NOW()
    `,
    [printRequestId, draftId],
  );

  return result.affectedRows > 0;
}

export {
  createRequestDraft,
  getRequestDraftByTokenForUser,
  markRequestDraftSubmitted,
};
