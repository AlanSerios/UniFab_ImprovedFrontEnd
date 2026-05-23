import pool from "../db/db.js";

async function getIntegrationToken(provider) {
  const sql = `
    SELECT
      id,
      provider,
      access_token_encrypted,
      refresh_token_encrypted,
      token_type,
      expires_at,
      scope,
      account_user_id,
      connected_by,
      created_at,
      updated_at
    FROM external_integration_tokens
    WHERE provider = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [provider]);
  return rows[0] || null;
}

async function upsertIntegrationToken({
  provider,
  accessTokenEncrypted,
  refreshTokenEncrypted,
  tokenType = "Bearer",
  expiresAt = null,
  scope = null,
  accountUserId = null,
  connectedBy = null,
}) {
  const sql = `
    INSERT INTO external_integration_tokens (
      provider,
      access_token_encrypted,
      refresh_token_encrypted,
      token_type,
      expires_at,
      scope,
      account_user_id,
      connected_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      access_token_encrypted = VALUES(access_token_encrypted),
      refresh_token_encrypted = VALUES(refresh_token_encrypted),
      token_type = VALUES(token_type),
      expires_at = VALUES(expires_at),
      scope = VALUES(scope),
      account_user_id = VALUES(account_user_id),
      connected_by = VALUES(connected_by),
      updated_at = CURRENT_TIMESTAMP
  `;

  await pool.query(sql, [
    provider,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenType,
    expiresAt,
    scope,
    accountUserId,
    connectedBy,
  ]);

  return getIntegrationToken(provider);
}

async function deleteIntegrationToken(provider) {
  const sql = `
    DELETE FROM external_integration_tokens
    WHERE provider = ?
  `;

  const [result] = await pool.query(sql, [provider]);
  return result.affectedRows > 0;
}

export {
  deleteIntegrationToken,
  getIntegrationToken,
  upsertIntegrationToken,
};
