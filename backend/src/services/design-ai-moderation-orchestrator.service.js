import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import OpenAI from "openai";
import pool from "../db/db.js";
import {
  createLocalDesignAuditEvent,
  getLocalDesignByIdForAdmin,
  updateLocalDesignModerationState,
} from "../models/local-design.model.js";
import {
  completeLocalDesignModerationRun,
  createLocalDesignModerationRun,
  createLocalDesignModerationRunItem,
  failLocalDesignModerationRun,
  getLocalDesignModerationRunById,
  listPendingLocalDesignModerationRunIds,
  markLocalDesignModerationRunRunning,
} from "../models/local-design-moderation-run.model.js";
import { getFileObjectById } from "../models/file-registry.model.js";
import {
  getAbsolutePathForStorageKey,
  hashFile,
} from "./file-storage.service.js";
import {
  cleanupRenderedViews,
  renderModelPreviews,
} from "./design-render-moderation.service.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";

const DEFAULT_MODERATION_MODEL = "omni-moderation-latest";
const DEFAULT_POLICY_MODEL = "gpt-4.1-mini";
const DESIGN_AI_MODERATION_SERVICE_VERSION = "ai-full-asset-v1";
const UNIFAB_POLICY_VERSION = "unifab-design-library-policy-v1";
const SUPPORTED_IMAGE_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const SUPPORTED_MODEL_EXTENSIONS = new Set([".stl", ".obj", ".3mf"]);

const pendingRunIds = new Set();
let activeWorkers = 0;
let drainScheduled = false;

function getModerationModel() {
  return process.env.OPENAI_MODERATION_MODEL || DEFAULT_MODERATION_MODEL;
}

function getPolicyModel() {
  return process.env.OPENAI_POLICY_MODEL || DEFAULT_POLICY_MODEL;
}

function getOpenAiTimeoutMs() {
  return Math.min(
    Math.max(Number(process.env.OPENAI_MODERATION_TIMEOUT_MS) || 30000, 5000),
    120000,
  );
}

function getMaxConcurrentRuns() {
  return Math.min(
    Math.max(Number(process.env.DESIGN_MODERATION_CONCURRENCY) || 1, 1),
    4,
  );
}

function createOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: getOpenAiTimeoutMs(),
  });
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function getActiveDesignFiles(localDesign) {
  const files = (Array.isArray(localDesign.files) ? localDesign.files : [])
    .filter((file) => (file.status || "active") === "active")
    .sort((a, b) => {
      if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
        return Boolean(b.isPrimary) - Boolean(a.isPrimary);
      }
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.id - b.id;
    });

  if (files.length > 0 || !localDesign.file_url) {
    return files;
  }

  return [
    {
      id: null,
      fileUrl: localDesign.file_url,
      fileObjectId: null,
      modelSnapshotUrl: null,
      modelSnapshotFileObjectId: null,
      originalFileName: path.basename(localDesign.file_url),
      extension: path.extname(localDesign.file_url).toLowerCase(),
      fileSize: null,
      checksumSha256: null,
      isPrimary: true,
      sortOrder: 0,
    },
  ];
}

function getActiveDesignImages(localDesign) {
  const images = (Array.isArray(localDesign.images) ? localDesign.images : [])
    .filter((image) => (image.status || "active") === "active")
    .sort((a, b) => {
      if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
        return Boolean(b.isPrimary) - Boolean(a.isPrimary);
      }
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.id - b.id;
    });

  if (images.length > 0 || !localDesign.thumbnail_url) {
    return images;
  }

  return [
    {
      id: null,
      imageUrl: localDesign.thumbnail_url,
      fileObjectId: null,
      originalFileName: path.basename(localDesign.thumbnail_url),
      checksumSha256: null,
      isPrimary: true,
      sortOrder: 0,
    },
  ];
}

