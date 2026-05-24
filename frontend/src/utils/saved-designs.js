import {
  SAVED_MMF_STORAGE_KEY,
  assetUrl,
  getMmfThumbnailUrl,
} from "./design-library";

export function extractSavedDesigns(data) {
  const payload = data.data || data;
  return payload.savedDesigns || [];
}

export function extractMmfObject(resultValue) {
  const resultPayload = resultValue.data || resultValue;
  return resultPayload.mmfObject || resultPayload;
}

export function getStoredSavedMmfDesignIdList() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(SAVED_MMF_STORAGE_KEY) || "[]",
    );

    return Array.isArray(storedIds)
      ? storedIds.map(Number).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

export function setStoredSavedMmfDesignIds(ids) {
  window.localStorage.setItem(
    SAVED_MMF_STORAGE_KEY,
    JSON.stringify([...new Set(ids.map(Number).filter(Number.isFinite))]),
  );
}

export function removeStoredSavedMmfDesignId(objectId) {
  const normalizedId = Number(objectId);
  const nextIds = getStoredSavedMmfDesignIdList().filter(
    (savedId) => Number(savedId) !== normalizedId,
  );

  setStoredSavedMmfDesignIds(nextIds);
  return normalizedId;
}

export function sourceLabel(sourceKind) {
  return sourceKind === "community" ? "Community" : "Official Lab";
}

export function getLocalDesignPath(design) {
  return `/designs/local/${design.id}`;
}

export function getMmfDesignPath(design) {
  return `/designs/mmf/${design.id}`;
}

export function getLocalDesignThumbnailUrl(design) {
  return assetUrl(design.thumbnailUrl);
}

export function getMmfSavedThumbnailUrl(design) {
  return getMmfThumbnailUrl(design);
}

export function getLocalDesignTitle(design) {
  return design.title || "Untitled design";
}

export function getMmfDesignTitle(design) {
  return design.name || design.title || `Object ${design.id}`;
}

export function getDesignDescription(design) {
  return design.description || "No description provided.";
}

export function getPrintReadyTone(isPrintReady) {
  return isPrintReady ? "success" : "warning";
}

export function getLocalPrintReadyLabel(design) {
  return design.isPrintReady ? "Print Ready" : "Review Only";
}

export function getMmfPrintReadyLabel(design) {
  return design.override?.isPrintReady ? "Print Ready" : "Needs Review";
}
