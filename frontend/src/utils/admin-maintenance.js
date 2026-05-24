import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const DEFAULT_REGISTRY_FILTERS = {
  storageStatus: "",
  visibility: "",
  referenceType: "",
  search: "",
  page: 1,
  limit: 10,
};

export const DEFAULT_REGISTRY_CLEANUP_SETTINGS = {
  limit: 250,
  reason: "",
  quoteDays: 7,
  designDays: 180,
  requestDays: 365,
};

export const DEFAULT_DESIGN_CLEANUP_SETTINGS = {
  limit: 250,
  reason: "",
  retentionDays: 180,
  mmfRetentionDays: 180,
};

export const DEFAULT_RETENTION_CLEANUP_SETTINGS = {
  limit: 5000,
  reason: "",
  fileAccessEventRetentionDays: 180,
  moderationRetentionDays: 180,
  designAuditRetentionDays: 365,
  printRequestEventRetentionDays: 365,
};

export function extractExpiredQuoteCleanupResult(response) {
  const cleanupResult =
    response.data?.cleanup || response.data?.result || response.result;
  const cleanedCount =
    cleanupResult?.deletedCount ??
    cleanupResult?.deletedQuotes ??
    cleanupResult?.count;

  return {
    cleanupResult,
    cleanedCount,
    message:
      cleanedCount !== undefined
        ? `Expired quote cleanup completed. Removed ${cleanedCount} records.`
        : response.message || "Expired quote cleanup completed.",
  };
}

export function extractFileRegistryResponse({
  summaryResponse,
  objectsResponse,
}) {
  return {
    summary: summaryResponse.data?.summary || summaryResponse.summary,
    fileObjects:
      objectsResponse.data?.fileObjects || objectsResponse.fileObjects || [],
    pagination:
      objectsResponse.data?.pagination || objectsResponse.pagination || null,
  };
}

export function extractCleanupResponse(response) {
  return response.data?.cleanup || response.cleanup;
}

export function buildRegistryCleanupPayload(settings) {
  return {
    limit: settings.limit,
    retentionPolicy: {
      quoteDays: settings.quoteDays,
      designDays: settings.designDays,
      requestDays: settings.requestDays,
    },
    reason: settings.reason,
  };
}

export function buildDesignFileCleanupPayload(settings) {
  return {
    limit: settings.limit,
    reason: settings.reason,
    retentionDays: settings.retentionDays,
    mmfRetentionDays: settings.mmfRetentionDays,
  };
}

export function buildRetentionCleanupPayload(settings) {
  return {
    limit: settings.limit,
    reason: settings.reason,
    fileAccessEventRetentionDays: settings.fileAccessEventRetentionDays,
    moderationRetentionDays: settings.moderationRetentionDays,
    designAuditRetentionDays: settings.designAuditRetentionDays,
    printRequestEventRetentionDays: settings.printRequestEventRetentionDays,
  };
}

export function buildFileDownloadUrl(downloadUrl) {
  if (!downloadUrl) return "";
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  return `${API_ORIGIN}${downloadUrl}`;
}

export function getCleanupSummaryEntries(result) {
  if (!result) return [];

  return Object.entries(result).filter(
    ([key, value]) =>
      typeof value === "number" &&
      !["limit", "retentionDays", "mmfRetentionDays"].includes(key),
  );
}

export function formatMetricLabel(value) {
  return String(value)
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatBytes(value) {
  const bytes = Number(value || 0);

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
