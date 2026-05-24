import { buildInlineManagedFileDownloadUrl } from "./managed-file-response.util.js";

function parseJsonSafely(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getUploadExtensionFromName(name) {
  const safeName = name || "";
  const dotIndex = safeName.lastIndexOf(".");
  return dotIndex >= 0 ? safeName.slice(dotIndex).toLowerCase() : null;
}

function normalizeLocalDesignFile(file) {
  return {
    ...file,
    fileUrl: buildInlineManagedFileDownloadUrl(
      file.fileObjectId,
      file.fileUrl,
    ),
    modelSnapshotUrl: buildInlineManagedFileDownloadUrl(
      file.modelSnapshotFileObjectId,
      file.modelSnapshotUrl,
    ),
  };
}

function normalizeLocalDesignImage(image) {
  return {
    ...image,
    imageUrl: buildInlineManagedFileDownloadUrl(
      image.fileObjectId,
      image.imageUrl,
    ),
  };
}

function getPrimaryDesignFile(localDesign, activeFiles) {
  return (
    activeFiles.find((file) => file.isPrimary) ||
    activeFiles[0] ||
    (localDesign.file_url
      ? {
          id: null,
          localDesignId: localDesign.id,
          fileUrl: localDesign.file_url,
          modelSnapshotUrl: localDesign.model_snapshot_url || null,
          originalFileName: null,
          extension: getUploadExtensionFromName(localDesign.file_url),
          fileSize: null,
          sortOrder: 0,
          isPrimary: true,
          isPrintReady: Boolean(localDesign.is_print_ready),
          printReadyAt: localDesign.print_ready_at,
          printReadyBy: localDesign.print_ready_by,
        }
      : null)
  );
}

function getPrimaryDesignImage(localDesign, activeImages) {
  return (
    activeImages.find((image) => image.isPrimary) ||
    activeImages[0] ||
    (localDesign.thumbnail_url
      ? {
          id: null,
          localDesignId: localDesign.id,
          imageUrl: localDesign.thumbnail_url,
          originalFileName: null,
          sortOrder: 0,
          isPrimary: true,
        }
      : null)
  );
}

function normalizeLocalDesign(localDesign) {
  if (!localDesign) {
    return null;
  }

  const files = Array.isArray(localDesign.files) ? localDesign.files : [];
  const images = Array.isArray(localDesign.images) ? localDesign.images : [];
  const activeFiles = files.filter((file) => (file.status || "active") === "active");
  const activeImages = images.filter(
    (image) => (image.status || "active") === "active",
  );
  const primaryFile = getPrimaryDesignFile(localDesign, activeFiles);
  const primaryImage = getPrimaryDesignImage(localDesign, activeImages);
  const normalizedFiles = files.map(normalizeLocalDesignFile);
  const normalizedImages = images.map(normalizeLocalDesignImage);
  const normalizedPrimaryFileUrl = buildInlineManagedFileDownloadUrl(
    primaryFile?.fileObjectId,
    primaryFile?.fileUrl || localDesign.file_url,
  );
  const normalizedPrimarySnapshotUrl = buildInlineManagedFileDownloadUrl(
    primaryFile?.modelSnapshotFileObjectId,
    primaryFile?.modelSnapshotUrl || localDesign.model_snapshot_url || null,
  );
  const normalizedPrimaryImageUrl = buildInlineManagedFileDownloadUrl(
    primaryImage?.fileObjectId,
    primaryImage?.imageUrl || localDesign.thumbnail_url,
  );

  return {
    id: localDesign.id,
    source: "local",
    sourceKind: localDesign.source_kind,
    moderationStatus: localDesign.moderation_status,
    title: localDesign.title,
    description: localDesign.description,
    thumbnailUrl: normalizedPrimaryImageUrl,
    modelSnapshotUrl: normalizedPrimarySnapshotUrl,
    fileUrl: normalizedPrimaryFileUrl,
    files: normalizedFiles,
    images: normalizedImages,
    primaryFile: primaryFile
      ? {
          ...primaryFile,
          fileUrl: normalizedPrimaryFileUrl,
          modelSnapshotUrl: normalizedPrimarySnapshotUrl,
        }
      : null,
    primaryImage: primaryImage
      ? {
          ...primaryImage,
          imageUrl: normalizedPrimaryImageUrl,
        }
      : null,
    material: localDesign.material,
    dimensions: localDesign.dimensions,
    licenseType: localDesign.license_type,
    category: localDesign.category_id
      ? {
          id: localDesign.category_id,
          name: localDesign.category_name,
          slug: localDesign.category_slug,
          description: localDesign.category_description,
        }
      : null,
    tags: Array.isArray(localDesign.tags) ? localDesign.tags : [],
    isActive: Boolean(localDesign.is_active),
    isPrintReady: Boolean(localDesign.is_print_ready),
    isFeatured: Boolean(localDesign.is_featured),
    featuredRank: Number(localDesign.featured_rank || 0),
    featuredAt: localDesign.featured_at,
    featuredBy: localDesign.featured_by,
    libraryNote: localDesign.library_note,
    isLibraryHidden: Boolean(localDesign.is_library_hidden),
    ownershipConfirmed: Boolean(localDesign.ownership_confirmed),
    policyAcknowledged: Boolean(localDesign.policy_acknowledged),
    moderationFlags: localDesign.moderation_flags,
    moderationSummary: localDesign.moderation_summary,
    moderationFeedback: localDesign.moderation_feedback,
    moderationDecisionSource: localDesign.moderation_decision_source,
    latestModerationRunId: localDesign.latest_moderation_run_id,
    moderationContentHash: localDesign.moderation_content_hash,
    moderationPolicyVersion: localDesign.moderation_policy_version,
    publishedAt: localDesign.published_at,
    reviewedAt: localDesign.reviewed_at,
    reviewedBy: localDesign.reviewed_by,
    printReadyAt: localDesign.print_ready_at,
    printReadyBy: localDesign.print_ready_by,
    uploadedBy: localDesign.uploaded_by,
    archivedAt: localDesign.archived_at,
    archivedBy: localDesign.archived_by,
    deletedAt: localDesign.deleted_at,
    deletedBy: localDesign.deleted_by,
    deleteReason: localDesign.delete_reason,
    createdAt: localDesign.created_at,
    updatedAt: localDesign.updated_at,
    savedAt: localDesign.saved_at || null,
  };
}

function normalizeMmfPrintReadyFile(file) {
  if (!file) {
    return null;
  }

  return {
    id: file.id,
    cachedFileUrl: buildInlineManagedFileDownloadUrl(
      file.file_object_id,
      file.cached_file_url,
    ),
    fileObjectId: file.file_object_id || null,
    modelSnapshotUrl: buildInlineManagedFileDownloadUrl(
      file.model_snapshot_file_object_id,
      file.model_snapshot_url,
    ),
    modelSnapshotFileObjectId: file.model_snapshot_file_object_id || null,
    originalFileName: file.original_file_name,
    extension: file.extension,
    fileSize: file.file_size,
    status: file.status,
    verifiedAt: file.verified_at,
    isPrimary: Boolean(file.is_primary),
    sortOrder: Number(file.sort_order || 0),
    mmfFileId: file.mmf_file_id,
    archiveEntryPath: file.archive_entry_path,
    archiveEntryName: file.archive_entry_name,
  };
}

function normalizePrefixedMmfPrintReadyFile(designOverride) {
  if (!designOverride.print_ready_file_id) {
    return null;
  }

  return {
    id: designOverride.print_ready_file_id,
    cachedFileUrl: buildInlineManagedFileDownloadUrl(
      designOverride.print_ready_file_file_object_id,
      designOverride.print_ready_file_cached_file_url,
    ),
    fileObjectId: designOverride.print_ready_file_file_object_id || null,
    modelSnapshotUrl: buildInlineManagedFileDownloadUrl(
      designOverride.print_ready_file_model_snapshot_file_object_id,
      designOverride.print_ready_file_model_snapshot_url,
    ),
    modelSnapshotFileObjectId:
      designOverride.print_ready_file_model_snapshot_file_object_id || null,
    originalFileName: designOverride.print_ready_file_original_file_name,
    extension: designOverride.print_ready_file_extension,
    fileSize: designOverride.print_ready_file_size,
    status: designOverride.print_ready_file_status,
    verifiedAt: designOverride.print_ready_file_verified_at,
  };
}

function buildMmfMappingDiagnosticMessage({
  isPrintReady,
  linkedLocalDesignId,
  printReadyFile,
  mappingStatus,
  mappingError,
}) {
  if (!isPrintReady) {
    return "Print Ready cached-file setup has not been requested for this MMF design.";
  }

  if (mappingStatus === "failed") {
    return mappingError || "MMF file caching failed. Review the source files or retry later.";
  }

  if (printReadyFile) {
    return "This MMF design has a backend-cached printable file for instant quote.";
  }

  if (linkedLocalDesignId) {
    return "This MMF design uses a legacy linked local file.";
  }

  if (mappingStatus === "needs_file") {
    return "Print Ready is blocked until a backend-managed printable file is mapped.";
  }

  return "MMF mapping status is pending review.";
}

function normalizeDesignOverride(designOverride) {
  if (!designOverride) {
    return null;
  }

  const mappingStatus =
    designOverride.mapping_status ||
    (designOverride.print_ready_file_id || designOverride.linked_local_design_id
      ? "mapped"
      : "not_requested");
  const mappingMetadata = parseJsonSafely(designOverride.mapping_metadata);
  const printReadyFile = normalizePrefixedMmfPrintReadyFile(designOverride);
  const printReadyFiles = Array.isArray(designOverride.print_ready_files)
    ? designOverride.print_ready_files.map(normalizeMmfPrintReadyFile)
    : printReadyFile
      ? [printReadyFile]
      : [];

  return {
    id: designOverride.id,
    mmfObjectId: designOverride.mmf_object_id,
    isHidden: Boolean(designOverride.is_hidden),
    isPinned: Boolean(designOverride.is_pinned),
    isPrintReady: Boolean(designOverride.is_print_ready),
    linkedLocalDesignId: designOverride.linked_local_design_id || null,
    printReadyFileId: designOverride.print_ready_file_id || null,
    printReadyFile,
    printReadyFiles,
    mappingStatus,
    mappingError: designOverride.mapping_error || null,
    mappingMetadata,
    mappingDiagnostics: {
      status: mappingStatus,
      message: buildMmfMappingDiagnosticMessage({
        isPrintReady: Boolean(designOverride.is_print_ready),
        linkedLocalDesignId: designOverride.linked_local_design_id,
        printReadyFile,
        mappingStatus,
        mappingError: designOverride.mapping_error,
      }),
    },
    printReadyVerifiedAt: designOverride.print_ready_verified_at,
    printReadyVerifiedBy: designOverride.print_ready_verified_by,
    clientNote: designOverride.client_note,
    createdBy: designOverride.created_by,
    updatedBy: designOverride.updated_by,
    createdAt: designOverride.created_at,
    updatedAt: designOverride.updated_at,
  };
}

export {
  buildMmfMappingDiagnosticMessage,
  normalizeDesignOverride,
  normalizeLocalDesign,
  normalizeMmfPrintReadyFile,
};