function buildDesignModerationManifest(localDesign) {
  const files = getActiveDesignFiles(localDesign).map((file) => ({
    id: file.id,
    fileObjectId: file.fileObjectId,
    originalFileName: file.originalFileName,
    extension: file.extension,
    fileSize: file.fileSize,
    checksumSha256: file.checksumSha256,
    isPrimary: Boolean(file.isPrimary),
    sortOrder: Number(file.sortOrder || 0),
  }));
  const images = getActiveDesignImages(localDesign).map((image) => ({
    id: image.id,
    fileObjectId: image.fileObjectId,
    originalFileName: image.originalFileName,
    checksumSha256: image.checksumSha256,
    isPrimary: Boolean(image.isPrimary),
    sortOrder: Number(image.sortOrder || 0),
  }));

  return {
    designId: localDesign.id,
    title: localDesign.title,
    description: localDesign.description,
    licenseType: localDesign.license_type,
    material: localDesign.material,
    dimensions: localDesign.dimensions,
    category: localDesign.category_name,
    tags: (localDesign.tags || []).map((tag) => tag.name).sort(),
    ownershipConfirmed: Boolean(localDesign.ownership_confirmed),
    policyAcknowledged: Boolean(localDesign.policy_acknowledged),
    files,
    images,
  };
}

function buildDesignModerationContentHash(localDesign) {
  return sha256(stableJson(buildDesignModerationManifest(localDesign)));
}

function buildTextModerationInputs(localDesign) {
  const inputs = [
    {
      itemType: "metadata",
      label: "Design metadata",
      text: [
        `Title: ${localDesign.title || ""}`,
        `Description: ${localDesign.description || ""}`,
        `License: ${localDesign.license_type || ""}`,
        `Material: ${localDesign.material || ""}`,
        `Dimensions: ${localDesign.dimensions || ""}`,
        `Category: ${localDesign.category_name || ""}`,
        `Tags: ${(localDesign.tags || []).map((tag) => tag.name).join(", ")}`,
        `Ownership confirmed: ${Boolean(localDesign.ownership_confirmed)}`,
        `Policy acknowledged: ${Boolean(localDesign.policy_acknowledged)}`,
      ].join("\n"),
    },
    ...getActiveDesignFiles(localDesign).map((file) => ({
      itemType: "file_name",
      localDesignFileId: file.id,
      fileObjectId: file.fileObjectId,
      label: `Model file ${file.originalFileName || file.fileUrl || file.id}`,
      text: [
        `Original file name: ${file.originalFileName || ""}`,
        `Extension: ${file.extension || ""}`,
        `Primary file: ${Boolean(file.isPrimary)}`,
      ].join("\n"),
    })),
    ...getActiveDesignImages(localDesign).map((image) => ({
      itemType: "image_name",
      localDesignImageId: image.id,
      fileObjectId: image.fileObjectId,
      label: `Gallery image ${image.originalFileName || image.imageUrl || image.id}`,
      text: [
        `Original image name: ${image.originalFileName || ""}`,
        `Primary image: ${Boolean(image.isPrimary)}`,
      ].join("\n"),
    })),
  ].filter((input) => hasText(input.text));

  return inputs.length > 0
    ? inputs
    : [{ itemType: "metadata", label: "Design metadata", text: "Untitled design submission" }];
}

async function resolveLocalAssetPath({ publicPath, fileObjectId, assetType }) {
  if (fileObjectId) {
    const fileObject = await getFileObjectById(fileObjectId);
    if (fileObject?.storageKey && fileObject.storageStatus === "present") {
      return getAbsolutePathForStorageKey(fileObject.storageKey);
    }
  }

  if (publicPath) {
    return getManagedLocalDesignAbsolutePath(publicPath, assetType);
  }

  return null;
}

