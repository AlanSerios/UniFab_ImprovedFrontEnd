import { buildDownloadUrl } from "../services/file-storage.service.js";
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

function buildInlineDownloadUrlWithQuoteToken(fileObjectId, quoteToken) {
  return `${buildDownloadUrl(fileObjectId, {
    inline: true,
  })}&quoteToken=${encodeURIComponent(quoteToken)}`;
}

function normalizeQuoteRecord(quoteRecord) {
  if (!quoteRecord) {
    return null;
  }

  return {
    id: quoteRecord.id,
    quoteAssetId: quoteRecord.quote_asset_id,
    sourceType: quoteRecord.source_type,
    designId: quoteRecord.design_id,
    fileObjectId: quoteRecord.file_object_id,
    fileUrl: buildInlineManagedFileDownloadUrl(
      quoteRecord.file_object_id,
      quoteRecord.file_url,
    ),
    fileOriginalName: quoteRecord.file_original_name,
    fileMimeType: quoteRecord.file_mime_type,
    fileSize: quoteRecord.file_size,
    thumbnailFileObjectId: quoteRecord.thumbnail_file_object_id,
    thumbnailUrl: buildInlineManagedFileDownloadUrl(
      quoteRecord.thumbnail_file_object_id,
      quoteRecord.thumbnail_url,
    ),
    material: quoteRecord.material,
    materialColorId: quoteRecord.material_color_id,
    materialColorName: quoteRecord.material_color_name,
    materialColorHex: quoteRecord.material_color_hex,
    printQuality: quoteRecord.print_quality,
    infill: Number(quoteRecord.infill),
    quantity: Number(quoteRecord.quantity),
    estimatedCost:
      quoteRecord.estimated_cost === null
        ? null
        : Number(quoteRecord.estimated_cost),
    designSnapshot: parseJsonSafely(quoteRecord.design_snapshot),
    quoteSnapshot: parseJsonSafely(quoteRecord.quote_snapshot),
    pricingConfigSnapshot: parseJsonSafely(quoteRecord.pricing_config_snapshot),
    materialSnapshot: parseJsonSafely(quoteRecord.material_snapshot),
    expiresAt: quoteRecord.expires_at,
    createdAt: quoteRecord.created_at,
  };
}

function applyUploadQuoteTokenDownloadUrls(normalizedQuote, quoteToken) {
  if (
    !normalizedQuote?.fileObjectId ||
    normalizedQuote.sourceType !== "upload"
  ) {
    return normalizedQuote;
  }

  normalizedQuote.fileUrl = buildInlineDownloadUrlWithQuoteToken(
    normalizedQuote.fileObjectId,
    quoteToken,
  );

  if (normalizedQuote.thumbnailFileObjectId) {
    normalizedQuote.thumbnailUrl = buildInlineDownloadUrlWithQuoteToken(
      normalizedQuote.thumbnailFileObjectId,
      quoteToken,
    );
  }

  return normalizedQuote;
}

function buildLocalDesignSnapshot(localDesign, selectedDesignFile = null) {
  return {
    source: "local",
    id: localDesign.id,
    title: localDesign.title,
    description: localDesign.description,
    thumbnailUrl:
      selectedDesignFile?.modelSnapshotUrl || localDesign.thumbnail_url,
    fileUrl: selectedDesignFile?.fileUrl || localDesign.file_url,
    designFileId: selectedDesignFile?.id || null,
    fileOriginalName: selectedDesignFile?.originalFileName || null,
    modelSnapshotUrl: selectedDesignFile?.modelSnapshotUrl || null,
    material: localDesign.material,
    dimensions: localDesign.dimensions,
    licenseType: localDesign.license_type,
    capturedAt: new Date().toISOString(),
  };
}

function buildMmfPrintReadyFileSnapshot(printReadyFile) {
  if (!printReadyFile) {
    return null;
  }

  return {
    id: printReadyFile.id,
    mmfObjectId: printReadyFile.mmf_object_id,
    mmfFileId: printReadyFile.mmf_file_id,
    archiveEntryPath: printReadyFile.archive_entry_path,
    archiveEntryName: printReadyFile.archive_entry_name,
    cachedFileUrl: buildInlineManagedFileDownloadUrl(
      printReadyFile.file_object_id,
      printReadyFile.cached_file_url,
    ),
    fileObjectId: printReadyFile.file_object_id || null,
    modelSnapshotUrl: buildInlineManagedFileDownloadUrl(
      printReadyFile.model_snapshot_file_object_id,
      printReadyFile.model_snapshot_url,
    ),
    modelSnapshotFileObjectId:
      printReadyFile.model_snapshot_file_object_id || null,
    originalFileName: printReadyFile.original_file_name,
    extension: printReadyFile.extension,
    fileSize: printReadyFile.file_size,
    checksumSha256: printReadyFile.checksum_sha256,
    status: printReadyFile.status,
    verifiedAt: printReadyFile.verified_at,
  };
}

function buildMmfObjectSnapshot(mmfObject, override, printReadyFile) {
  return {
    source: "myminifactory",
    id: mmfObject.id,
    name: mmfObject.name,
    url: mmfObject.url,
    description: mmfObject.description,
    dimensions: mmfObject.dimensions,
    materialQuantity: mmfObject.materialQuantity,
    license: mmfObject.license,
    designer: mmfObject.designer,
    tags: mmfObject.tags || [],
    categories: mmfObject.categories || [],
    override: {
      id: override.id,
      isPrintReady: Boolean(override.is_print_ready),
      clientNote: override.client_note,
      printReadyFileId: printReadyFile?.id || null,
    },
    printReadyFile: buildMmfPrintReadyFileSnapshot(printReadyFile),
    capturedAt: new Date().toISOString(),
  };
}

export {
  applyUploadQuoteTokenDownloadUrls,
  buildInlineDownloadUrlWithQuoteToken,
  buildLocalDesignSnapshot,
  buildMmfObjectSnapshot,
  normalizeQuoteRecord,
};
