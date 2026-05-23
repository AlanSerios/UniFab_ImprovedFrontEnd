import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { ApiError } from "../utils/api-error.js";
import { ensureDirExists } from "../utils/temp-path.util.js";
import {
  MMF_PRINT_READY_FILES_ROOT,
  buildMmfPrintReadyFilePublicPath,
} from "../utils/mmf-print-ready-storage.util.js";
import {
  attachManagedFileReference,
  registerManagedFile,
  registerManagedPublicPath,
} from "./file-storage.service.js";
import {
  downloadMmfFile,
  getObjectFilesByIdWithOAuth,
  hydrateMmfFileForDownload,
  SUPPORTED_MMF_MODEL_EXTENSIONS,
} from "./myminifactory.service.js";
import { extractZipEntry } from "../utils/zip-file.util.js";
import {
  findMmfPrintReadyFileSelection,
  getMmfPrintReadyFileByObjectId,
  upsertMmfPrintReadyFile,
} from "../models/mmf-print-ready-file.model.js";
import { generateStoredMmfPrintReadySnapshot } from "../utils/model-snapshot.util.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getLicenseType(mmfObject) {
  if (hasText(mmfObject?.license)) {
    return String(mmfObject.license).trim();
  }

  const activeLicenses = mmfObject?.licenses
    ?.filter((license) => license.value === true && hasText(license.type))
    .map((license) => license.type);

  return activeLicenses?.length ? activeLicenses.join(", ") : null;
}

