import { assetUrl } from "./design-library";
import { formatDate } from "./display-format";
import { getOwnerModerationMessage } from "./moderation-display";

const REJECTED_STATUSES = new Set(["auto_rejected", "admin_rejected"]);
const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);

export const DESIGN_FILTERS = [
  { label: "All", value: "" },
  { label: "Drafts", value: "draft" },
  { label: "Needs Review", value: "needs_admin_review" },
  { label: "Rejected", value: "rejected" },
  { label: "Approved", value: "approved" },
  { label: "Hidden", value: "hidden" },
];

export const PUBLISHABLE_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
]);

export function extractMyDesigns(data) {
  const payload = data.data || data;
  return payload.localDesigns || [];
}

export function matchesDesignFilter(design, filter) {
  if (!filter) return true;
  if (filter === "rejected") {
    return REJECTED_STATUSES.has(design.moderationStatus);
  }
  if (filter === "approved") {
    return APPROVED_STATUSES.has(design.moderationStatus);
  }
  return design.moderationStatus === filter;
}

export function getDesignDetailPath(design) {
  return `/designs/local/${design.id}?returnTo=${encodeURIComponent(
    "/my-designs",
  )}`;
}

export function getDesignEditPath(design) {
  return `/my-designs/${design.id}`;
}

export function getDesignThumbnailUrl(design) {
  return assetUrl(design.thumbnailUrl);
}

export function getDesignTitle(design) {
  return design.title || "Untitled design";
}

export function getDesignUpdatedDate(design) {
  return formatDate(design.updatedAt);
}

export function getDesignSummary(design) {
  return (
    getOwnerModerationMessage(design) ||
    design.description ||
    "No description provided."
  );
}

export function canPublishDesign(design) {
  return PUBLISHABLE_STATUSES.has(design.moderationStatus);
}
