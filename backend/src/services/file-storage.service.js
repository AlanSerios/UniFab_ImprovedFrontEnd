import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { ApiError } from "../utils/api-error.js";
import { STORAGE_ROOT, resolveStoragePath } from "../utils/storage-root.util.js";
import { ensureDirExists } from "../utils/temp-path.util.js";
import {
  createFileEvent,
  createFileReference,
  findReusableFileObject,
  getFileObjectById,
  markFileObjectStorageStatus,
  upsertFileObjectByStorageKey,
} from "../models/file-registry.model.js";

const PUBLIC_PREFIX_BY_STORAGE_AREA = new Map([
  ["local-designs/files", "/storage/local-designs/files/"],
  ["local-designs/thumbnails", "/storage/local-designs/thumbnails/"],
  ["mmf-print-ready/files", "/storage/mmf-print-ready/files/"],
  ["mmf-print-ready/thumbnails", "/storage/mmf-print-ready/thumbnails/"],
  ["quotes/models", "/storage/quotes/models/"],
  ["quotes/thumbnails", "/storage/quotes/thumbnails/"],
  ["print-requests/models", "/storage/print-requests/models/"],
  ["print-requests/thumbnails", "/storage/print-requests/thumbnails/"],
  ["print-requests/payment-slips", "/storage/print-requests/payment-slips/"],
  ["slicer-profiles/library", "/storage/slicer-profiles/library/"],
]);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeStorageKey(storageKey) {
  return String(storageKey || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function getStorageKeyFromAbsolutePath(absolutePath) {
  const relativePath = path.relative(STORAGE_ROOT, path.resolve(absolutePath));

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new ApiError(400, "File path is outside managed storage");
  }

  return normalizeStorageKey(relativePath);
}

function getAbsolutePathForStorageKey(storageKey) {
  const normalizedKey = normalizeStorageKey(storageKey);
  const absolutePath = resolveStoragePath(...normalizedKey.split("/"));
  const relativePath = path.relative(STORAGE_ROOT, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new ApiError(400, "Storage key is outside managed storage");
  }

  return absolutePath;
}

function buildPublicPathForStorageKey(storageKey) {
  const normalizedKey = normalizeStorageKey(storageKey);

  for (const [area, prefix] of PUBLIC_PREFIX_BY_STORAGE_AREA.entries()) {
    if (normalizedKey.startsWith(`${area}/`)) {
      return `${prefix}${path.basename(normalizedKey)}`;
    }
  }

  return null;
}

function getStorageKeyFromPublicPath(publicPath) {
  if (!hasText(publicPath)) return null;

  const normalizedPublicPath = String(publicPath).trim();

  for (const [area, prefix] of PUBLIC_PREFIX_BY_STORAGE_AREA.entries()) {
    if (normalizedPublicPath.startsWith(prefix)) {
      return normalizeStorageKey(`${area}/${path.basename(normalizedPublicPath)}`);
    }
  }

  return null;
}

async function hashFile(absolutePath) {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(absolutePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function inferExtension(value) {
  const ext = path.extname(value || "").toLowerCase();
  return ext || null;
}

function buildDownloadUrl(fileObjectId, { inline = false } = {}) {
  if (!fileObjectId) {
    return null;
  }

  const query = inline ? "?inline=1" : "";
  return `/api/v1/files/${fileObjectId}/download${query}`;
}

async function registerManagedFile({
  absolutePath,
  publicPath = null,
  storageKey = null,
  originalFileName = null,
  mimeType = null,
  visibility = "private",
  createdBy = null,
  dedupe = true,
  removeDuplicatePhysicalFile = true,
  connection = null,
}) {
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  const resolvedPath = path.resolve(absolutePath);
  const resolvedStorageKey =
    storageKey || getStorageKeyFromAbsolutePath(resolvedPath);
  const stat = await fs.promises.stat(resolvedPath);
  const checksumSha256 = await hashFile(resolvedPath);
  const extension =
    inferExtension(originalFileName) ||
    inferExtension(resolvedPath) ||
    inferExtension(resolvedStorageKey);
  const resolvedPublicPath =
    publicPath || buildPublicPathForStorageKey(resolvedStorageKey);

  if (dedupe) {
    const reusable = await findReusableFileObject(
      { checksumSha256, fileSize: stat.size, visibility },
      connection,
    );

    if (reusable && reusable.storageKey !== resolvedStorageKey) {
      if (removeDuplicatePhysicalFile) {
        await fs.promises.rm(resolvedPath, { force: true });
      }

      await createFileEvent(
        {
          fileObjectId: reusable.id,
          eventType: "duplicate_reused",
          actorId: createdBy,
          summary: "Reused an existing physical file with matching checksum and size.",
          metadata: {
            discardedStorageKey: resolvedStorageKey,
            discardedPublicPath: resolvedPublicPath,
          },
        },
        connection,
      );

      return reusable;
    }
  }

  const fileObject = await upsertFileObjectByStorageKey(
    {
      storageProvider: "local",
      storageKey: resolvedStorageKey,
      publicPath: resolvedPublicPath,
      originalFileName,
      mimeType,
      extension,
      fileSize: stat.size,
      checksumSha256,
      visibility,
      createdBy,
    },
    connection,
  );

  await createFileEvent(
    {
      fileObjectId: fileObject.id,
      eventType: "registered",
      actorId: createdBy,
      summary: "Registered managed local file.",
      metadata: {
        storageKey: resolvedStorageKey,
        publicPath: resolvedPublicPath,
      },
    },
    connection,
  );

  return fileObject;
}

async function registerManagedPublicPath({
  publicPath,
  originalFileName = null,
  mimeType = null,
  visibility = "private",
  createdBy = null,
  dedupe = true,
  removeDuplicatePhysicalFile = true,
  connection = null,
}) {
  const storageKey = getStorageKeyFromPublicPath(publicPath);

  if (!storageKey) {
    return null;
  }

  return registerManagedFile({
    absolutePath: getAbsolutePathForStorageKey(storageKey),
    publicPath,
    storageKey,
    originalFileName,
    mimeType,
    visibility,
    createdBy,
    dedupe,
    removeDuplicatePhysicalFile,
    connection,
  });
}

async function attachManagedFileReference({
  fileObjectId,
  referenceType,
  referenceId,
  referenceColumn = null,
  fileRole,
  ownerUserId = null,
  visibility = null,
  metadata = null,
  actorId = null,
  connection = null,
}) {
  if (!fileObjectId || !referenceType || !referenceId || !fileRole) {
    return null;
  }

  const referenceIdValue = await createFileReference(
    {
      fileObjectId,
      referenceType,
      referenceId,
      referenceColumn,
      fileRole,
      ownerUserId,
      visibility,
      metadata,
    },
    connection,
  );

  await createFileEvent(
    {
      fileObjectId,
      fileReferenceId: referenceIdValue,
      eventType: "attached",
      actorId,
      summary: `Attached file to ${referenceType}.`,
      metadata: {
        referenceType,
        referenceId,
        referenceColumn,
        fileRole,
      },
    },
    connection,
  );

  return referenceIdValue;
}

async function createManagedBufferFile({
  buffer,
  storageArea,
  extension,
  originalFileName = null,
  mimeType = null,
  visibility = "private",
  createdBy = null,
  connection = null,
}) {
  const normalizedArea = normalizeStorageKey(storageArea);
  const normalizedExtension = extension?.startsWith(".")
    ? extension.toLowerCase()
    : `.${String(extension || "bin").toLowerCase()}`;
  const fileName = `${randomUUID()}${normalizedExtension}`;
  const absoluteDir = resolveStoragePath(...normalizedArea.split("/"));
  const absolutePath = path.join(absoluteDir, fileName);
  const storageKey = normalizeStorageKey(`${normalizedArea}/${fileName}`);

  ensureDirExists(absoluteDir);
  await fs.promises.writeFile(absolutePath, buffer);

  try {
    const fileObject = await registerManagedFile({
      absolutePath,
      storageKey,
      originalFileName,
      mimeType,
      visibility,
      createdBy,
      connection,
    });

    return {
      fileObject,
      absolutePath: getAbsolutePathForStorageKey(fileObject.storageKey),
      publicPath: fileObject.publicPath,
    };
  } catch (error) {
    await fs.promises.rm(absolutePath, { force: true });
    throw error;
  }
}

async function markFileObjectDeleted({
  fileObjectId,
  actorId = null,
  reason = null,
  deletePhysical = false,
  connection = null,
}) {
  const fileObject = await getFileObjectById(fileObjectId, connection);

  if (!fileObject) return null;

  if (deletePhysical && fileObject.storageStatus === "present") {
    const absolutePath = getAbsolutePathForStorageKey(fileObject.storageKey);
    await fs.promises.rm(absolutePath, { force: true });
  }

  const nextStatus = deletePhysical ? "deleted" : "delete_pending";
  const updated = await markFileObjectStorageStatus(
    {
      fileObjectId,
      storageStatus: nextStatus,
      actorId,
      reason,
    },
    connection,
  );

  await createFileEvent(
    {
      fileObjectId,
      eventType: deletePhysical ? "physical_deleted" : "delete_pending",
      actorId,
      summary: reason,
    },
    connection,
  );

  return updated;
}

export {
  attachManagedFileReference,
  buildDownloadUrl,
  buildPublicPathForStorageKey,
  createManagedBufferFile,
  getAbsolutePathForStorageKey,
  getStorageKeyFromAbsolutePath,
  getStorageKeyFromPublicPath,
  hashFile,
  markFileObjectDeleted,
  registerManagedFile,
  registerManagedPublicPath,
};
