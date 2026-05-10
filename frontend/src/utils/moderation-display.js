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

const MODERATION_FLAG_LABELS = {
  ai_no_text_flags: "AI text check passed",
  ai_flagged_content: "AI text check flagged content",
  ai_moderation_disabled: "AI moderation disabled",
  ai_moderation_unavailable: "AI moderation unavailable",
  ai_moderation_request_failed: "AI moderation request failed",

  image_no_flags: "Thumbnail image check passed",
  image_flagged_content: "Thumbnail image flagged content",
  image_moderation_disabled: "Image moderation disabled",
  image_moderation_no_thumbnail: "No thumbnail provided",
  image_moderation_unavailable: "Image moderation unavailable",
  image_moderation_request_failed: "Image moderation request failed",

  prohibited_content: "Prohibited content",
  needs_context: "Needs admin context",
};

const MODERATION_FLAG_DESCRIPTIONS = {
  ai_no_text_flags:
    "The AI text moderation check did not find flagged title, description, tag, or metadata content.",
  ai_flagged_content:
    "The AI text moderation check found content that needs FabLab review.",
  ai_moderation_disabled:
    "AI text moderation is turned off in the backend environment.",
  ai_moderation_unavailable:
    "AI text moderation could not run, so the design was routed safely to review.",
  ai_moderation_request_failed:
    "The AI text moderation request failed, so the design was routed safely to review.",

  image_no_flags:
    "The thumbnail image moderation check did not find flagged content.",
  image_flagged_content:
    "The thumbnail image moderation check found content that needs FabLab review.",
  image_moderation_disabled:
    "Image moderation is turned off in the backend environment.",
  image_moderation_no_thumbnail:
    "The design has no uploaded thumbnail, so image moderation was skipped.",
  image_moderation_unavailable:
    "Image moderation could not run, so the design was routed safely to review.",
  image_moderation_request_failed:
    "The image moderation request failed, so the design was routed safely to review.",

  prohibited_content: "A local rules check found a prohibited term.",
  needs_context: "A local rules check found a term that needs admin review.",
};

function getModerationFlagLabel(category) {
  return MODERATION_FLAG_LABELS[category] || formatFallbackLabel(category);
}

function getModerationFlagDescription(category) {
  return MODERATION_FLAG_DESCRIPTIONS[category] || null;
}

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
  getModerationFlagDescription,
  getModerationFlagLabel,
  getModerationStatusLabel,
  getModerationStatusTone,
  getOwnerModerationMessage,
  getPublishResultMessage,
  getSeverityTone,
  parseModerationFlags,
};
