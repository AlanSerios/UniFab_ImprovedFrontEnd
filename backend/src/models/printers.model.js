import pool from "../db/db.js";

const PRINTER_SELECT = `
  p.id,
  p.name,
  p.model,
  p.technology,
  p.build_volume,
  p.nozzle_size,
  COALESCE(
    (
      SELECT CONCAT(
        '[',
        COALESCE(
          GROUP_CONCAT(JSON_QUOTE(m.material_key) ORDER BY m.display_name ASC SEPARATOR ','),
          ''
        ),
        ']'
      )
      FROM printer_materials pm
      INNER JOIN materials m ON m.id = pm.material_id
      WHERE pm.printer_id = p.id
    ),
    '[]'
  ) AS supported_materials,
  p.status,
  p.is_public,
  p.display_order,
  p.notes,
  p.created_by,
  p.updated_by,
  p.created_at,
  p.updated_at
`;

async function syncPrinterMaterials(executor, printerId, supportedMaterials = []) {
  await executor.query("DELETE FROM printer_materials WHERE printer_id = ?", [
    printerId,
  ]);

  const materialKeys = [...new Set(supportedMaterials.map(String))];

  if (materialKeys.length === 0) {
    return;
  }

  const [materials] = await executor.query(
    `
      SELECT id
      FROM materials
      WHERE material_key IN (?)
    `,
    [materialKeys],
  );

  for (const material of materials) {
    await executor.query(
      `
        INSERT INTO printer_materials (printer_id, material_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE material_id = VALUES(material_id)
      `,
      [printerId, material.id],
    );
  }
}

async function listPublicPrinters() {
  const [rows] = await pool.query(
    `
      SELECT
        ${PRINTER_SELECT}
      FROM printers p
      WHERE p.is_public = TRUE
        AND p.status <> 'retired'
      ORDER BY p.display_order ASC, p.name ASC
    `,
  );

  return rows;
}

async function listPrintersForAdmin() {
  const [rows] = await pool.query(
    `
      SELECT
        ${PRINTER_SELECT}
      FROM printers p
      ORDER BY p.display_order ASC, p.name ASC
    `,
  );

  return rows;
}

async function getPrinterById(printerId) {
  const [rows] = await pool.query(
    `
      SELECT
        ${PRINTER_SELECT}
      FROM printers p
      WHERE p.id = ?
      LIMIT 1
    `,
    [printerId],
  );

  return rows[0] || null;
}

async function createPrinter(payload) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `
        INSERT INTO printers (
          name,
          model,
          technology,
          build_volume,
          nozzle_size,
          status,
          is_public,
          display_order,
          notes,
          created_by,
          updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.model ?? null,
        payload.technology,
        payload.buildVolume ?? null,
        payload.nozzleSize ?? null,
        payload.status,
        payload.isPublic,
        payload.displayOrder,
        payload.notes ?? null,
        payload.createdBy ?? null,
        payload.updatedBy ?? null,
      ],
    );

    await syncPrinterMaterials(
      connection,
      result.insertId,
      payload.supportedMaterials,
    );
    await connection.commit();

    return getPrinterById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePrinterById(printerId, payload) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `
        UPDATE printers
        SET
          name = ?,
          model = ?,
          technology = ?,
          build_volume = ?,
          nozzle_size = ?,
          status = ?,
          is_public = ?,
          display_order = ?,
          notes = ?,
          updated_by = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.model ?? null,
        payload.technology,
        payload.buildVolume ?? null,
        payload.nozzleSize ?? null,
        payload.status,
        payload.isPublic,
        payload.displayOrder,
        payload.notes ?? null,
        payload.updatedBy ?? null,
        printerId,
      ],
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return null;
    }

    await syncPrinterMaterials(connection, printerId, payload.supportedMaterials);
    await connection.commit();

    return getPrinterById(printerId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePrinterById(printerId) {
  const [result] = await pool.query("DELETE FROM printers WHERE id = ?", [
    printerId,
  ]);

  return result.affectedRows > 0;
}

export {
  listPublicPrinters,
  listPrintersForAdmin,
  getPrinterById,
  createPrinter,
  updatePrinterById,
  deletePrinterById,
};