function parseJsonSafely(value) {
  if (!value || typeof value !== "string") {
    return value || null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function resolveSelectedMmfFile({ mmfObject, selectedMmfFileId }) {
  if (!selectedMmfFileId) {
    throw new ApiError(
      400,
      "Select a MyMiniFactory file before enabling Print Ready mapping.",
    );
  }

  const files =
    mmfObject?.files?.length > 0
      ? mmfObject.files
      : await getObjectFilesByIdWithOAuth(mmfObject.id);
  const selectedFile = files.find(
    (file) => Number(file.id) === Number(selectedMmfFileId),
  );

  if (!selectedFile) {
    throw new ApiError(400, "Selected MyMiniFactory file was not found");
  }

  return hydrateMmfFileForDownload(selectedFile);
}

async function resolveSelectedMmfFileBuffer({
  selectedFile,
  selectedArchiveEntryPath,
}) {
  const fileBuffer = await downloadMmfFile(selectedFile);

  if (selectedFile.extension === ".zip") {
    if (!hasText(selectedArchiveEntryPath)) {
      throw new ApiError(
        400,
        "Select a printable file inside the ZIP archive before enabling Print Ready mapping.",
      );
    }

    const extractedEntry = extractZipEntry(fileBuffer, selectedArchiveEntryPath);

    return {
      fileBuffer: extractedEntry.buffer,
      extension: extractedEntry.extension,
      storedFileName: extractedEntry.name,
      selectedArchiveEntry: {
        path: extractedEntry.path,
        name: extractedEntry.name,
        size: extractedEntry.size,
        extension: extractedEntry.extension,
      },
    };
  }

  if (!SUPPORTED_MMF_MODEL_EXTENSIONS.has(selectedFile.extension)) {
    throw new ApiError(
      400,
      "Selected MyMiniFactory file must be an STL, OBJ, 3MF, or ZIP containing one of those files.",
    );
  }

  return {
    fileBuffer,
    extension: selectedFile.extension,
    storedFileName: selectedFile.name,
    selectedArchiveEntry: null,
  };
}

function buildMmfSourceSnapshot(mmfObject, selectedFile, selectedArchiveEntry) {
  return {
    mmfObjectId: mmfObject.id,
    mmfUrl: mmfObject.url,
    sourceObjectName: mmfObject?.name || mmfObject?.title || null,
    designer: mmfObject?.designer || null,
    selectedFile: selectedFile
      ? {
          id: selectedFile.id || null,
          name: selectedFile.name || selectedFile.filename || null,
          extension: selectedFile.extension || null,
          size: selectedFile.size || null,
        }
      : null,
    selectedArchiveEntry,
    cachedAt: new Date().toISOString(),
  };
}

async function cacheMmfObjectPrintReadyFile({
  mmfObject,
  adminUserId,
  selectedMmfFileId,
  selectedArchiveEntryPath = null,
}) {
  if (!mmfObject?.id) {
    throw new ApiError(404, "MyMiniFactory design not found");
  }

  const selectedFile = await resolveSelectedMmfFile({
    mmfObject,
    selectedMmfFileId,
  });
  const existingSelection = await findMmfPrintReadyFileSelection({
    mmfObjectId: mmfObject.id,
    mmfFileId: selectedFile.id || null,
    archiveEntryPath: selectedArchiveEntryPath || null,
  });

  if (
    existingSelection?.cached_file_url &&
    ["cached", "archived"].includes(existingSelection.status)
  ) {
    const printReadyFile =
      existingSelection.status === "archived"
        ? await upsertMmfPrintReadyFile({
            mmfObjectId: mmfObject.id,
            mmfFileId: existingSelection.mmf_file_id,
            archiveEntryPath: existingSelection.archive_entry_path,
            archiveEntryName: existingSelection.archive_entry_name,
            cachedFileUrl: existingSelection.cached_file_url,
            fileObjectId: existingSelection.file_object_id,
            modelSnapshotUrl: existingSelection.model_snapshot_url,
            modelSnapshotFileObjectId:
              existingSelection.model_snapshot_file_object_id,
            originalFileName: existingSelection.original_file_name,
            extension: existingSelection.extension,
            fileSize: existingSelection.file_size,
            checksumSha256: existingSelection.checksum_sha256,
            sourceUrl: existingSelection.source_url,
            licenseSnapshot: parseJsonSafely(existingSelection.license_snapshot),
            sourceSnapshot: parseJsonSafely(existingSelection.source_snapshot),
            mappedBy: adminUserId,
            verifiedBy: adminUserId,
            verifiedAt: new Date(),
            status: "cached",
            errorMessage: null,
            sortOrder: existingSelection.sort_order,
            isPrimary: existingSelection.is_primary,
          })
        : existingSelection;

    return {
      printReadyFile,
      selectedFile,
      selectedArchiveEntry: printReadyFile.archive_entry_path
        ? {
            path: printReadyFile.archive_entry_path,
            name: printReadyFile.archive_entry_name,
          }
        : null,
      sourceSnapshot: parseJsonSafely(printReadyFile.source_snapshot),
    };
  }

  const {
    fileBuffer,
    extension,
    storedFileName,
    selectedArchiveEntry,
  } = await resolveSelectedMmfFileBuffer({
    selectedFile,
    selectedArchiveEntryPath,
  });
  const safeFileName = `${randomUUID()}${extension}`;
  const absoluteFilePath = path.join(MMF_PRINT_READY_FILES_ROOT, safeFileName);
  const publicFilePath = buildMmfPrintReadyFilePublicPath(safeFileName);
  const checksumSha256 = createHash("sha256").update(fileBuffer).digest("hex");
  const existingPrintReadyFile = await getMmfPrintReadyFileByObjectId(
    mmfObject.id,
  );

  ensureDirExists(MMF_PRINT_READY_FILES_ROOT);
  await fs.promises.writeFile(absoluteFilePath, fileBuffer);

  try {
    const modelSnapshotUrl =
      await generateStoredMmfPrintReadySnapshot(absoluteFilePath);
    const fileObject = await registerManagedFile({
      absolutePath: absoluteFilePath,
      publicPath: publicFilePath,
      originalFileName: storedFileName || selectedFile.name,
      mimeType: null,
      visibility: "private",
      createdBy: adminUserId,
    });
    const modelSnapshotFileObject = modelSnapshotUrl
      ? await registerManagedPublicPath({
          publicPath: modelSnapshotUrl,
          originalFileName: `${storedFileName || selectedFile.name || "mmf"}-snapshot.png`,
          mimeType: "image/png",
          visibility: "public",
          createdBy: adminUserId,
        })
      : null;
    const sourceSnapshot = buildMmfSourceSnapshot(
      mmfObject,
      selectedFile,
      selectedArchiveEntry,
    );
    const printReadyFile = await upsertMmfPrintReadyFile({
      mmfObjectId: mmfObject.id,
      mmfFileId: selectedFile.id || null,
      archiveEntryPath: selectedArchiveEntry?.path || null,
      archiveEntryName: selectedArchiveEntry?.name || null,
      cachedFileUrl: fileObject?.publicPath || publicFilePath,
      fileObjectId: fileObject?.id || null,
      modelSnapshotUrl: modelSnapshotFileObject?.publicPath || modelSnapshotUrl,
      modelSnapshotFileObjectId: modelSnapshotFileObject?.id || null,
      originalFileName: storedFileName || selectedFile.name,
      extension,
      fileSize: fileObject?.fileSize || fileBuffer.byteLength,
      checksumSha256: fileObject?.checksumSha256 || checksumSha256,
      sourceUrl: mmfObject.url || null,
      licenseSnapshot: {
        licenseType: getLicenseType(mmfObject),
        licenses: mmfObject?.licenses || null,
      },
      sourceSnapshot,
      mappedBy: adminUserId,
      verifiedBy: adminUserId,
      verifiedAt: new Date(),
      status: "cached",
      errorMessage: null,
      isPrimary: !existingPrintReadyFile,
    });
    await Promise.all([
      fileObject?.id
        ? attachManagedFileReference({
            fileObjectId: fileObject.id,
            referenceType: "mmf_print_ready_file",
            referenceId: printReadyFile.id,
            referenceColumn: "file_object_id",
            fileRole: "model",
            ownerUserId: adminUserId,
            visibility: "private",
            actorId: adminUserId,
          })
        : Promise.resolve(null),
      modelSnapshotFileObject?.id
        ? attachManagedFileReference({
            fileObjectId: modelSnapshotFileObject.id,
            referenceType: "mmf_print_ready_file",
            referenceId: printReadyFile.id,
            referenceColumn: "model_snapshot_file_object_id",
            fileRole: "thumbnail",
            ownerUserId: adminUserId,
            visibility: "public",
            actorId: adminUserId,
          })
        : Promise.resolve(null),
    ]);

    return {
      printReadyFile,
      selectedFile,
      selectedArchiveEntry,
      sourceSnapshot,
    };
  } catch (error) {
    await fs.promises.rm(absoluteFilePath, { force: true });
    throw error;
  }
}

export { cacheMmfObjectPrintReadyFile };
