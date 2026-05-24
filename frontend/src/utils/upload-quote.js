import { formatMoney } from "./display-format";
import { assetUrl, getPathExtension } from "./model-preview";

export const QUALITY_OPTIONS = ["draft", "standard", "fine"];

export function formatFileSize(size) {
  if (!Number.isFinite(size)) return "-";

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export { formatMoney };

export function selectMmfPrintReadyFile({ mmfObject, fileId }) {
  const printReadyFiles = mmfObject?.override?.printReadyFiles || [];

  return (
    printReadyFiles.find(
      (file) => fileId && String(file.id) === String(fileId),
    ) ||
    mmfObject?.override?.printReadyFile ||
    printReadyFiles[0] ||
    null
  );
}

export function buildMmfQuoteSource({ mmfObject, objectId, fileId }) {
  const printReadyFile = selectMmfPrintReadyFile({ mmfObject, fileId });

  if (!mmfObject?.override?.isPrintReady || !printReadyFile) {
    throw new Error(
      "This MyMiniFactory design is not ready for instant quote yet.",
    );
  }

  if (!printReadyFile.cachedFileUrl) {
    throw new Error(
      "This MyMiniFactory design does not have a cached printable file.",
    );
  }

  const primaryImage =
    mmfObject.images?.find((image) => image.isPrimary)?.standardUrl ||
    mmfObject.images?.[0]?.standardUrl ||
    mmfObject.images?.[0]?.thumbnailUrl ||
    "";
  const snapshotUrl = printReadyFile.modelSnapshotUrl || primaryImage || null;

  return {
    objectId,
    printReadyFileId: printReadyFile.id,
    sourceLabel: "MyMiniFactory",
    title: mmfObject.name || "MyMiniFactory design",
    sourceUrl: mmfObject.url || "",
    fileName:
      printReadyFile.originalFileName ||
      printReadyFile.cachedFileUrl.split("/").pop() ||
      "MMF printable file",
    extension:
      printReadyFile.extension ||
      getPathExtension(printReadyFile.originalFileName) ||
      getPathExtension(printReadyFile.cachedFileUrl),
    fileSize: printReadyFile.fileSize,
    fileObjectId: printReadyFile.fileObjectId,
    modelUrl: printReadyFile.cachedFileUrl,
    thumbnailUrl: printReadyFile.modelSnapshotUrl,
    sourceThumbnailUrl: assetUrl(primaryImage),
    designSnapshot: {
      id: mmfObject.id,
      name: mmfObject.name,
      url: mmfObject.url,
      sourceType: "mmf",
      thumbnailUrl: snapshotUrl,
    },
  };
}

export function selectLocalDesignFile({ localDesign, fileId }) {
  const designFiles = localDesign?.files || [];

  return (
    designFiles.find(
      (file) => fileId && String(file.id) === String(fileId),
    ) ||
    localDesign?.primaryFile ||
    designFiles.find((file) => file.isPrintReady) ||
    designFiles[0] ||
    null
  );
}

export function buildLocalDesignQuoteSource({ localDesign, designId, fileId }) {
  const selectedDesignFile = selectLocalDesignFile({ localDesign, fileId });

  if (!localDesign?.isActive || !localDesign?.isPrintReady) {
    throw new Error(
      "This UniFab-hosted design is not ready for instant quote yet.",
    );
  }

  if (!selectedDesignFile?.fileUrl && !localDesign.fileUrl) {
    throw new Error("This UniFab-hosted design does not have a model file.");
  }

  if (selectedDesignFile && !selectedDesignFile.isPrintReady) {
    throw new Error(
      "The selected UniFab-hosted design file is not Print Ready yet.",
    );
  }

  const snapshotUrl =
    selectedDesignFile?.modelSnapshotUrl ||
    localDesign.modelSnapshotUrl ||
    localDesign.thumbnailUrl ||
    null;

  return {
    designId,
    designFileId: selectedDesignFile?.id || null,
    sourceLabel: "UniFab-hosted",
    title: localDesign.title || "UniFab-hosted design",
    fileName:
      selectedDesignFile?.originalFileName ||
      selectedDesignFile?.fileUrl?.split("/").pop() ||
      localDesign.fileUrl?.split("/").pop() ||
      localDesign.title ||
      "UniFab model file",
    extension:
      selectedDesignFile?.extension ||
      getPathExtension(selectedDesignFile?.originalFileName) ||
      getPathExtension(selectedDesignFile?.fileUrl || localDesign.fileUrl),
    fileSize: selectedDesignFile?.fileSize || localDesign.fileSize,
    fileObjectId: selectedDesignFile?.fileObjectId || localDesign.fileObjectId,
    modelUrl: selectedDesignFile?.fileUrl || localDesign.fileUrl,
    thumbnailUrl: snapshotUrl,
    designSnapshot: {
      id: localDesign.id,
      title: localDesign.title,
      name: localDesign.title,
      sourceType: "library",
      thumbnailUrl: snapshotUrl,
    },
  };
}

export function buildUploadQuoteFormData({
  modelFile,
  material,
  materialColorId,
  quality,
  infill,
  quantity,
}) {
  const formData = new FormData();
  formData.append("modelFile", modelFile);
  formData.append("material", material);

  if (materialColorId) {
    formData.append("materialColorId", materialColorId);
  }

  formData.append("quality", quality);
  formData.append("infill", String(infill));
  formData.append("quantity", String(quantity));

  return formData;
}

export function extractQuoteToken(data) {
  return data.data?.quoteToken || data.quoteToken || data.quote?.quoteToken;
}

export function buildQuoteResult({
  data,
  quoteSourceType,
  activePreloadedFile,
  modelFile,
  material,
  materialColorId,
  selectedColor,
  quality,
  infill,
  quantity,
  currentQuoteKey,
  uploadAssetKey,
}) {
  const quoteData = data.data || data;
  const thumbnailUrl =
    activePreloadedFile?.thumbnailUrl ||
    quoteData.thumbnailUrl ||
    quoteData.file?.thumbnailUrl;

  return {
    ...quoteData,
    sourceType: quoteSourceType,
    fileOriginalName: activePreloadedFile?.fileName || modelFile.name,
    designSnapshot: activePreloadedFile?.designSnapshot,
    material,
    materialColorId,
    materialColorName: selectedColor?.name || null,
    materialColorHex: selectedColor?.hexCode || null,
    printQuality: quality,
    infill,
    quantity,
    estimatedCost: quoteData.totalPrice,
    thumbnailUrl,
    expiresAt: quoteData.quoteExpiresAt,
    quoteKey: currentQuoteKey,
    uploadAssetKey,
    quoteSnapshot: {
      ...quoteData,
      thumbnailUrl,
    },
    pricingConfigSnapshot: {
      currency: quoteData.currency || "PHP",
    },
  };
}
