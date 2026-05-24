import fs from "fs";
import { ApiError } from "../utils/api-error.js";
import { getLocalDesignById } from "../models/local-design.model.js";
import {
  archiveMmfPrintReadyFilesByObjectId,
  listMmfPrintReadyFilesByObjectId,
  updateMmfPrintReadyFileSnapshotById,
} from "../models/mmf-print-ready-file.model.js";
import { markFileReferencesInactive } from "../models/file-registry.model.js";
import {
  attachManagedFileReference,
  registerManagedPublicPath,
} from "./file-storage.service.js";
import { getObjectById } from "./myminifactory.service.js";
import { cacheMmfObjectPrintReadyFile } from "./mmf-print-ready-mapping.service.js";
import { getManagedMmfPrintReadyFileAbsolutePath } from "../utils/mmf-print-ready-storage.util.js";
import { generateStoredMmfPrintReadySnapshot } from "../utils/model-snapshot.util.js";
import { buildInlineManagedFileDownloadUrl } from "../utils/managed-file-response.util.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  return [];
}

function isTruthyBodyBoolean(value) {
  return ["true", "1", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function resolveMappingStatus({
  isPrintReady,
  linkedLocalDesignId,
  body,
  fallbackStatus = null,
}) {
  if (!isPrintReady) {
    return "not_requested";
  }

  if (!linkedLocalDesignId) {
    return fallbackStatus || "needs_file";
  }

  if (Object.prototype.hasOwnProperty.call(body, "linkedLocalDesignId")) {
    return "manual_link";
  }

  return fallbackStatus || "mapped";
}

export function hasMeaningfulOverrideBody(body = {}) {
  return (
    isTruthyBodyBoolean(body.isHidden) ||
    isTruthyBodyBoolean(body.isPinned) ||
    isTruthyBodyBoolean(body.isPrintReady) ||
    hasText(body.clientNote)
  );
}

export function requirePrintReadyVerification({
  isEnabling,
  confirmation,
  targetLabel,
}) {
  if (!isEnabling) {
    return;
  }

  const isConfirmed =
    confirmation === true ||
    ["true", "1", "yes"].includes(
      String(confirmation ?? "")
        .trim()
        .toLowerCase(),
    );

  if (!isConfirmed) {
    throw new ApiError(
      400,
      `${targetLabel} requires admin confirmation that the printable file was verified locally before enabling Print Ready.`,
    );
  }
}

export function buildPrintReadyVerificationMetadata(body, adminUserId) {
  return {
    verificationConfirmed: true,
    verificationNote: normalizeOptionalText(body.verificationNote),
    checklist: {
      localSlicerVerified: true,
      supportedFileType: true,
      orientationScaleReviewed: true,
      contentSafeForFabLab: true,
    },
    verifiedBy: adminUserId,
    verifiedAt: new Date().toISOString(),
  };
}

export async function ensureMmfPrintReadySnapshot(override) {
  if (
    !override?.print_ready_file_id ||
    !override.print_ready_file_cached_file_url ||
    override.print_ready_file_model_snapshot_url
  ) {
    return override;
  }

  const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
    override.print_ready_file_cached_file_url,
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    return override;
  }

  const modelSnapshotUrl = await generateStoredMmfPrintReadySnapshot(modelPath);

  if (!modelSnapshotUrl) {
    return override;
  }

  const modelSnapshotFileObject = await registerManagedPublicPath({
    publicPath: modelSnapshotUrl,
    visibility: "public",
    createdBy: null,
    dedupe: false,
  });

  await updateMmfPrintReadyFileSnapshotById(
    override.print_ready_file_id,
    modelSnapshotUrl,
    modelSnapshotFileObject?.id || null,
  );

  if (modelSnapshotFileObject?.id) {
    await attachManagedFileReference({
      fileObjectId: modelSnapshotFileObject.id,
      referenceType: "mmf_print_ready_file",
      referenceId: override.print_ready_file_id,
      referenceColumn: "model_snapshot_file_object_id",
      fileRole: "thumbnail",
      ownerUserId: null,
      visibility: "public",
    });
  }

  return {
    ...override,
    print_ready_file_model_snapshot_url: modelSnapshotUrl,
    print_ready_file_model_snapshot_file_object_id:
      modelSnapshotFileObject?.id || null,
  };
}

export async function ensureMmfPrintReadyFileSnapshot(printReadyFile) {
  if (
    !printReadyFile?.id ||
    !printReadyFile.cached_file_url ||
    printReadyFile.model_snapshot_url
  ) {
    return printReadyFile;
  }

  const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
    printReadyFile.cached_file_url,
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    return printReadyFile;
  }

  const modelSnapshotUrl = await generateStoredMmfPrintReadySnapshot(modelPath);

  if (!modelSnapshotUrl) {
    return printReadyFile;
  }

  const modelSnapshotFileObject = await registerManagedPublicPath({
    publicPath: modelSnapshotUrl,
    visibility: "public",
    createdBy: null,
    dedupe: false,
  });

  await updateMmfPrintReadyFileSnapshotById(
    printReadyFile.id,
    modelSnapshotUrl,
    modelSnapshotFileObject?.id || null,
  );

  if (modelSnapshotFileObject?.id) {
    await attachManagedFileReference({
      fileObjectId: modelSnapshotFileObject.id,
      referenceType: "mmf_print_ready_file",
      referenceId: printReadyFile.id,
      referenceColumn: "model_snapshot_file_object_id",
      fileRole: "thumbnail",
      ownerUserId: null,
      visibility: "public",
    });
  }

  return {
    ...printReadyFile,
    model_snapshot_url: modelSnapshotUrl,
    model_snapshot_file_object_id: modelSnapshotFileObject?.id || null,
  };
}

