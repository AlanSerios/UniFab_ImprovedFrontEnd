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

const MMF_PRINT_READY_FILE_SELECT = `
  id,
  mmf_object_id,
  mmf_file_id,
  archive_entry_path,
  archive_entry_name,
  (SELECT public_path FROM file_objects WHERE id = mmf_print_ready_files.file_object_id) AS cached_file_url,
  file_object_id,
  (SELECT public_path FROM file_objects WHERE id = mmf_print_ready_files.model_snapshot_file_object_id) AS model_snapshot_url,
  model_snapshot_file_object_id,
  original_file_name,
  extension,
  file_size,
  checksum_sha256,
  source_url,
  license_snapshot,
  source_snapshot,
  mapped_by,
  verified_by,
  verified_at,
  status,
  error_message,
  storage_status,
  storage_deleted_at,
  storage_delete_reason,
  storage_cleanup_job_id,
  last_storage_check_at,
  sort_order,
  is_primary,
  created_at,
  updated_at
`;

async function getMmfPrintReadyFileById(id, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    SELECT
      ${MMF_PRINT_READY_FILE_SELECT}
    FROM mmf_print_ready_files
    WHERE id = ?
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [id]);
  return rows[0] || null;
}

async function getMmfPrintReadyFileByObjectId(mmfObjectId, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    SELECT
      ${MMF_PRINT_READY_FILE_SELECT}
    FROM mmf_print_ready_files
    WHERE mmf_object_id = ?
      AND status = 'cached'
      AND COALESCE(storage_status, 'present') = 'present'
    ORDER BY is_primary DESC, sort_order ASC, id ASC
    LIMIT 1
  `;

  const [rows] = await executor.query(sql, [mmfObjectId]);
  return rows[0] || null;
}

async function listMmfPrintReadyFilesByObjectId(mmfObjectId, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    SELECT
      ${MMF_PRINT_READY_FILE_SELECT}
    FROM mmf_print_ready_files
    WHERE mmf_object_id = ?
      AND status NOT IN ('removed', 'archived')
      AND COALESCE(storage_status, 'present') = 'present'
    ORDER BY is_primary DESC, sort_order ASC, id ASC
  `;

  const [rows] = await executor.query(sql, [mmfObjectId]);
  return rows;
}

async function getMmfPrintReadyFileForQuote({
  mmfObjectId,
  printReadyFileId = null,
  connection = null,
}) {
  const executor = getExecutor(connection);
  const params = [mmfObjectId];
  let idCondition = "";

  if (
    printReadyFileId !== null &&
    printReadyFileId !== undefined &&
    printReadyFileId !== ""
  ) {
    idCondition = "AND id = ?";
    params.push(printReadyFileId);
  }

  const [rows] = await executor.query(
    `
      SELECT
        ${MMF_PRINT_READY_FILE_SELECT}
      FROM mmf_print_ready_files
      WHERE mmf_object_id = ?
        ${idCondition}
        AND status = 'cached'
        AND COALESCE(storage_status, 'present') = 'present'
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT 1
    `,
    params,
  );

  return rows[0] || null;
}

