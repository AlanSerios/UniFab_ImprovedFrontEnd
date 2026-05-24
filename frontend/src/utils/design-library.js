import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const DEFAULT_LOCAL_PAGINATION = {
  page: 1,
  limit: 12,
  totalCount: 0,
  totalPages: 1,
};

export const DEFAULT_MMF_PAGINATION = {
  page: 1,
  limit: 12,
  totalCount: 0,
  totalPages: 1,
  visibleCount: 0,
};

export const DESIGN_TAB_VALUES = new Set(["local", "mmf"]);

export const LOCAL_SORT_VALUES = new Set([
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "print_ready",
]);

export const LOCAL_LIMIT_VALUES = new Set([6, 12, 24]);
export const SOURCE_FILTER_VALUES = new Set(["lab", "community"]);
export const PRINT_READY_FILTER_VALUES = new Set(["true", "false"]);
export const MMF_SORT_VALUES = new Set(["relevance", "popularity", "date", "visits"]);
export const MMF_ORDER_VALUES = new Set(["asc", "desc"]);
export const MMF_LIMIT_VALUES = new Set([12, 24, 36]);

export const SAVED_MMF_STORAGE_KEY = "unifab.savedMmfDesignIds";

export function getStoredSavedMmfDesignIds() {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(SAVED_MMF_STORAGE_KEY) || "[]",
    );

    return Array.isArray(storedIds) ? new Set(storedIds.map(Number)) : new Set();
  } catch {
    return new Set();
  }
}

export function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

export function getSearchValue(searchParams, key, fallback = "") {
  return searchParams.get(key) || fallback;
}

export function getAllowedSearchValue(
  searchParams,
  key,
  allowedValues,
  fallback = "",
) {
  const value = searchParams.get(key);

  if (!value || !allowedValues.has(value)) {
    return fallback;
  }

  return value;
}

export function getPositiveIntegerSearchValue(searchParams, key, fallback) {
  const value = Number(searchParams.get(key));

  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

export function getLocalLimitSearchValue(searchParams) {
  const value = Number(searchParams.get("localLimit"));

  if (!LOCAL_LIMIT_VALUES.has(value)) {
    return 12;
  }

  return value;
}

export function getMmfLimitSearchValue(searchParams) {
  const value = Number(searchParams.get("mmfPerPage"));

  if (!MMF_LIMIT_VALUES.has(value)) {
    return 12;
  }

  return value;
}

export function getMmfThumbnailUrl(item) {
  const primaryImage = item.images?.find((image) => image.isPrimary);
  const fallbackImage = item.images?.[0];

  return (
    primaryImage?.standardUrl ||
    primaryImage?.thumbnailUrl ||
    primaryImage?.originalUrl ||
    fallbackImage?.standardUrl ||
    fallbackImage?.thumbnailUrl ||
    fallbackImage?.originalUrl ||
    ""
  );
}

export function parseLocalDesignPayload(localPayload, fallbackLimit) {
  if (Array.isArray(localPayload)) {
    return {
      items: localPayload,
      pagination: {
        page: 1,
        limit: fallbackLimit,
        totalCount: localPayload.length,
        totalPages: 1,
      },
    };
  }

  const items = localPayload?.items || [];
  const page = Number(localPayload?.page || 1);
  const limit = Number(localPayload?.limit || fallbackLimit);
  const totalCount = Number(localPayload?.totalCount || items.length);
  const totalPages = Number(localPayload?.totalPages || 1);

  return {
    items,
    pagination: {
      page: Math.max(page, 1),
      limit: Math.max(limit, 1),
      totalCount: Math.max(totalCount, 0),
      totalPages: Math.max(totalPages, 1),
    },
  };
}

export function parseMmfPaginationPayload(mmfPayload, fallbackLimit) {
  const items = mmfPayload?.items || [];
  const page = Number(mmfPayload?.page || 1);
  const limit = Number(mmfPayload?.limit || fallbackLimit);
  const totalCount = Number(mmfPayload?.totalCount || 0);
  const totalPages = Number(mmfPayload?.totalPages || 1);
  const visibleCount = Number(
    mmfPayload?.visibleCount ?? mmfPayload?.items?.length ?? 0,
  );

  return {
    items,
    pagination: {
      page: Math.max(page, 1),
      limit: Math.max(limit, 1),
      totalCount: Math.max(totalCount, 0),
      totalPages: Math.max(totalPages, 1),
      visibleCount: Math.max(visibleCount, 0),
    },
  };
}