async function buildImageModerationInputs(localDesign) {
  const inputs = [];

  for (const image of getActiveDesignImages(localDesign)) {
    inputs.push({
      itemType: "gallery_image",
      localDesignImageId: image.id,
      fileObjectId: image.fileObjectId,
      label: `Gallery image ${image.originalFileName || image.id}`,
      publicPath: image.imageUrl,
      absolutePath: await resolveLocalAssetPath({
        publicPath: image.imageUrl,
        fileObjectId: image.fileObjectId,
        assetType: "thumbnail",
      }),
    });
  }

  for (const file of getActiveDesignFiles(localDesign)) {
    if (!file.modelSnapshotUrl && !file.modelSnapshotFileObjectId) continue;

    inputs.push({
      itemType: "model_snapshot",
      localDesignFileId: file.id,
      fileObjectId: file.modelSnapshotFileObjectId,
      label: `Model snapshot ${file.originalFileName || file.id}`,
      publicPath: file.modelSnapshotUrl,
      absolutePath: await resolveLocalAssetPath({
        publicPath: file.modelSnapshotUrl,
        fileObjectId: file.modelSnapshotFileObjectId,
        assetType: "thumbnail",
      }),
    });
  }

  return inputs;
}

async function imageFileToDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = SUPPORTED_IMAGE_EXTENSIONS.get(ext);

  if (!mimeType) {
    throw new Error(`Unsupported image moderation file type: ${ext || "unknown"}`);
  }

  const imageBuffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

function flattenModerationCategories(result) {
  const categories = result?.categories || {};
  return Object.entries(categories)
    .filter(([, flagged]) => Boolean(flagged))
    .map(([category]) => category);
}

function buildModerationFlag({
  item,
  result = null,
  category,
  severity = "high",
  message = null,
}) {
  return {
    source: "ai",
    severity,
    category,
    itemType: item?.itemType || null,
    label: item?.label || null,
    localDesignFileId: item?.localDesignFileId || null,
    localDesignImageId: item?.localDesignImageId || null,
    fileObjectId: item?.fileObjectId || null,
    categories: result?.categories || null,
    categoryScores: result?.category_scores || null,
    message,
  };
}

async function recordTextModerationItems({
  run,
  localDesign,
  client,
  textInputs,
  flags,
}) {
  const response = await client.moderations.create({
    model: run.moderationModel,
    input: textInputs.map((input) => input.text),
  });
  const results = Array.isArray(response.results) ? response.results : [];

  if (results.length !== textInputs.length) {
    throw new Error(
      `AI text moderation returned ${results.length} results for ${textInputs.length} inputs.`,
    );
  }

  for (const [index, item] of textInputs.entries()) {
    const result = results[index];
    const flaggedCategories = flattenModerationCategories(result);
    const isFlagged = Boolean(result?.flagged);

    if (isFlagged) {
      flags.push(buildModerationFlag({ item, result, category: "ai_flagged_content" }));
    }

    await createLocalDesignModerationRunItem({
      runId: run.id,
      localDesignId: localDesign.id,
      itemType: item.itemType,
      localDesignFileId: item.localDesignFileId,
      localDesignImageId: item.localDesignImageId,
      fileObjectId: item.fileObjectId,
      label: item.label,
      inputHash: sha256(item.text),
      status: isFlagged ? "flagged" : "passed",
      provider: run.provider,
      model: run.moderationModel,
      categories: result?.categories || null,
      categoryScores: result?.category_scores || null,
      summary: isFlagged
        ? `AI moderation flagged: ${flaggedCategories.join(", ") || "content"}`
        : "AI moderation passed.",
    });
  }
}

async function moderateImageInput({ run, localDesign, client, item, flags }) {
  if (!item.absolutePath) {
    throw new Error(`${item.label} could not be resolved from managed storage.`);
  }

  const imageDataUrl = await imageFileToDataUrl(item.absolutePath);
  const inputHash = await hashFile(item.absolutePath);
  const response = await client.moderations.create({
    model: run.moderationModel,
    input: [
      {
        type: "image_url",
        image_url: { url: imageDataUrl },
      },
    ],
  });
  const result = response.results?.[0];

  if (!result) {
    throw new Error(`${item.label} returned no moderation result.`);
  }

  const isFlagged = Boolean(result.flagged);
  const flaggedCategories = flattenModerationCategories(result);

  if (isFlagged) {
    flags.push(buildModerationFlag({ item, result, category: "image_flagged_content" }));
  }

  await createLocalDesignModerationRunItem({
    runId: run.id,
    localDesignId: localDesign.id,
    itemType: item.itemType,
    localDesignFileId: item.localDesignFileId,
    localDesignImageId: item.localDesignImageId,
    fileObjectId: item.fileObjectId,
    label: item.label,
    inputHash,
    status: isFlagged ? "flagged" : "passed",
    provider: run.provider,
    model: run.moderationModel,
    categories: result.categories,
    categoryScores: result.category_scores,
    summary: isFlagged
      ? `Image moderation flagged: ${flaggedCategories.join(", ") || "content"}`
      : "Image moderation passed.",
  });
}

