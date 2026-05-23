import pool from "../db/db.js";

async function createSlicerProfileValidationEvent(payload) {
  const sql = `
    INSERT INTO slicer_profile_validation_events (
      material_id,
      material_key,
      quality,
      profile_original_name,
      profile_filename,
      status,
      message,
      uploaded_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    payload.materialId ?? null,
    payload.materialKey,
    payload.quality,
    payload.profileOriginalName ?? null,
    payload.profileFilename ?? null,
    payload.status,
    payload.message ?? null,
    payload.uploadedBy ?? null,
  ]);

  return result.insertId;
}

async function listRecentSlicerProfileValidationEvents({ limit = 20 } = {}) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;

  const sql = `
    SELECT
      spve.id,
      spve.material_id,
      spve.material_key,
      spve.quality,
      spve.profile_original_name,
      spve.profile_filename,
      spve.status,
      spve.message,
      spve.uploaded_by,
      u.email AS uploaded_by_email,
      spve.created_at
    FROM slicer_profile_validation_events spve
    LEFT JOIN users u ON u.id = spve.uploaded_by
    ORDER BY spve.created_at DESC, spve.id DESC
    LIMIT ?
  `;

  const [rows] = await pool.query(sql, [normalizedLimit]);
  return rows;
}

export {
  createSlicerProfileValidationEvent,
  listRecentSlicerProfileValidationEvents,
};
