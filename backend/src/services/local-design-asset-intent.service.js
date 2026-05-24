import { ApiError } from "../utils/api-error.js";
import {
  countActiveLocalDesignFiles,
  createLocalDesignAuditEvent,
  getLocalDesignByIdForAdmin,
  markLocalDesignFileRemoved,
  markLocalDesignImageRemoved,
  reorderLocalDesignFiles,
  reorderLocalDesignImages,
  setLocalDesignPrimaryFile,
  setLocalDesignPrimaryImage,
  syncLocalDesignPrimaryAssetSummary,
  syncLocalDesignPrintReadySummary,
} from "../models/local-design.model.js";
import { markFileReferencesInactive } from "../models/file-registry.model.js";
import { persistUploadedLocalDesignAssets } from "./local-design-assets.service.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
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

function parseJsonList(value) {
  if (!hasText(value)) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseAssetIntent(body = {}) {
  return {
    removeFileIds: parseIdList(body.removeFileIds),
    removeImageIds: parseIdList(body.removeImageIds),
    replaceFileId: hasText(body.replaceFileId) ? Number(body.replaceFileId) : null,
    replaceImageId: hasText(body.replaceImageId)
      ? Number(body.replaceImageId)
      : null,
    primaryFileId: Object.prototype.hasOwnProperty.call(body, "primaryFileId")
      ? hasText(body.primaryFileId)
        ? Number(body.primaryFileId)
        : null
      : undefined,
    primaryImageId: Object.prototype.hasOwnProperty.call(body, "primaryImageId")
      ? hasText(body.primaryImageId)
        ? Number(body.primaryImageId)
        : null
      : undefined,
    fileOrder: parseIdList(parseJsonList(body.fileOrder)),
    imageOrder: parseIdList(parseJsonList(body.imageOrder)),
  };
}

function activeDesignFiles(localDesign) {
  return (localDesign?.files || []).filter(
    (file) => (file.status || "active") === "active",
  );
}

function activeDesignImages(localDesign) {
  return (localDesign?.images || []).filter(
    (image) => (image.status || "active") === "active",
  );
}

async function applyLocalDesignAssetIntent({
  localDesignId,
  existingLocalDesign,
  body,
  uploadedDesignFiles,
  uploadedThumbnailImages,
  actorId,
  actorType,
  connection,
  allowZeroActiveModelFiles = true,
  generatedSnapshotPaths = null,
}) {
  const intent = parseAssetIntent(body);
  const initialActiveFiles = activeDesignFiles(existingLocalDesign);
  const initialActiveImages = activeDesignImages(existingLocalDesign);
  const initialPrimaryFile = initialActiveFiles.find((file) => file.isPrimary);
  const initialPrimaryImage = initialActiveImages.find((image) => image.isPrimary);
  const replacementFileUpload =
    intent.replaceFileId && uploadedDesignFiles.length > 0
      ? uploadedDesignFiles[0]
      : null;
  const replacementImageUpload =
    intent.replaceImageId && uploadedThumbnailImages.length > 0
      ? uploadedThumbnailImages[0]
      : null;

  if (intent.replaceFileId && !replacementFileUpload) {
    throw new ApiError(400, "Upload a model file before replacing an existing design file");
  }

  if (intent.replaceImageId && !replacementImageUpload) {
    throw new ApiError(400, "Upload an image before replacing an existing preview image");
  }

  const replacedFile = intent.replaceFileId
    ? initialActiveFiles.find((file) => Number(file.id) === Number(intent.replaceFileId))
    : null;
  const replacedImage = intent.replaceImageId
    ? initialActiveImages.find((image) => Number(image.id) === Number(intent.replaceImageId))
    : null;

  if (intent.replaceFileId && !replacedFile) {
    throw new ApiError(400, "The selected model file cannot be replaced");
  }

  if (intent.replaceImageId && !replacedImage) {
    throw new ApiError(400, "The selected preview image cannot be replaced");
  }

  const filesForCreate = replacementFileUpload
    ? uploadedDesignFiles.slice(1)
    : uploadedDesignFiles;
  const imagesForCreate = replacementImageUpload
    ? uploadedThumbnailImages.slice(1)
    : uploadedThumbnailImages;
  const duplicateDesignPaths = [];
  const duplicateThumbnailPaths = [];
  const auditEvents = [];
  let replacementFileRecord = null;
  let replacementImageRecord = null;

  if (replacementFileUpload) {
    const result = await persistUploadedLocalDesignAssets({
      localDesignId,
      designFiles: [replacementFileUpload],
      thumbnailImages: [],
      connection,
      primaryFileIndex: -1,
      fileSortOffset: replacedFile.sortOrder,
      actorId,
      generatedSnapshotPaths,
    });
    duplicateDesignPaths.push(...result.duplicateDesignPaths);
    replacementFileRecord = result.files[0] || null;

    if (!replacementFileRecord) {
      throw new ApiError(400, "Replacement model file duplicates an existing active file");
    }

    await markLocalDesignFileRemoved(
      {
        localDesignId,
        fileId: replacedFile.id,
        removedBy: actorId,
        status: "replaced",
        replacedById: replacementFileRecord.id,
        removalReason: "Replaced during design update",
      },
      connection,
    );
    await markFileReferencesInactive(
      {
        referenceType: "local_design_file",
        referenceId: replacedFile.id,
        status: "replaced",
        reason: "Model file was replaced during design update.",
      },
      connection,
    );
    auditEvents.push({
      eventType: "asset_replaced",
      summary: "A model file was replaced.",
      metadata: {
        oldFileId: replacedFile.id,
        newFileId: replacementFileRecord.id,
        fileName: replacedFile.originalFileName || replacedFile.fileUrl,
      },
    });
  }

  if (replacementImageUpload) {
    const result = await persistUploadedLocalDesignAssets({
      localDesignId,
      designFiles: [],
      thumbnailImages: [replacementImageUpload],
      connection,
      primaryImageIndex: -1,
      imageSortOffset: replacedImage.sortOrder,
      actorId,
    });
    duplicateThumbnailPaths.push(...result.duplicateThumbnailPaths);
    replacementImageRecord = result.images[0] || null;

    if (!replacementImageRecord) {
      throw new ApiError(400, "Replacement preview image duplicates an existing active image");
    }

    await markLocalDesignImageRemoved(
      {
        localDesignId,
        imageId: replacedImage.id,
        removedBy: actorId,
        status: "replaced",
        replacedById: replacementImageRecord.id,
        removalReason: "Replaced during design update",
      },
      connection,
    );
    await markFileReferencesInactive(
      {
        referenceType: "local_design_image",
        referenceId: replacedImage.id,
        status: "replaced",
        reason: "Preview image was replaced during design update.",
      },
      connection,
    );
    auditEvents.push({
      eventType: "asset_replaced",
      summary: "A preview image was replaced.",
      metadata: {
        oldImageId: replacedImage.id,
        newImageId: replacementImageRecord.id,
        fileName: replacedImage.originalFileName || replacedImage.imageUrl,
      },
    });
  }

  for (const fileId of intent.removeFileIds) {
    if (Number(fileId) === Number(intent.replaceFileId)) continue;
    const removed = await markLocalDesignFileRemoved(
      {
        localDesignId,
        fileId,
        removedBy: actorId,
        status: "removed",
        removalReason: "Removed during design update",
      },
      connection,
    );
    if (removed) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_file",
          referenceId: removed.id,
          status: "removed",
          reason: "Model file was removed during design update.",
        },
        connection,
      );
      auditEvents.push({
        eventType: "asset_removed",
        summary: "A model file was removed from the active design.",
        metadata: {
          fileId: removed.id,
          fileName: removed.originalFileName || removed.fileUrl,
        },
      });
    }
  }

  for (const imageId of intent.removeImageIds) {
    if (Number(imageId) === Number(intent.replaceImageId)) continue;
    const removed = await markLocalDesignImageRemoved(
      {
        localDesignId,
        imageId,
        removedBy: actorId,
        status: "removed",
        removalReason: "Removed during design update",
      },
      connection,
    );
    if (removed) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_image",
          referenceId: removed.id,
          status: "removed",
          reason: "Preview image was removed during design update.",
        },
        connection,
      );
      auditEvents.push({
        eventType: "asset_removed",
        summary: "A preview image was removed from the active design.",
        metadata: {
          imageId: removed.id,
          fileName: removed.originalFileName || removed.imageUrl,
        },
      });
    }
  }

  const appendResult = await persistUploadedLocalDesignAssets({
    localDesignId,
    designFiles: filesForCreate,
    thumbnailImages: imagesForCreate,
    connection,
    primaryFileIndex: -1,
    primaryImageIndex: -1,
    fileSortOffset: initialActiveFiles.length,
    imageSortOffset: initialActiveImages.length,
    actorId,
    generatedSnapshotPaths,
  });
  duplicateDesignPaths.push(...appendResult.duplicateDesignPaths);
  duplicateThumbnailPaths.push(...appendResult.duplicateThumbnailPaths);

  for (const file of appendResult.files) {
    auditEvents.push({
      eventType: "asset_added",
      summary: "A model file was added to the design.",
      metadata: {
        fileId: file.id,
        fileName: file.originalFileName || file.fileUrl,
      },
    });
  }

  for (const image of appendResult.images) {
    auditEvents.push({
      eventType: "asset_added",
      summary: "A preview image was added to the design.",
      metadata: {
        imageId: image.id,
        fileName: image.originalFileName || image.imageUrl,
      },
    });
  }

  let nextPrimaryFileId =
    intent.primaryFileId === undefined ? initialPrimaryFile?.id || null : intent.primaryFileId;
  let nextPrimaryImageId =
    intent.primaryImageId === undefined ? initialPrimaryImage?.id || null : intent.primaryImageId;

  if (replacementFileRecord && Number(nextPrimaryFileId) === Number(replacedFile.id)) {
    nextPrimaryFileId = replacementFileRecord.id;
  }

  if (replacementImageRecord && Number(nextPrimaryImageId) === Number(replacedImage.id)) {
    nextPrimaryImageId = replacementImageRecord.id;
  }

  const refreshedBeforePrimary = await getLocalDesignByIdForAdmin(
    localDesignId,
    connection,
  );
  const activeFilesAfterMutation = activeDesignFiles(refreshedBeforePrimary);
  const activeImagesAfterMutation = activeDesignImages(refreshedBeforePrimary);

  if (
    activeFilesAfterMutation.length > 0 &&
    (!nextPrimaryFileId ||
      !activeFilesAfterMutation.some(
        (file) => Number(file.id) === Number(nextPrimaryFileId),
      ))
  ) {
    nextPrimaryFileId = activeFilesAfterMutation[0].id;
  }

  if (
    activeImagesAfterMutation.length > 0 &&
    (!nextPrimaryImageId ||
      !activeImagesAfterMutation.some(
        (image) => Number(image.id) === Number(nextPrimaryImageId),
      ))
  ) {
    nextPrimaryImageId = activeImagesAfterMutation[0].id;
  }

  if (
    nextPrimaryFileId &&
    activeFilesAfterMutation.some((file) => Number(file.id) === Number(nextPrimaryFileId))
  ) {
    await setLocalDesignPrimaryFile({ localDesignId, fileId: nextPrimaryFileId }, connection);
    if (Number(initialPrimaryFile?.id || 0) !== Number(nextPrimaryFileId)) {
      auditEvents.push({
        eventType: "asset_primary_updated",
        summary: "Primary model file was updated.",
        metadata: { primaryFileId: nextPrimaryFileId },
      });
    }
  }

  if (
    nextPrimaryImageId &&
    activeImagesAfterMutation.some((image) => Number(image.id) === Number(nextPrimaryImageId))
  ) {
    await setLocalDesignPrimaryImage({ localDesignId, imageId: nextPrimaryImageId }, connection);
    if (Number(initialPrimaryImage?.id || 0) !== Number(nextPrimaryImageId)) {
      auditEvents.push({
        eventType: "asset_primary_updated",
        summary: "Primary preview image was updated.",
        metadata: { primaryImageId: nextPrimaryImageId },
      });
    }
  }

  if (intent.fileOrder.length > 0) {
    await reorderLocalDesignFiles(
      { localDesignId, orderedFileIds: intent.fileOrder },
      connection,
    );
    auditEvents.push({
      eventType: "asset_order_updated",
      summary: "Model file order was updated.",
      metadata: { fileOrder: intent.fileOrder },
    });
  }

  if (intent.imageOrder.length > 0) {
    await reorderLocalDesignImages(
      { localDesignId, orderedImageIds: intent.imageOrder },
      connection,
    );
    auditEvents.push({
      eventType: "asset_order_updated",
      summary: "Preview image order was updated.",
      metadata: { imageOrder: intent.imageOrder },
    });
  }

  const activeFileCount = await countActiveLocalDesignFiles(localDesignId, connection);

  if (!allowZeroActiveModelFiles && activeFileCount === 0) {
    throw new ApiError(400, "At least one active model file is required");
  }

  await syncLocalDesignPrimaryAssetSummary(localDesignId, connection);
  const updatedDesign = await syncLocalDesignPrintReadySummary(
    localDesignId,
    connection,
  );

  for (const event of auditEvents) {
    await createLocalDesignAuditEvent(
      {
        localDesignId,
        actorId,
        actorType,
        eventType: event.eventType,
        fromStatus: existingLocalDesign.moderation_status,
        toStatus: existingLocalDesign.moderation_status,
        summary: event.summary,
        metadata: event.metadata,
      },
      connection,
    );
  }

  return {
    updatedDesign,
    auditEvents,
    duplicateDesignPaths,
    duplicateThumbnailPaths,
    changed:
      auditEvents.length > 0 ||
      duplicateDesignPaths.length > 0 ||
      duplicateThumbnailPaths.length > 0 ||
      intent.primaryFileId !== undefined ||
      intent.primaryImageId !== undefined,
  };
}

export { applyLocalDesignAssetIntent, parseAssetIntent };