async function recordImageModerationItems({
  run,
  localDesign,
  client,
  imageInputs,
  flags,
}) {
  for (const item of imageInputs) {
    await moderateImageInput({ run, localDesign, client, item, flags });
  }
}

async function recordModelRenderModerationItems({
  run,
  localDesign,
  client,
  flags,
}) {
  const files = getActiveDesignFiles(localDesign);

  if (files.length === 0) {
    throw new Error("No active model files were available for moderation.");
  }

  for (const file of files) {
    const modelPath = await resolveLocalAssetPath({
      publicPath: file.fileUrl,
      fileObjectId: file.fileObjectId,
      assetType: "design",
    });
    const extension = path.extname(modelPath || file.extension || "").toLowerCase();

    if (!modelPath || !SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
      throw new Error(
        `Model file ${file.originalFileName || file.id} could not be rendered for moderation.`,
      );
    }

    let renderedViews = [];

    try {
      renderedViews = await renderModelPreviews(modelPath);

      for (const renderedView of renderedViews) {
        await moderateImageInput({
          run,
          localDesign,
          client,
          item: {
            itemType: "model_render",
            localDesignFileId: file.id,
            fileObjectId: file.fileObjectId,
            label: `Generated ${renderedView.name} render for ${file.originalFileName || file.id}`,
            absolutePath: renderedView.filePath,
          },
          flags,
        });
      }
    } finally {
      await cleanupRenderedViews(renderedViews);
    }
  }
}

function buildPolicyPrompt(localDesign, textInputs, moderationFlags) {
  return [
    "You are screening a university fabrication lab public 3D design library submission.",
    "Decide whether the submission is low risk for public browsing or needs staff review.",
    "Route to needs_review when it may involve weapons, weapon parts, evasion, unsafe fabrication, adult/sexual content, harassment, hate, self-harm, illegal activity, graphic violence, campus safety concerns, unclear ownership/license claims, or anything ambiguous.",
    "Do not reject; choose only low_risk or needs_review.",
    "",
    `Policy version: ${UNIFAB_POLICY_VERSION}`,
    `Title: ${localDesign.title || ""}`,
    `Description: ${localDesign.description || ""}`,
    `License: ${localDesign.license_type || ""}`,
    `Category: ${localDesign.category_name || ""}`,
    `Tags: ${(localDesign.tags || []).map((tag) => tag.name).join(", ")}`,
    `Ownership confirmed: ${Boolean(localDesign.ownership_confirmed)}`,
    `Policy acknowledged: ${Boolean(localDesign.policy_acknowledged)}`,
    "",
    "Files and image names:",
    ...textInputs
      .filter((item) => item.itemType !== "metadata")
      .map((item) => `- ${item.label}: ${item.text.replace(/\s+/g, " ")}`),
    "",
    `Baseline moderation flags: ${JSON.stringify(moderationFlags)}`,
    "",
    'Return JSON only: {"decision":"low_risk"|"needs_review","summary":"short admin-facing reason","flags":[{"category":"string","severity":"low|medium|high","reason":"string"}]}',
  ].join("\n");
}

