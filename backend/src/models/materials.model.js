import pool from "../db/db.js";

async function getMaterialByKey(materialKey) {
  const sql = `
    SELECT
      id,
      material_key,
      display_name,
      material_cost_per_gram,
      is_active,
      created_at,
      updated_at
    FROM materials
    WHERE material_key = ? AND is_active = TRUE
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [materialKey]);
  return rows[0] || null;
}

async function getMaterialByKeyForAdmin(materialKey) {
  const sql = `
    SELECT
      id,
      material_key,
      display_name,
      material_cost_per_gram,
      is_active,
      created_at,
      updated_at
    FROM materials
    WHERE material_key = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [materialKey]);
  return rows[0] || null;
}

async function getActiveMaterialColors(materialId, connection = null) {
  const executor = connection || pool;
  const sql = `
    SELECT
      id,
      material_id,
      color_name,
      hex_code,
      is_active,
      display_order,
      created_at,
      updated_at
    FROM material_colors
    WHERE material_id = ? AND is_active = TRUE
    ORDER BY display_order ASC, color_name ASC
  `;

  const [rows] = await executor.query(sql, [materialId]);
  return rows;
}

async function getActiveMaterialColorById(materialId, colorId) {
  const sql = `
    SELECT
      id,
      material_id,
      color_name,
      hex_code,
      is_active,
      display_order,
      created_at,
      updated_at
    FROM material_colors
    WHERE material_id = ? AND id = ? AND is_active = TRUE
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [materialId, colorId]);
  return rows[0] || null;
}

async function listActiveMaterialsForQuote() {
  const sql = `
    SELECT
      m.material_key,
      m.display_name,
      COALESCE(
        (
          SELECT CONCAT(
            '[',
            COALESCE(
              GROUP_CONCAT(
                JSON_OBJECT(
                  'id', mc.id,
                  'name', mc.color_name,
                  'hexCode', mc.hex_code
                )
                ORDER BY mc.display_order ASC, mc.color_name ASC
                SEPARATOR ','
              ),
              ''
            ),
            ']'
          )
          FROM material_colors mc
          WHERE mc.material_id = m.id AND mc.is_active = TRUE
        ),
        '[]'
      ) AS colors,
      COALESCE(
        JSON_ARRAYAGG(
          CASE
            WHEN sp.id IS NULL THEN NULL
            ELSE sp.quality
          END
        ),
        JSON_ARRAY()
      ) AS ready_qualities
    FROM materials m
    LEFT JOIN slicer_profiles sp
      ON sp.material_id = m.id
      AND sp.is_active = TRUE
      AND COALESCE(sp.validation_status, 'not_run') <> 'failed'
    WHERE m.is_active = TRUE
    GROUP BY m.id, m.material_key, m.display_name
    ORDER BY m.display_name ASC, m.material_key ASC
  `;

  const [rows] = await pool.query(sql);
  return rows.map((row) => ({
    ...row,
    colors: normalizeJsonArray(row.colors),
    ready_qualities: normalizeJsonArray(row.ready_qualities).filter(Boolean),
  }));
}

async function listMaterialsForAdmin() {
  const sql = `
    SELECT
      id,
      material_key,
      display_name,
      material_cost_per_gram,
      is_active,
      COALESCE(
        (
          SELECT CONCAT(
            '[',
            COALESCE(
              GROUP_CONCAT(
                JSON_OBJECT(
                  'id', mc.id,
                  'name', mc.color_name,
                  'hexCode', mc.hex_code,
                  'isActive', CAST(mc.is_active AS UNSIGNED),
                  'displayOrder', mc.display_order
                )
                ORDER BY mc.display_order ASC, mc.color_name ASC
                SEPARATOR ','
              ),
              ''
            ),
            ']'
          )
          FROM material_colors mc
          WHERE mc.material_id = materials.id
        ),
        '[]'
      ) AS colors,
      created_at,
      updated_at
    FROM materials
    ORDER BY display_name ASC, material_key ASC
  `;

  const [rows] = await pool.query(sql);
  return rows.map((row) => ({
    ...row,
    colors: normalizeJsonArray(row.colors),
  }));
}

function normalizeJsonArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsedValue = JSON.parse(value);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

async function createMaterial({
  materialKey,
  displayName,
  materialCostPerGram,
  isActive = true,
  colorOptions = [],
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

  const sql = `
    INSERT INTO materials (
      material_key,
      display_name,
      material_cost_per_gram,
      is_active
    )
    VALUES (?, ?, ?, ?)
  `;

    const [result] = await connection.query(sql, [
    materialKey,
    displayName,
    materialCostPerGram,
    isActive,
  ]);

    await replaceMaterialColors(result.insertId, colorOptions, connection);
    await connection.commit();
    return getMaterialByKeyForAdmin(materialKey);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateMaterialByKey(materialKey, payload) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [materialRows] = await connection.query(
      "SELECT id FROM materials WHERE material_key = ? LIMIT 1",
      [materialKey],
    );
    const material = materialRows[0];

    if (!material) {
      await connection.rollback();
      return null;
    }

  const sql = `
    UPDATE materials
    SET
      display_name = ?,
      material_cost_per_gram = ?,
      is_active = ?
    WHERE material_key = ?
  `;

    const [result] = await connection.query(sql, [
    payload.displayName,
    payload.materialCostPerGram,
    payload.isActive,
    materialKey,
  ]);

  if (result.affectedRows === 0) {
      await connection.rollback();
    return null;
  }

    if (Array.isArray(payload.colorOptions)) {
      await replaceMaterialColors(material.id, payload.colorOptions, connection);
    }

    await connection.commit();
    return getMaterialByKeyForAdmin(materialKey);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceMaterialColors(materialId, colorOptions, connection) {
  await connection.query("DELETE FROM material_colors WHERE material_id = ?", [
    materialId,
  ]);

  const normalizedColors = normalizeColorOptions(colorOptions);

  for (let index = 0; index < normalizedColors.length; index += 1) {
    const color = normalizedColors[index];
    await connection.query(
      `
        INSERT INTO material_colors (
          material_id,
          color_name,
          hex_code,
          is_active,
          display_order
        )
        VALUES (?, ?, ?, TRUE, ?)
      `,
      [materialId, color.name, color.hexCode || null, index],
    );
  }
}

function normalizeColorOptions(colorOptions) {
  if (!Array.isArray(colorOptions)) {
    return [];
  }

  const seen = new Set();
  const normalizedColors = [];

  for (const item of colorOptions) {
    const name = String(item?.name || item?.colorName || "").trim();
    const hexCode = normalizeHexCode(item?.hexCode);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedColors.push({ name, hexCode });
  }

  return normalizedColors;
}

function normalizeHexCode(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

async function deactivateMaterialByKey(materialKey) {
  const sql = `
    UPDATE materials
    SET is_active = FALSE
    WHERE material_key = ?
  `;

  const [result] = await pool.query(sql, [materialKey]);

  if (result.affectedRows === 0) {
    return null;
  }

  return getMaterialByKeyForAdmin(materialKey);
}

export {
  getMaterialByKey,
  getActiveMaterialColors,
  getActiveMaterialColorById,
  getMaterialByKeyForAdmin,
  listActiveMaterialsForQuote,
  listMaterialsForAdmin,
  createMaterial,
  updateMaterialByKey,
  deactivateMaterialByKey,
};
