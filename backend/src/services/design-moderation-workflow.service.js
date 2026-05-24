import { createLocalDesignAuditEvent, updateLocalDesignModerationState } from "../models/local-design.model.js";
import { queueDesignAiModerationRun } from "./design-ai-moderation-orchestrator.service.js";

const DESIGN_MODERATION_STATUSES = new Set([
  "draft",
  "screening",
  "auto_approved",
  "needs_admin_review",
  "auto_rejected",
  "admin_approved",
  "admin_rejected",
  "hidden",
]);

const ADMIN_DESIGN_ACTIONS = new Set([
  "approve",
  "reject",
  "hide",
  "restore",
  "send_to_review",
]);

const EDITABLE_OWNER_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
  "auto_approved",
  "admin_approved",
]);

const APPROVED_DESIGN_STATUSES = new Set(["auto_approved", "admin_approved"]);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function resolveOwnerEditState(existingDesign, shouldScreenApprovedEdit) {
  if (
    shouldScreenApprovedEdit &&
    APPROVED_DESIGN_STATUSES.has(existingDesign.moderation_status)
  ) {
    return {
      moderationStatus: "screening",
      isActive: false,
      isPrintReady: Boolean(existingDesign.is_print_ready),
      moderationFeedback:
        "This design was updated and is being screened before public visibility.",
      moderationSummary:
        "Owner updated an approved design, so automated screening is running again.",
      moderationDecisionSource: "none",
      eventType: "owner_updated_approved_design_for_screening",
    };
  }

  return {
    moderationStatus: existingDesign.moderation_status,
    isActive: Boolean(existingDesign.is_active),
    isPrintReady: Boolean(existingDesign.is_print_ready),
    moderationFeedback: existingDesign.moderation_feedback,
    moderationSummary: existingDesign.moderation_summary,
    moderationDecisionSource: existingDesign.moderation_decision_source,
    eventType: "owner_updated_design",
  };
}

function resolveAdminDesignAction({ action, feedback }) {
  const now = new Date();

  if (action === "approve") {
    return {
      moderationStatus: "admin_approved",
      isActive: true,
      isPrintReady: false,
      moderationDecisionSource: "admin",
      moderationFeedback: normalizeOptionalText(feedback),
      moderationSummary: "Admin approved this design for public visibility.",
      reviewedAt: now,
      reviewedBy: null,
      eventType: "admin_approved",
    };
  }

  if (action === "reject") {
    return {
      moderationStatus: "admin_rejected",
      isActive: false,
      isPrintReady: false,
      moderationDecisionSource: "admin",
      moderationFeedback:
        normalizeOptionalText(feedback) ||
        "This design was rejected by FabLab review.",
      moderationSummary: "Admin rejected this design.",
      reviewedAt: now,
      reviewedBy: null,
      eventType: "admin_rejected",
    };
  }

  if (action === "hide") {
    return {
      moderationStatus: "hidden",
      isActive: false,
      isPrintReady: false,
      moderationDecisionSource: "admin",
      moderationFeedback: normalizeOptionalText(feedback),
      moderationSummary: "Admin hid this design from public browsing.",
      reviewedAt: now,
      reviewedBy: null,
      eventType: "admin_hidden",
    };
  }

  if (action === "restore") {
    return {
      moderationStatus: "admin_approved",
      isActive: true,
      isPrintReady: false,
      moderationDecisionSource: "admin",
      moderationFeedback: normalizeOptionalText(feedback),
      moderationSummary: "Admin restored this design to public browsing.",
      reviewedAt: now,
      reviewedBy: null,
      eventType: "admin_restored",
    };
  }

  return {
    moderationStatus: "needs_admin_review",
    isActive: false,
    isPrintReady: false,
    moderationDecisionSource: "admin",
    moderationFeedback: normalizeOptionalText(feedback),
    moderationSummary: "Admin sent this design back to review.",
    reviewedAt: now,
    reviewedBy: null,
    eventType: "admin_sent_to_review",
  };
}

async function queueDesignForAiScreening({
  localDesign,
  actorId,
  actorType,
  eventType = null,
  triggerKind,
  publishedAt = null,
  connection,
}) {
  const moderationRun = await queueDesignAiModerationRun({
    localDesign,
    triggerKind,
    actorId,
    actorType,
    connection,
  });

  const updatedDesign = await updateLocalDesignModerationState(
    localDesign.id,
    {
      moderationStatus: "screening",
      isActive: false,
      isPrintReady: false,
      moderationFlags: [
        {
          source: "ai",
          severity: "info",
          category: "ai_screening_queued",
          runId: moderationRun.id,
        },
      ],
      moderationSummary: "Automated AI screening is queued.",
      moderationFeedback:
        "Your design is being checked before it can appear publicly.",
      moderationDecisionSource: "ai",
      latestModerationRunId: moderationRun.id,
      moderationContentHash: moderationRun.contentHash,
      moderationPolicyVersion: moderationRun.policyVersion,
      publishedAt,
      reviewedAt: null,
      printReadyAt: null,
      printReadyBy: null,
    },
    connection,
  );

  await createLocalDesignAuditEvent(
    {
      localDesignId: localDesign.id,
      actorId,
      actorType,
      eventType: eventType || `${triggerKind}_queued_ai_screening`,
      fromStatus: localDesign.moderation_status,
      toStatus: "screening",
      summary: "Automated AI screening was queued.",
      metadata: {
        decisionSource: "ai",
        moderationRunId: moderationRun.id,
        contentHash: moderationRun.contentHash,
        policyVersion: moderationRun.policyVersion,
      },
    },
    connection,
  );

  return { updatedDesign, moderationRun };
}

export {
  ADMIN_DESIGN_ACTIONS,
  APPROVED_DESIGN_STATUSES,
  DESIGN_MODERATION_STATUSES,
  EDITABLE_OWNER_STATUSES,
  queueDesignForAiScreening,
  resolveAdminDesignAction,
  resolveOwnerEditState,
};