async function runPolicyClassification({
  run,
  localDesign,
  client,
  textInputs,
  flags,
}) {
  const prompt = buildPolicyPrompt(localDesign, textInputs, flags);
  const completion = await client.chat.completions.create({
    model: run.policyModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a cautious production content safety classifier. Return strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });
  const content = completion.choices?.[0]?.message?.content;

  if (!hasText(content)) {
    throw new Error("AI policy classification returned an empty response.");
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI policy classification returned malformed JSON.");
  }

  if (!["low_risk", "needs_review"].includes(parsed.decision)) {
    throw new Error("AI policy classification returned an unknown decision.");
  }

  const policyFlags = Array.isArray(parsed.flags) ? parsed.flags : [];

  if (parsed.decision === "needs_review") {
    for (const flag of policyFlags) {
      flags.push({
        source: "ai_policy",
        severity: flag.severity || "medium",
        category: flag.category || "policy_needs_review",
        message: flag.reason || parsed.summary || null,
      });
    }
  }

  await createLocalDesignModerationRunItem({
    runId: run.id,
    localDesignId: localDesign.id,
    itemType: "policy_classification",
    label: "UniFab policy classification",
    inputHash: sha256(prompt),
    status: parsed.decision === "needs_review" ? "flagged" : "passed",
    provider: run.provider,
    model: run.policyModel,
    policyResult: parsed,
    summary: parsed.summary || "AI policy classification completed.",
  });

  return parsed;
}

function buildFinalAiDecision({ flags, policyResult }) {
  const blockingFlags = flags.filter((flag) =>
    ["medium", "high", "critical"].includes(String(flag.severity || "").toLowerCase()),
  );

  if (policyResult?.decision === "needs_review" || blockingFlags.length > 0) {
    return {
      finalDecision: "needs_admin_review",
      summary: "Automated AI screening found content that needs FabLab review.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags,
    };
  }

  return {
    finalDecision: "auto_approved",
    summary:
      "Automated AI screening found no flagged text, image, model render, or UniFab policy concerns.",
    feedback: null,
    flags,
  };
}

