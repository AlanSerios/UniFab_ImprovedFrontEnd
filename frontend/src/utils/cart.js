import { formatMoney } from "./display-format";

export function isCartItemExpired(item) {
  return item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
}

export function getCartCurrency(items) {
  return items[0]?.currency || "PHP";
}

export function extractRequestDraft(data) {
  return data.data?.draft || data.draft;
}

export { formatMoney };

export function buildCartItemPreviewSource(item) {
  return {
    ...item,
    snapshotUrl: item.thumbnailUrl,
    fileName: item.fileOriginalName || item.originalFileName || item.label,
  };
}

export function formatCartItemMeta(item) {
  return `${[item.material, item.materialColorName]
    .filter(Boolean)
    .join(" / ")} / ${item.printQuality} / ${item.infill}% infill`;
}

export function getRequoteButtonLabel(item) {
  return item.sourceType === "upload" ? "Quote again" : "Recalculate quote";
}

export function getRequotePath(item) {
  if (item.sourceType === "library" && item.designId) {
    const params = new URLSearchParams({
      source: "local",
      designId: String(item.designId),
    });
    const designFileId =
      item.designSnapshot?.designFileId || item.quoteSnapshot?.designFile?.id;

    if (designFileId) {
      params.set("fileId", String(designFileId));
    }

    return `/quote?${params.toString()}`;
  }

  if (item.sourceType === "mmf") {
    const objectId =
      item.designSnapshot?.id ||
      item.quoteSnapshot?.mmfObject?.id ||
      item.quoteSnapshot?.mmfObject?.mmfObjectId;
    const printReadyFileId =
      item.designSnapshot?.override?.printReadyFileId ||
      item.quoteSnapshot?.mmfObject?.printReadyFile?.id;

    if (objectId) {
      const params = new URLSearchParams({
        source: "mmf",
        objectId: String(objectId),
      });

      if (printReadyFileId) {
        params.set("fileId", String(printReadyFileId));
      }

      return `/quote?${params.toString()}`;
    }
  }

  return "/quote";
}
