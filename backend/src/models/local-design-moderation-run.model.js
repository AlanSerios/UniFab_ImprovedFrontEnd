import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function stringifyJson(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeModerationRun(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    localDesignId: Number(row.local_design_id),
    triggerKind: row.trigger_kind,
    actorId: row.actor_id,
    actorType: row.actor_type,
    status: row.status,
    provider: row.provider,
    moderationModel: row.moderation_model,
    policyModel: row.policy_model,
    policyVersion: row.policy_version,
    contentHash: row.content_hash,
    finalDecision: row.final_decision,
    summary: row.summary,
    feedback: row.feedback,
    flags: parseJson(row.flags) || [],
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeModerationRunItem(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    localDesignId: Number(row.local_design_id),
    itemType: row.item_type,
    localDesignFileId: row.local_design_file_id,
    localDesignImageId: row.local_design_image_id,
    fileObjectId: row.file_object_id,
    label: row.label,
    inputHash: row.input_hash,
    status: row.status,
    provider: row.provider,
    model: row.model,
    categories: parseJson(row.categories),
    categoryScores: parseJson(row.category_scores),
    policyResult: parseJson(row.policy_result),
    summary: row.summary,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createLocalDesignModerationRun(
  {
    localDesignId,
    triggerKind,
    actorId = null,
    actorType = "system",
    provider = "openai",
    moderationModel,
    policyModel = null,
    policyVersion,
    contentHash,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO local_design_moderation_runs (
        local_design_id,
        trigger_kind,
        actor_id,
        actor_type,
        status,
        provider,
        moderation_model,
        policy_model,
        policy_version,
        content_hash,
        queued_at
      )
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NOW())
    `,
    [
      localDesignId,
      triggerKind,
      actorId,
      actorType,
      provider,
      moderationModel,
      policyModel,
      policyVersion,
      contentHash,
    ],
  );

  return getLocalDesignModerationRunById(result.insertId, connection);
}

async function getLocalDesignModerationRunById(runId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT *
      FROM local_design_moderation_runs
      WHERE id = ?
      LIMIT 1
    `,
    [runId],
  );

  return normalizeModerationRun(rows[0]);
}

async function listLocalDesignModerationRuns(
  { localDesignId, limit = 10 },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT *
      FROM local_design_moderation_runs
      WHERE local_design_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [localDesignId, Math.min(Math.max(Number(limit) || 10, 1), 50)],
  );

  return rows.map(normalizeModerationRun);
}

async function listLocalDesignModerationRunItems(runId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT *
      FROM local_design_moderation_run_items
      WHERE run_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [runId],
  );

  return rows.map(normalizeModerationRunItem);
}

async function listPendingLocalDesignModerationRunIds({
  limit = 25,
} = {}) {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM local_design_moderation_runs
      WHERE status IN ('pending', 'running')
      ORDER BY queued_at ASC, id ASC
      LIMIT ?
    `,
    [Math.min(Math.max(Number(limit) || 25, 1), 100)],
  );

  return rows.map((row) => Number(row.id));
}

async function markLocalDesignModerationRunRunning(runId) {
  const [result] = await pool.query(
    `
      UPDATE local_design_moderation_runs
      SET status = 'running',
          started_at = COALESCE(started_at, NOW()),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status IN ('pending', 'running')
    `,
    [runId],
  );

  return result.affectedRows > 0
    ? getLocalDesignModerationRunById(runId)
    : null;
}

async function completeLocalDesignModerationRun(
  {
    runId,
    finalDecision,
    summary,
    feedback = null,
    flags = [],
    errorMessage = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_design_moderation_runs
      SET status = 'completed',
          final_decision = ?,
          summary = ?,
          feedback = ?,
          flags = ?,
          error_message = ?,
          completed_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      finalDecision,
      summary,
      feedback,
      stringifyJson(flags),
      errorMessage,
      runId,
    ],
  );

  return result.affectedRows > 0
    ? getLocalDesignModerationRunById(runId, connection)
    : null;
}

async function failLocalDesignModerationRun(
  { runId, summary, feedback = null, flags = [], errorMessage },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE local_design_moderation_runs
      SET status = 'failed',
          final_decision = 'needs_admin_review',
          summary = ?,
          feedback = ?,
          flags = ?,
          error_message = ?,
          completed_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [summary, feedback, stringifyJson(flags), errorMessage, runId],
  );

  return result.affectedRows > 0
    ? getLocalDesignModerationRunById(runId, connection)
    : null;
}

async function createLocalDesignModerationRunItem(
  {
    runId,
    localDesignId,
    itemType,
    localDesignFileId = null,
    localDesignImageId = null,
    fileObjectId = null,
    label,
    inputHash,
    status,
    provider = "openai",
    model = null,
    categories = null,
    categoryScores = null,
    policyResult = null,
    summary = null,
    errorMessage = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO local_design_moderation_run_items (
        run_id,
        local_design_id,
        item_type,
        local_design_file_id,
        local_design_image_id,
        file_object_id,
        label,
        input_hash,
        status,
        provider,
        model,
        categories,
        category_scores,
        policy_result,
        summary,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runId,
      localDesignId,
      itemType,
      localDesignFileId,
      localDesignImageId,
      fileObjectId,
      label,
      inputHash,
      status,
      provider,
      model,
      stringifyJson(categories),
      stringifyJson(categoryScores),
      stringifyJson(policyResult),
      summary,
      errorMessage,
    ],
  );

  const [rows] = await executor.query(
    `
      SELECT *
      FROM local_design_moderation_run_items
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId],
  );

  return normalizeModerationRunItem(rows[0]);
}

export {
  completeLocalDesignModerationRun,
  createLocalDesignModerationRun,
  createLocalDesignModerationRunItem,
  failLocalDesignModerationRun,
  getLocalDesignModerationRunById,
  listLocalDesignModerationRunItems,
  listLocalDesignModerationRuns,
  listPendingLocalDesignModerationRunIds,
  markLocalDesignModerationRunRunning,
};
