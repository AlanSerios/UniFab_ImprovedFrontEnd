const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

function collectDesignText(design) {
  return [
    `Title: ${design.title || ""}`,
    `Description: ${design.description || ""}`,
    `License: ${design.license_type || ""}`,
    `Category: ${design.category_name || ""}`,
    `Tags: ${(design.tags || []).map((tag) => tag.name).join(", ")}`,
    `File: ${design.file_url || ""}`,
    `Thumbnail: ${design.thumbnail_url || ""}`,
  ].join("\n");
}

function disabledResult() {
  return {
    status: "needs_admin_review",
    isActive: false,
    summary: "AI moderation is disabled; admin review is required.",
    feedback:
      "Your design has been submitted for FabLab review before it appears publicly.",
    flags: [
      {
        source: "ai",
        severity: "info",
        category: "ai_moderation_disabled",
      },
    ],
  };
}

async function runDesignAiModeration(design) {
  if (process.env.DESIGN_AI_MODERATION_ENABLED !== "true") {
    return disabledResult();
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: "needs_admin_review",
      isActive: false,
      summary: "AI moderation is enabled but no OpenAI API key is configured.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags: [
        {
          source: "ai",
          severity: "medium",
          category: "ai_moderation_unavailable",
        },
      ],
    };
  }

  let response;

  try {
    response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODERATION_MODEL || DEFAULT_MODERATION_MODEL,
        input: collectDesignText(design),
      }),
    });
  } catch (error) {
    return {
      status: "needs_admin_review",
      isActive: false,
      summary:
        "AI moderation request could not be completed; admin review is required.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags: [
        {
          source: "ai",
          severity: "medium",
          category: "ai_moderation_request_error",
          message: error.message,
        },
      ],
    };
  }

  if (!response.ok) {
    let errorBody = null;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    return {
      status: "needs_admin_review",
      isActive: false,
      summary: "AI moderation request failed; admin review is required.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags: [
        {
          source: "ai",
          severity: "medium",
          category: "ai_moderation_request_failed",
          status: response.status,
          error: errorBody?.error || null,
        },
      ],
    };
  }

  const data = await response.json();
  const result = data.results?.[0];

  if (result?.flagged) {
    return {
      status: "auto_rejected",
      isActive: false,
      summary: "AI moderation flagged this submission for policy review.",
      feedback:
        "This design appears to include content that may violate FabLab submission policy. Please revise the design details and submit again if this was a mistake.",
      flags: [
        {
          source: "ai",
          severity: "high",
          category: "ai_flagged_content",
          categories: result.categories,
          categoryScores: result.category_scores,
        },
      ],
    };
  }

  return {
    status: "needs_admin_review",
    isActive: false,
    summary:
      "AI moderation found no flagged text content, but admin review is required before public visibility.",
    feedback:
      "Your design has been submitted for FabLab review before it appears publicly.",
    flags: [
      {
        source: "ai",
        severity: "info",
        category: "ai_no_text_flags",
      },
    ],
  };
}

export { runDesignAiModeration };
