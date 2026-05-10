import { runDesignRulesModeration } from "./design-moderation.service.js";
import { runDesignAiModeration } from "./design-ai-moderation.service.js";

function mergeFlags(...flagGroups) {
  return flagGroups.flat().filter(Boolean);
}

function buildFinalDecision({ rulesResult, aiResult }) {
  const flags = mergeFlags(rulesResult.flags, aiResult.flags);

  if (rulesResult.status === "auto_rejected") {
    return {
      status: "auto_rejected",
      isActive: false,
      decisionSource: "rules",
      summary: rulesResult.summary,
      feedback: rulesResult.feedback,
      flags,
    };
  }

  if (rulesResult.status === "needs_admin_review") {
    return {
      status: "needs_admin_review",
      isActive: false,
      decisionSource: "rules",
      summary: rulesResult.summary,
      feedback: rulesResult.feedback,
      flags,
    };
  }

  if (aiResult.status === "needs_admin_review") {
    return {
      status: "needs_admin_review",
      isActive: false,
      decisionSource: "ai",
      summary: aiResult.summary,
      feedback: aiResult.feedback,
      flags,
    };
  }

  return {
    status: "auto_approved",
    isActive: true,
    decisionSource: "ai",
    summary: "Rules and AI moderation found no obvious text policy concerns.",
    feedback: null,
    flags,
  };
}

async function runDesignModerationPipeline(design) {
  const rulesResult = runDesignRulesModeration(design);

  if (rulesResult.status === "auto_rejected") {
    return {
      status: "auto_rejected",
      isActive: false,
      decisionSource: "rules",
      summary: rulesResult.summary,
      feedback: rulesResult.feedback,
      flags: rulesResult.flags,
    };
  }

  const aiResult = await runDesignAiModeration(design);

  return buildFinalDecision({
    rulesResult,
    aiResult,
  });
}

export { runDesignModerationPipeline };