async function applyCompletedRunToDesign({ run, decision }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const currentDesign = await getLocalDesignByIdForAdmin(
      run.localDesignId,
      connection,
    );

    if (
      !currentDesign ||
      Number(currentDesign.latest_moderation_run_id) !== Number(run.id) ||
      currentDesign.moderation_content_hash !== run.contentHash ||
      buildDesignModerationContentHash(currentDesign) !== run.contentHash
    ) {
      await connection.rollback();
      return null;
    }

    const nextStatus =
      decision.finalDecision === "auto_approved"
        ? "auto_approved"
        : "needs_admin_review";

    const updatedDesign = await updateLocalDesignModerationState(
      run.localDesignId,
      {
        moderationStatus: nextStatus,
        isActive: nextStatus === "auto_approved",
        isPrintReady: false,
        moderationFlags: decision.flags,
        moderationSummary: decision.summary,
        moderationFeedback: decision.feedback,
        moderationDecisionSource: "ai",
        latestModerationRunId: run.id,
        moderationContentHash: run.contentHash,
        moderationPolicyVersion: run.policyVersion,
        reviewedAt: nextStatus === "auto_approved" ? new Date() : null,
        printReadyAt: null,
        printReadyBy: null,
      },
      connection,
    );

    await createLocalDesignAuditEvent(
      {
        localDesignId: run.localDesignId,
        actorId: null,
        actorType: "system",
        eventType:
          nextStatus === "auto_approved"
            ? "ai_screening_auto_approved"
            : "ai_screening_needs_admin_review",
        fromStatus: currentDesign.moderation_status,
        toStatus: nextStatus,
        summary: decision.summary,
        metadata: {
          moderationRunId: run.id,
          finalDecision: decision.finalDecision,
          flags: decision.flags,
          policyVersion: run.policyVersion,
        },
      },
      connection,
    );

    await connection.commit();
    return updatedDesign;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function runDesignAiModerationJob(runId) {
  const run = await markLocalDesignModerationRunRunning(runId);
  if (!run) return null;

  const flags = [];

  try {
    const localDesign = await getLocalDesignByIdForAdmin(run.localDesignId);

    if (!localDesign) {
      throw new Error("Local design was not found.");
    }

    const currentHash = buildDesignModerationContentHash(localDesign);
    if (currentHash !== run.contentHash) {
      throw new Error("Design content changed after this moderation run was queued.");
    }

    const client = createOpenAiClient();
    const textInputs = buildTextModerationInputs(localDesign);

    await recordTextModerationItems({
      run,
      localDesign,
      client,
      textInputs,
      flags,
    });
    await recordImageModerationItems({
      run,
      localDesign,
      client,
      imageInputs: await buildImageModerationInputs(localDesign),
      flags,
    });
    await recordModelRenderModerationItems({
      run,
      localDesign,
      client,
      flags,
    });

    const policyResult = await runPolicyClassification({
      run,
      localDesign,
      client,
      textInputs,
      flags,
    });
    const decision = buildFinalAiDecision({ flags, policyResult });
    const completedRun = await completeLocalDesignModerationRun({
      runId: run.id,
      finalDecision: decision.finalDecision,
      summary: decision.summary,
      feedback: decision.feedback,
      flags: decision.flags,
    });

    await applyCompletedRunToDesign({ run: completedRun, decision });
    return completedRun;
  } catch (error) {
    const failureDecision = {
      finalDecision: "needs_admin_review",
      summary: "Automated AI screening could not complete; FabLab review is required.",
      feedback:
        "Your design has been submitted for FabLab review before it appears publicly.",
      flags: [
        ...flags,
        {
          source: "ai",
          severity: "medium",
          category: "ai_moderation_failed",
          message: error.message,
        },
      ],
    };
    const failedRun = await failLocalDesignModerationRun({
      runId: run.id,
      summary: failureDecision.summary,
      feedback: failureDecision.feedback,
      flags: failureDecision.flags,
      errorMessage: error.message,
    });

    await applyCompletedRunToDesign({ run: failedRun, decision: failureDecision });
    return failedRun;
  }
}

function scheduleDrain() {
  if (drainScheduled) return;
  drainScheduled = true;

  setImmediate(async () => {
    drainScheduled = false;
    await drainDesignModerationQueue();
  });
}

async function drainDesignModerationQueue() {
  while (pendingRunIds.size > 0 && activeWorkers < getMaxConcurrentRuns()) {
    const [runId] = pendingRunIds;
    pendingRunIds.delete(runId);
    activeWorkers += 1;

    runDesignAiModerationJob(runId)
      .catch((error) => {
        console.error(`Design moderation run ${runId} failed:`, error);
      })
      .finally(() => {
        activeWorkers -= 1;
        if (pendingRunIds.size > 0) scheduleDrain();
      });
  }
}

function enqueueDesignModerationRun(runId) {
  if (!runId) return;
  pendingRunIds.add(Number(runId));
  scheduleDrain();
}

async function queueDesignAiModerationRun({
  localDesign,
  triggerKind,
  actorId = null,
  actorType = "system",
  connection = null,
}) {
  const contentHash = buildDesignModerationContentHash(localDesign);
  return createLocalDesignModerationRun(
    {
      localDesignId: localDesign.id,
      triggerKind,
      actorId,
      actorType,
      provider: "openai",
      moderationModel: getModerationModel(),
      policyModel: getPolicyModel(),
      policyVersion: UNIFAB_POLICY_VERSION,
      contentHash,
    },
    connection,
  );
}

async function startDesignModerationWorker() {
  const runIds = await listPendingLocalDesignModerationRunIds({ limit: 100 });
  for (const runId of runIds) enqueueDesignModerationRun(runId);
  return runIds.length;
}

export {
  DESIGN_AI_MODERATION_SERVICE_VERSION,
  UNIFAB_POLICY_VERSION,
  buildDesignModerationContentHash,
  enqueueDesignModerationRun,
  getModerationModel,
  getPolicyModel,
  queueDesignAiModerationRun,
  startDesignModerationWorker,
};
