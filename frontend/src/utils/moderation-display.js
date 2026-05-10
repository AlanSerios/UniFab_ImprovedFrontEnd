const MODERATION_STATUS_LABELS = {
  draft: "Draft",
  screening: "Screening",
  auto_approved: "Auto Approved",
  needs_admin_review: "Needs Admin Review",
  auto_rejected: "Auto Rejected",
  admin_approved: "Admin Approved",
  admin_rejected: "Admin Rejected",
  hidden: "Hidden",
};

const MODERATION_STATUS_TONES = {
  draft: "neutral",
  screening: "warning",
  auto_approved: "success",
  needs_admin_review: "warning",
  auto_rejected: "danger",
  admin_approved: "success",
  admin_rejected: "danger",
  hidden: "neutral",
};

const DECISION_SOURCE_LABELS = {
  none: "None",
  rules: "Rules",
  ai: "AI",
  render: "Render",
  admin: "Admin",
};

const DECISION_SOURCE_TONES = {
  none: "neutral",
  rules: "warning",
  ai: "warning",
  render: "warning",
  admin: "success",
};

const SEVERITY_TONES = {
  info: "neutral",
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

function formatFallbackLabel(value) {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getModerationStatusLabel(status) {
  return MODERATION_STATUS_LABELS[status] || formatFallbackLabel(status);
}

function getModerationStatusTone(status) {
  return MODERATION_STATUS_TONES[status] || "neutral";
}

function getDecisionSourceLabel(source) {
  return DECISION_SOURCE_LABELS[source] || formatFallbackLabel(source);
}

function getDecisionSourceTone(source) {
  return DECISION_SOURCE_TONES[source] || "neutral";
}

function getSeverityTone(severity) {
  return SEVERITY_TONES[String(severity || "").toLowerCase()] || "neutral";
}

function getOwnerModerationMessage(design) {
  if (design?.moderationFeedback) return design.moderationFeedback;
  if (design?.moderationSummary) return design.moderationSummary;

  switch (design?.moderationStatus) {
    case "draft":
      return "This design is still private. Publish it when it is ready for screening.";
    case "screening":
      return "Your design is being checked before public visibility.";
    case "auto_approved":
      return "Automated screening found no obvious concerns. This design may appear publicly, but Print Ready still requires FabLab verification.";
    case "needs_admin_review":
      return "This design is waiting for FabLab review before it can appear publicly.";
    case "auto_rejected":
      return "Automated screening found a policy concern. Review the feedback, edit the design, and publish again if this was a mistake.";
    case "admin_approved":
      return "FabLab approved this design for public visibility.";
    case "admin_rejected":
      return "FabLab rejected this design. Review the feedback before editing or republishing.";
    case "hidden":
      return "This design is hidden from public browsing.";
    default:
      return null;
  }
}

function getPublishResultMessage(design) {
  switch (design?.moderationStatus) {
    case "auto_approved":
      return "Design published. Automated screening approved it for public visibility.";
    case "needs_admin_review":
      return "Design submitted. It needs FabLab review before public visibility.";
    case "auto_rejected":
      return "Design submitted, but automated screening found a policy concern. Review the feedback and edit the design if needed.";
    case "screening":
      return "Design submitted for automated screening.";
    default:
      return "Design submitted for screening.";
  }
}

function parseModerationFlags(flags) {
  if (Array.isArray(flags)) return flags;

  if (typeof flags === "string" && flags.trim()) {
    try {
      const parsedFlags = JSON.parse(flags);
      return Array.isArray(parsedFlags) ? parsedFlags : [];
    } catch {
      return [];
    }
  }

  return [];
}

export {
  getDecisionSourceLabel,
  getDecisionSourceTone,
  getModerationStatusLabel,
  getModerationStatusTone,
  getOwnerModerationMessage,
  getPublishResultMessage,
  getSeverityTone,
  parseModerationFlags,
};
