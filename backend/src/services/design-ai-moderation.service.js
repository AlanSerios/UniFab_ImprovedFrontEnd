const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

function collectDesignText(design) {
  return [
    `Title: ${design.title || ""}`,
    `Description: ${design.description || ""}`,
    `License: ${design.license_type || ""}`,
    `Category: ${design.category_name || ""}`,
    `Tags: ${(design.tags || []).map((tag) => tag.name).join(", ")}`,
    `Material: ${design.material || ""}`,
    `Dimensions: ${design.dimensions || ""}`,
    `File: ${design.file_url || ""}`,
    `Thumbnail: ${design.thumbnail_url || ""}`,
  ].join("\n");
}

function aiDisabledResult() {
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

function aiUnavailableResult(message) {
  return {
    status: "needs_admin_review",
    isActive: false,
    summary: "AI moderation is unavailable; admin review is required.",
    feedback:
      "Your design has been submitted for FabLab review before it appears publicly.",
    flags: [
      {
        source: "ai",
        severity: "medium",
        category: "ai_moderation_unavailable",
        message,
      },
    ],
  };
}

async function runDesignAiModeration(design) {
  if (process.env.DESIGN_AI_MODERATION_ENABLED !== "true") {
    return aiDisabledResult();
  }

  if (!process.env.OPENAI_API_KEY) {
    return aiUnavailableResult("OPENAI_API_KEY is not configured.");
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
    return aiUnavailableResult(error.message);
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
      status: "needs_admin_review",
      isActive: false,
      summary: "AI moderation flagged this submission for admin review.",
      feedback:
        "This design needs FabLab review before it can appear publicly.",
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
    status: "auto_approved",
    isActive: true,
    summary: "AI moderation found no flagged text content.",
    feedback: null,
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
