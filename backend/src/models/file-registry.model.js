import pool from "../db/db.js";

function getExecutor(connection) {
  return connection || pool;
}

function serializeJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function normalizeFileObject(row) {
  if (!row) return null;

  return {
    id: row.id,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    publicPath: row.public_path,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    extension: row.extension,
    fileSize: row.file_size,
    checksumSha256: row.checksum_sha256,
    visibility: row.visibility,
    storageStatus: row.storage_status,
    createdBy: row.created_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFileObjectById(fileObjectId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT * FROM file_objects WHERE id = ? LIMIT 1",
    [fileObjectId],
  );
  return normalizeFileObject(rows[0]);
}

async function getFileObjectByStorageKey(storageKey, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    "SELECT * FROM file_objects WHERE storage_key = ? LIMIT 1",
    [storageKey],
  );
  return normalizeFileObject(rows[0]);
}

async function findReusableFileObject(
  { checksumSha256, fileSize, visibility = null },
  connection = null,
) {
  if (!checksumSha256 || fileSize === undefined || fileSize === null) {
    return null;
  }

  const executor = getExecutor(connection);
  const params = [checksumSha256, fileSize];
  const visibilitySql = visibility ? "AND visibility = ?" : "";

  if (visibility) params.push(visibility);

  const [rows] = await executor.query(
    `
      SELECT *
      FROM file_objects
      WHERE checksum_sha256 = ?
        AND file_size = ?
        ${visibilitySql}
        AND storage_status = 'present'
        AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1
    `,
    params,
  );

  return normalizeFileObject(rows[0]);
}

async function createFileObject(
  {
    storageProvider = "local",
    storageKey,
    publicPath = null,
    originalFileName = null,
    mimeType = null,
    extension = null,
    fileSize = null,
    checksumSha256 = null,
    visibility = "private",
    createdBy = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO file_objects (
        storage_provider,
        storage_key,
        public_path,
        original_file_name,
        mime_type,
        extension,
        file_size,
        checksum_sha256,
        visibility,
        storage_status,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'present', ?)
    `,
    [
      storageProvider,
      storageKey,
      publicPath,
      originalFileName,
      mimeType,
      extension,
      fileSize,
      checksumSha256,
      visibility,
      createdBy,
    ],
  );

  return getFileObjectById(result.insertId, connection);
}

async function upsertFileObjectByStorageKey(payload, connection = null) {
  const existing = await getFileObjectByStorageKey(payload.storageKey, connection);

  if (existing) {
    return existing;
  }

  return createFileObject(payload, connection);
}

async function createFileReference(
  {
    fileObjectId,
    referenceType,
    referenceId,
    referenceColumn = null,
    fileRole,
    ownerUserId = null,
    visibility = null,
    status = "active",
    metadata = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const [result] = await executor.query(
    `
      INSERT INTO file_references (
        file_object_id,
        reference_type,
        reference_id,
        reference_column,
        file_role,
        owner_user_id,
        visibility,
        status,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fileObjectId,
      referenceType,
      referenceId,
      referenceColumn,
      fileRole,
      ownerUserId,
      visibility,
      status,
      serializeJson(metadata),
    ],
  );

  return result.insertId;
}

async function markFileReferencesInactive(
  {
    referenceType,
    referenceId,
    referenceColumn = null,
    fileRole = null,
    status = "removed",
    reason = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  const params = [status, reason, referenceType, referenceId];
  const filters = ["reference_type = ?", "reference_id = ?", "status = 'active'"];

  if (referenceColumn) {
    filters.push("reference_column = ?");
    params.push(referenceColumn);
  }

  if (fileRole) {
    filters.push("file_role = ?");
    params.push(fileRole);
  }

  const [result] = await executor.query(
    `
      UPDATE file_references
      SET status = ?, detached_at = NOW(), detach_reason = ?
      WHERE ${filters.join(" AND ")}
    `,
    params,
  );

  return result.affectedRows;
}

async function createFileEvent(
  {
    fileObjectId = null,
    fileReferenceId = null,
    eventType,
    actorId = null,
    summary = null,
    metadata = null,
  },
  connection = null,
) {
  const executor = getExecutor(connection);
  await executor.query(
    `
      INSERT INTO file_events (
        file_object_id,
        file_reference_id,
        event_type,
        actor_id,
        summary,
        metadata
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      fileObjectId,
      fileReferenceId,
      eventType,
      actorId,
      summary,
      serializeJson(metadata),
    ],
  );
}

async function getFileReferencesForObject(fileObjectId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT *
      FROM file_references
      WHERE file_object_id = ?
      ORDER BY status = 'active' DESC, id DESC
    `,
    [fileObjectId],
  );

  return rows;
}

async function countActiveFileReferences(fileObjectId, connection = null) {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `
      SELECT COUNT(*) AS total_count
      FROM file_references
      WHERE file_object_id = ? AND status = 'active'
    `,
    [fileObjectId],
  );

  return Number(rows[0]?.total_count || 0);
}

async function getFileObjectAccessContext(fileObjectId, connection = null) {
  const executor = getExecutor(connection);
  const fileObject = await getFileObjectById(fileObjectId, connection);

  if (!fileObject) return null;

  const [references] = await executor.query(
    `
      SELECT fr.*
      FROM file_references fr
      WHERE fr.file_object_id = ?
      ORDER BY fr.status = 'active' DESC, fr.id DESC
    `,
    [fileObjectId],
  );

  return { fileObject, references };
}

async function markFileObjectStorageStatus(
  { fileObjectId, storageStatus, actorId = null, reason = null },
  connection = null,
) {
  const executor = getExecutor(connection);
  const deletedAtSql = storageStatus === "deleted" ? "NOW()" : "deleted_at";
  await executor.query(
    `
      UPDATE file_objects
      SET
        storage_status = ?,
        deleted_at = ${deletedAtSql},
        deleted_by = ?,
        delete_reason = ?
      WHERE id = ?
    `,
    [storageStatus, actorId, reason, fileObjectId],
  );

  return getFileObjectById(fileObjectId, connection);
}

async function updateFileObjectStorageLocation(
  { fileObjectId, storageKey, publicPath },
  connection = null,
) {
  const executor = getExecutor(connection);

  await executor.query(
    `
      UPDATE file_objects
      SET storage_key = ?, public_path = ?
      WHERE id = ?
    `,
    [storageKey, publicPath, fileObjectId],
  );

  return getFileObjectById(fileObjectId, connection);
}

export {
  createFileEvent,
  createFileObject,
  createFileReference,
  countActiveFileReferences,
  findReusableFileObject,
  getFileObjectAccessContext,
  getFileObjectById,
  getFileReferencesForObject,
  markFileObjectStorageStatus,
  markFileReferencesInactive,
  normalizeFileObject,
  updateFileObjectStorageLocation,
  upsertFileObjectByStorageKey,
};