export async function resolveLinkedLocalDesignId(body) {
  if (!Object.prototype.hasOwnProperty.call(body, "linkedLocalDesignId")) {
    return null;
  }

  if (!hasText(body.linkedLocalDesignId)) {
    return null;
  }

  const linkedLocalDesignId = Number(body.linkedLocalDesignId);
  const localDesign = await getLocalDesignById(linkedLocalDesignId);

  if (!localDesign) {
    throw new ApiError(
      400,
      "Linked local design must be active and available to clients",
    );
  }

  return linkedLocalDesignId;
}

function parseSelectedMmfFileMappings(body) {
  const mappings = [];

  if (Array.isArray(body.selectedMmfFiles)) {
    for (const item of body.selectedMmfFiles) {
      const fileId = Number(item?.fileId ?? item?.selectedMmfFileId);

      if (!Number.isInteger(fileId) || fileId <= 0) {
        continue;
      }

      mappings.push({
        selectedMmfFileId: fileId,
        selectedArchiveEntryPath: hasText(item?.archiveEntryPath)
          ? String(item.archiveEntryPath)
          : null,
      });
    }
  }

  if (mappings.length === 0) {
    const selectedFileIds = parseIdList(body.selectedMmfFileIds);

    if (selectedFileIds.length > 0) {
      for (const fileId of selectedFileIds) {
        mappings.push({
          selectedMmfFileId: fileId,
          selectedArchiveEntryPath:
            typeof body.selectedArchiveEntryPaths === "object"
              ? body.selectedArchiveEntryPaths?.[fileId] || null
              : null,
        });
      }
    }
  }

  if (mappings.length === 0 && hasText(body.selectedMmfFileId)) {
    mappings.push({
      selectedMmfFileId: body.selectedMmfFileId,
      selectedArchiveEntryPath: body.selectedArchiveEntryPath || null,
    });
  }

  const seen = new Set();
  return mappings.filter((mapping) => {
    const key = `${mapping.selectedMmfFileId}::${mapping.selectedArchiveEntryPath || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function resolveMmfPrintReadyFileMapping({
  mmfObjectId,
  body,
  existingLinkedLocalDesignId = null,
  isPrintReady,
  adminUserId,
}) {
  const linkedLocalDesignId = Object.prototype.hasOwnProperty.call(
    body,
    "linkedLocalDesignId",
  )
    ? await resolveLinkedLocalDesignId(body)
    : existingLinkedLocalDesignId;

  if (!isPrintReady || linkedLocalDesignId) {
    return {
      linkedLocalDesignId,
      mappingStatus: resolveMappingStatus({
        isPrintReady,
        linkedLocalDesignId,
        body,
      }),
      mappingError: null,
      mappingMetadata: null,
    };
  }

  const mmfObject = await getObjectById(mmfObjectId);
  const selectedMappings = parseSelectedMmfFileMappings(body);

  if (selectedMappings.length === 0) {
    throw new ApiError(
      400,
      "Select at least one MyMiniFactory file before enabling Print Ready mapping.",
    );
  }

  const mappingResults = [];

  for (const selectedMapping of selectedMappings) {
    mappingResults.push(
      await cacheMmfObjectPrintReadyFile({
        mmfObject,
        adminUserId,
        selectedMmfFileId: selectedMapping.selectedMmfFileId,
        selectedArchiveEntryPath: selectedMapping.selectedArchiveEntryPath,
      }),
    );
  }

  const primaryMappingResult = mappingResults[0];
  const { printReadyFile, selectedFile, selectedArchiveEntry, sourceSnapshot } =
    primaryMappingResult;

  return {
    linkedLocalDesignId: null,
    mappingStatus: "mapped",
    mappingError: null,
    mappingMetadata: {
      mmfObjectId,
      sourceObjectName: mmfObject?.name || mmfObject?.title || null,
      printReadyFileId: printReadyFile.id,
      cachedFileUrl: buildInlineManagedFileDownloadUrl(
        printReadyFile.file_object_id,
        printReadyFile.cached_file_url,
      ),
      fileObjectId: printReadyFile.file_object_id || null,
      selectedFile: selectedFile
        ? {
            id: selectedFile.id || null,
            name: selectedFile.name || selectedFile.filename || null,
            extension: selectedFile.extension || null,
            size: selectedFile.size || null,
          }
        : null,
      selectedArchiveEntry: selectedArchiveEntry || null,
      printReadyFiles: mappingResults.map((result) => ({
        id: result.printReadyFile.id,
        cachedFileUrl: buildInlineManagedFileDownloadUrl(
          result.printReadyFile.file_object_id,
          result.printReadyFile.cached_file_url,
        ),
        fileObjectId: result.printReadyFile.file_object_id || null,
        selectedFileId: result.selectedFile?.id || null,
        selectedArchiveEntry: result.selectedArchiveEntry || null,
      })),
      sourceSnapshot,
      mappedAt: new Date().toISOString(),
    },
  };
}

export async function loadMmfOverrideWithPrintReadyFiles({
  override,
  mmfObjectId,
}) {
  const hydratedOverride = await ensureMmfPrintReadySnapshot(override);
  const printReadyFiles = await Promise.all(
    (await listMmfPrintReadyFilesByObjectId(mmfObjectId)).map(
      ensureMmfPrintReadyFileSnapshot,
    ),
  );

  if (!hydratedOverride) {
    return null;
  }

  const primaryPrintReadyFile =
    printReadyFiles.find((file) => file.is_primary) ||
    printReadyFiles[0] ||
    null;

  return {
    ...hydratedOverride,
    print_ready_files: printReadyFiles,
    print_ready_file_id:
      primaryPrintReadyFile?.id || hydratedOverride.print_ready_file_id,
    print_ready_file_cached_file_url:
      primaryPrintReadyFile?.cached_file_url ||
      hydratedOverride.print_ready_file_cached_file_url,
    print_ready_file_model_snapshot_url:
      primaryPrintReadyFile?.model_snapshot_url ||
      hydratedOverride.print_ready_file_model_snapshot_url,
    print_ready_file_original_file_name:
      primaryPrintReadyFile?.original_file_name ||
      hydratedOverride.print_ready_file_original_file_name,
    print_ready_file_extension:
      primaryPrintReadyFile?.extension ||
      hydratedOverride.print_ready_file_extension,
    print_ready_file_size:
      primaryPrintReadyFile?.file_size || hydratedOverride.print_ready_file_size,
    print_ready_file_status:
      primaryPrintReadyFile?.status ||
      hydratedOverride.print_ready_file_status,
    print_ready_file_verified_at:
      primaryPrintReadyFile?.verified_at ||
      hydratedOverride.print_ready_file_verified_at,
  };
}

export async function archiveMmfPrintReadyFilesAndReferences({
  mmfObjectId,
  errorMessage,
  connection = null,
}) {
  const existingFiles = await listMmfPrintReadyFilesByObjectId(
    mmfObjectId,
    connection,
  );
  const affectedCount = await archiveMmfPrintReadyFilesByObjectId(
    {
      mmfObjectId,
      errorMessage,
    },
    connection,
  );

  for (const printReadyFile of existingFiles.filter(
    (file) => file.status === "cached",
  )) {
    await markFileReferencesInactive(
      {
        referenceType: "mmf_print_ready_file",
        referenceId: printReadyFile.id,
        status: "archived",
        reason: errorMessage || "MMF Print Ready cached file was archived.",
      },
      connection,
    );
  }

  return affectedCount;
}