async function findMmfPrintReadyFileSelection(
  { mmfObjectId, mmfFileId = null, archiveEntryPath = null },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT
        ${MMF_PRINT_READY_FILE_SELECT}
      FROM mmf_print_ready_files
      WHERE mmf_object_id = ?
        AND ((mmf_file_id IS NULL AND ? IS NULL) OR mmf_file_id = ?)
        AND ((archive_entry_path IS NULL AND ? IS NULL) OR archive_entry_path = ?)
      LIMIT 1
    `,
    [
      mmfObjectId,
      mmfFileId ?? null,
      mmfFileId ?? null,
      archiveEntryPath ?? null,
      archiveEntryPath ?? null,
    ],
  );

  return rows[0] || null;
}

async function upsertMmfPrintReadyFile(payload, connection = null) {
  const executor = getExecutor(connection);
  const existing = await findMmfPrintReadyFileSelection(
    {
      mmfObjectId: payload.mmfObjectId,
      mmfFileId: payload.mmfFileId,
      archiveEntryPath: payload.archiveEntryPath,
    },
    connection,
  );

  if (existing) {
    await executor.query(
      `
        UPDATE mmf_print_ready_files
        SET
          archive_entry_name = ?,
          file_object_id = ?,
          model_snapshot_file_object_id = ?,
          original_file_name = ?,
          extension = ?,
          file_size = ?,
          checksum_sha256 = ?,
          source_url = ?,
          license_snapshot = ?,
          source_snapshot = ?,
          mapped_by = ?,
          verified_by = ?,
          verified_at = ?,
          status = ?,
          error_message = ?,
          sort_order = ?,
          is_primary = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        payload.archiveEntryName ?? null,
        payload.fileObjectId ?? existing.file_object_id ?? null,
        payload.modelSnapshotFileObjectId ??
          existing.model_snapshot_file_object_id ??
          null,
        payload.originalFileName ?? null,
        payload.extension ?? null,
        payload.fileSize ?? null,
        payload.checksumSha256 ?? null,
        payload.sourceUrl ?? null,
        serializeJson(payload.licenseSnapshot),
        serializeJson(payload.sourceSnapshot),
        payload.mappedBy ?? null,
        payload.verifiedBy ?? null,
        payload.verifiedAt ?? null,
        payload.status ?? "cached",
        payload.errorMessage ?? null,
        payload.sortOrder ?? existing.sort_order ?? 0,
        payload.isPrimary ?? existing.is_primary ?? false,
        existing.id,
      ],
    );

    return getMmfPrintReadyFileById(existing.id, connection);
  }

  const sql = `
    INSERT INTO mmf_print_ready_files (
      mmf_object_id,
      mmf_file_id,
      archive_entry_path,
      archive_entry_name,
      file_object_id,
      model_snapshot_file_object_id,
      original_file_name,
      extension,
      file_size,
      checksum_sha256,
      source_url,
      license_snapshot,
      source_snapshot,
      mapped_by,
      verified_by,
      verified_at,
      status,
      error_message,
      sort_order,
      is_primary
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await executor.query(sql, [
    payload.mmfObjectId,
    payload.mmfFileId ?? null,
    payload.archiveEntryPath ?? null,
    payload.archiveEntryName ?? null,
    payload.fileObjectId ?? null,
    payload.modelSnapshotFileObjectId ?? null,
    payload.originalFileName ?? null,
    payload.extension ?? null,
    payload.fileSize ?? null,
    payload.checksumSha256 ?? null,
    payload.sourceUrl ?? null,
    serializeJson(payload.licenseSnapshot),
    serializeJson(payload.sourceSnapshot),
    payload.mappedBy ?? null,
    payload.verifiedBy ?? null,
    payload.verifiedAt ?? null,
    payload.status ?? "cached",
    payload.errorMessage ?? null,
    payload.sortOrder ?? 0,
    payload.isPrimary ?? false,
  ]);

  return getMmfPrintReadyFileById(result.insertId, connection);
}

async function deleteMmfPrintReadyFileByObjectId(mmfObjectId, connection = null) {
  const executor = getExecutor(connection);
  const sql = `
    DELETE FROM mmf_print_ready_files
    WHERE mmf_object_id = ?
  `;

  const [result] = await executor.query(sql, [mmfObjectId]);
  return result.affectedRows > 0;
}

async function archiveMmfPrintReadyFilesByObjectId(
  { mmfObjectId, errorMessage = null },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      UPDATE mmf_print_ready_files
      SET
        status = 'archived',
        error_message = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE mmf_object_id = ?
        AND status = 'cached'
    `,
    [errorMessage, mmfObjectId],
  );

  return result.affectedRows;
}

async function updateMmfPrintReadyFileSnapshotById(
  id,
  modelSnapshotUrl,
  modelSnapshotFileObjectId = null,
  connection = null,
) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      UPDATE mmf_print_ready_files
      SET
        model_snapshot_file_object_id = COALESCE(?, model_snapshot_file_object_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [modelSnapshotFileObjectId, id],
  );

  return getMmfPrintReadyFileById(id, connection);
}

export {
  deleteMmfPrintReadyFileByObjectId,
  archiveMmfPrintReadyFilesByObjectId,
  getMmfPrintReadyFileById,
  getMmfPrintReadyFileByObjectId,
  getMmfPrintReadyFileForQuote,
  findMmfPrintReadyFileSelection,
  listMmfPrintReadyFilesByObjectId,
  updateMmfPrintReadyFileSnapshotById,
  upsertMmfPrintReadyFile,
};
