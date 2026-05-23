import pool from "../db/db.js";

async function getActiveSlicerProfile(materialId, quality) {
  const sql = `
    SELECT
      id,
      material_id,
      quality,
      printer_name,
      nozzle,
      support_rule,
      orientation_rule,
      profile_filename,
      file_object_id,
      version_number,
      is_active,
      validation_status,
      validation_message,
      validated_at,
      uploaded_by,
      created_at,
      updated_at
    FROM slicer_profiles
    WHERE material_id = ? AND quality = ? AND is_active = TRUE
    ORDER BY version_number DESC
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [materialId, quality]);
  return rows[0] || null;
}

async function listSlicerProfilesForAdmin() {
  const sql = `
    SELECT
      sp.id,
      sp.material_id,
      m.material_key,
      m.display_name AS material_display_name,
      m.is_active AS material_is_active,
      sp.quality,
      sp.printer_name,
      sp.nozzle,
      sp.support_rule,
      sp.orientation_rule,
      sp.profile_filename,
      sp.file_object_id,
      sp.version_number,
      sp.is_active,
      sp.validation_status,
      sp.validation_message,
      sp.validated_at,
      sp.uploaded_by,
      sp.created_at,
      sp.updated_at
    FROM slicer_profiles sp
    INNER JOIN materials m ON m.id = sp.material_id
    ORDER BY
      m.display_name ASC,
      m.material_key ASC,
      sp.quality ASC,
      sp.version_number DESC
  `;

  const [rows] = await pool.query(sql);
  return rows;
}

export { getActiveSlicerProfile, listSlicerProfilesForAdmin };
