import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);

export function assetUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

export function downloadUrl(path) {
  const url = assetUrl(path);

  if (!url || !url.includes("/api/v1/files/")) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function extractCommunityDesignDetail(data) {
  const payload = data.data || data;
  const localDesign = payload.localDesign || payload.design;

  if (localDesign?.sourceKind !== "community") {
    throw new Error("This page only reviews community-submitted designs.");
  }

  return {
    localDesign,
    auditEvents: payload.auditEvents || [],
    moderationRuns: payload.moderationRuns || [],
  };
}

export function extractLocalDesignFromResponse(data) {
  const payload = data.data || data;
  return payload.localDesign || payload.design;
}

export function buildCurationForm(localDesign) {
  return {
    isFeatured: localDesign?.isFeatured ? "true" : "false",
    featuredRank: String(localDesign?.featuredRank || 0),
    isLibraryHidden: localDesign?.isLibraryHidden ? "true" : "false",
    libraryNote: localDesign?.libraryNote || "",
  };
}

export function buildCurationPayload(curationForm) {
  return {
    isFeatured: curationForm.isFeatured === "true",
    featuredRank: Number(curationForm.featuredRank) || 0,
    isLibraryHidden: curationForm.isLibraryHidden === "true",
    libraryNote: curationForm.libraryNote,
  };
}
