import {
  formatDateTime,
  formatDecimalUnit,
  formatMoney,
  formatRoundedMinutes,
} from "./display-format";
import { normalizeModelPreview } from "./model-preview";

export function extractQuote(data) {
  return data.data?.quote || data.quote || data;
}

export function extractRequestDraft(data) {
  return data.data?.draft || data.draft;
}

export function getPendingCartAction(nextPath) {
  return nextPath === "/requests/new" ? "submit" : "cart";
}

export function getQuoteCurrency(quote) {
  return quote?.pricingConfigSnapshot?.currency || quote?.quoteSnapshot?.currency || "PHP";
}

export function formatQuoteDateTime(value) {
  return formatDateTime(value);
}

export function formatPrintTime(minutes) {
  return formatRoundedMinutes(minutes);
}

export function formatWeightGrams(value) {
  return formatDecimalUnit(value, "g");
}

export function formatLengthMeters(value) {
  return formatDecimalUnit(value, "m");
}

export { formatMoney };

export function getQuoteSourceLabel(quote) {
  if (!quote) {
    return "Quote source";
  }

  if (quote.fileOriginalName) {
    return quote.fileOriginalName;
  }

  if (quote.sourceType === "library") {
    return quote.designSnapshot?.title || "Local design";
  }

  if (quote.sourceType === "mmf") {
    return quote.designSnapshot?.name || "MyMiniFactory design";
  }

  return "Uploaded model";
}

export function getQuotePreview(quote) {
  return normalizeModelPreview(getPreviewSource(quote));
}

function getPreviewSource(quote) {
  if (!quote) {
    return { modelUrl: null, fileName: null, extension: null };
  }

  const fileUrl =
    quote.fileUrl ||
    quote.quoteSnapshot?.file?.url ||
    quote.designSnapshot?.fileUrl ||
    quote.quoteSnapshot?.design?.fileUrl ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.cachedFileUrl ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.fileUrl;
  const fileName =
    quote.fileOriginalName ||
    quote.quoteSnapshot?.file?.originalName ||
    quote.designSnapshot?.fileOriginalName ||
    quote.designSnapshot?.primaryFile?.originalFileName ||
    quote.quoteSnapshot?.design?.fileOriginalName ||
    quote.quoteSnapshot?.design?.primaryFile?.originalFileName ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.originalFileName ||
    quote.designSnapshot?.title ||
    quote.quoteSnapshot?.design?.title ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.title ||
    fileUrl;
  const extension =
    getExtension(quote.fileOriginalName) ||
    getExtension(quote.quoteSnapshot?.file?.originalName) ||
    quote.designSnapshot?.extension ||
    quote.designSnapshot?.primaryFile?.extension ||
    quote.quoteSnapshot?.design?.extension ||
    quote.quoteSnapshot?.design?.primaryFile?.extension ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.extension ||
    getExtension(fileName) ||
    getExtension(fileUrl);

  const snapshotUrl =
    quote.thumbnailUrl ||
    quote.modelSnapshotUrl ||
    quote.quoteSnapshot?.file?.thumbnailUrl ||
    quote.quoteSnapshot?.file?.modelSnapshotUrl ||
    quote.designSnapshot?.thumbnailUrl ||
    quote.designSnapshot?.modelSnapshotUrl ||
    quote.quoteSnapshot?.design?.thumbnailUrl ||
    quote.quoteSnapshot?.design?.modelSnapshotUrl ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.modelSnapshotUrl ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.thumbnailUrl ||
    null;

  return {
    modelUrl: fileUrl,
    fileUrl,
    snapshotUrl,
    fileName,
    extension,
    fileObjectId:
      quote.fileObjectId ||
      quote.file_object_id ||
      quote.quoteSnapshot?.file?.fileObjectId ||
      quote.designSnapshot?.fileObjectId ||
      quote.designSnapshot?.primaryFile?.fileObjectId ||
      quote.quoteSnapshot?.design?.fileObjectId ||
      quote.quoteSnapshot?.design?.primaryFile?.fileObjectId ||
      quote.quoteSnapshot?.mmfObject?.printReadyFile?.fileObjectId ||
      null,
  };
}

function getExtension(value) {
  if (!value) {
    return null;
  }

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}
