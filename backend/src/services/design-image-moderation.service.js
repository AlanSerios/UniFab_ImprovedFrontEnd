import fs from "fs/promises";
import path from "path";

const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";

const SUPPORTED_IMAGE_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function imageModerationSkippedResult(reason) {
  return {
    status: "auto_approved",
    isActive: true,
    summary: "Image moderation was skipped.",
    feedback: null,
    flags: [
      {
        source: "ai",
        severity: "info",
        category: reason,
      },
    ],
  };
}

function imageModerationUnavailableResult(message) {
  return {
    status: "needs_admin_review",
    isActive: false,
    summary: "Image moderation is unavailable; admin review is required.",
    feedback:
      "Your design has been submitted for FabLab review before it appears publicly.",
    flags: [
      {
        source: "ai",
        severity: "medium",
        category: "image_moderation_unavailable",
        message,
      },
    ],
  };
}

function getThumbnailLocalPath(thumbnailUrl) {
  if (!thumbnailUrl) return null;

  const fileName = path.basename(thumbnailUrl);
  const ext = path.extname(fileName).toLowerCase();

  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext)) {
    return null;
  }

  return path.resolve(
    process.cwd(),
    "storage",
    "local-designs",
    "thumbnails",
    fileName,
  );
}

async function imageFileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = SUPPORTED_IMAGE_EXTENSIONS.get(ext);

  if (!mimeType) {
    throw new Error("Unsupported thumbnail image type.");
  }

  const imageBuffer = await fs.readFile(filePath);
  const base64Image = imageBuffer.toString("base64");

  return `data:${mimeType};base64,${base64Image}`;
}

async function runDesignImageModeration(design) {
  if (process.env.DESIGN_IMAGE_MODERATION_ENABLED !== "true") {
    return imageModerationSkippedResult("image_moderation_disabled");
  }

  if (!design.thumbnail_url) {
    return imageModerationSkippedResult("image_moderation_no_thumbnail");
  }

  if (!process.env.OPENAI_API_KEY) {
    return imageModerationUnavailableResult(
      "OPENAI_API_KEY is not configured.",
    );
  }

  const thumbnailPath = getThumbnailLocalPath(design.thumbnail_url);

  if (!thumbnailPath) {
    return imageModerationUnavailableResult(
      "Thumbnail path could not be resolved.",
    );
  }

  let imageDataUrl;

  try {
    imageDataUrl = await imageFileToDataUrl(thumbnailPath);
  } catch (error) {
    return imageModerationUnavailableResult(error.message);
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
        input: [
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl,
            },
          },
        ],
      }),
    });
  } catch (error) {
    return imageModerationUnavailableResult(error.message);
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
      summary: "Image moderation request failed; admin review is required.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags: [
        {
          source: "ai",
          severity: "medium",
          category: "image_moderation_request_failed",
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
      summary: "Image moderation flagged the thumbnail for admin review.",
      feedback:
        "This design needs FabLab review before it can appear publicly.",
      flags: [
        {
          source: "ai",
          severity: "high",
          category: "image_flagged_content",
          categories: result.categories,
          categoryScores: result.category_scores,
        },
      ],
    };
  }

  return {
    status: "auto_approved",
    isActive: true,
    summary: "Image moderation found no flagged thumbnail content.",
    feedback: null,
    flags: [
      {
        source: "ai",
        severity: "info",
        category: "image_no_flags",
      },
    ],
  };
}

export { runDesignImageModeration };
