import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import fs from "fs";
import { createHash } from "crypto";
import pool from "../db/db.js";
import {
  buildMmfOAuthAuthorizationUrl,
  disconnectMmfOAuth,
  exchangeMmfOAuthCode,
  getMmfOAuthStatus,
  inspectMmfObjectFiles,
  searchObjects,
  getObjectById,
} from "../services/myminifactory.service.js";
import {
  getActiveLocalDesigns,
  getAllLocalDesignsForAdmin,
  getLocalDesignById,
  getLocalDesignByIdForAdmin,
  getLocalDesignAuditEvents,
  createLocalDesign as createLocalDesignRecord,
  updateLocalDesignById,
  deactivateLocalDesignById,
  archiveLocalDesignById,
  countLocalDesignReferences,
  deleteLocalDesignById,
  listDesignCategories,
  listDesignTags,
  getDesignCategoryById,
  getDesignTagsByIds,
  upsertDesignCategoryByName,
  upsertDesignTagByName,
  updateDesignCategoryById,
  updateDesignTagById,
  replaceLocalDesignTags,
  getLocalDesignsByOwner,
  createLocalDesignAuditEvent,
  updateLocalDesignModerationState,
  updateCommunityDesignById,
  getLatestLocalDesignModelSnapshotUrl,
  createLocalDesignModelSnapshotRender,
  searchActiveLocalDesigns,
  listLibrarySectionDesigns,
  updateLocalDesignLibraryCuration,
  getSavedDesignsByUser,
  getSavedDesignIdsByUser,
  saveDesignForUser,
  unsaveDesignForUser,
  createLocalDesignFile,
  createLocalDesignImage,
  getLocalDesignFileByChecksum,
  getLocalDesignImageByChecksum,
  getLocalDesignImageByUrl,
  updateLocalDesignFilePrintReady,
  syncLocalDesignPrintReadySummary,
  syncLocalDesignPrimaryAssetSummary,
  countActiveLocalDesignFiles,
  markLocalDesignFileRemoved,
  markLocalDesignImageRemoved,
  setLocalDesignPrimaryFile,
  setLocalDesignPrimaryImage,
  reorderLocalDesignFiles,
  reorderLocalDesignImages,
  softDeleteCommunityDesignById,
} from "../models/local-design.model.js";
import {
  getAllDesignOverrides,
  getDesignOverrideById,
  getDesignOverrideByMmfObjectId,
  getDesignOverridesByMmfObjectIds,
  listDesignOverridesForAdmin,
  createDesignOverride as createDesignOverrideRecord,
  updateDesignOverrideById,
  deleteDesignOverrideById,
} from "../models/design-overrides.model.js";
import {
  archiveMmfPrintReadyFilesByObjectId,
  listMmfPrintReadyFilesByObjectId,
  updateMmfPrintReadyFileSnapshotById,
} from "../models/mmf-print-ready-file.model.js";
import {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";
import {
  getManagedLocalDesignAbsolutePath,
  removeManagedLocalDesignFile,
} from "../utils/local-design-storage.util.js";
import {
  attachManagedFileReference,
  buildDownloadUrl,
  registerManagedPublicPath,
} from "../services/file-storage.service.js";
import { markFileReferencesInactive } from "../models/file-registry.model.js";
import {
  getManagedMmfPrintReadyFileAbsolutePath,
} from "../utils/mmf-print-ready-storage.util.js";
import {
  generateStoredLocalDesignSnapshot,
  generateStoredMmfPrintReadySnapshot,
} from "../utils/model-snapshot.util.js";
import {
  enqueueDesignModerationRun,
  queueDesignAiModerationRun,
} from "../services/design-ai-moderation-orchestrator.service.js";
import {
  listLocalDesignModerationRunItems,
  listLocalDesignModerationRuns,
} from "../models/local-design-moderation-run.model.js";
import { cacheMmfObjectPrintReadyFile } from "../services/mmf-print-ready-mapping.service.js";

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

function resolveAdminDesignAction({ action, existingDesign, feedback }) {
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

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function parseJsonSafely(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function requirePrintReadyVerification({
  isEnabling,
  confirmation,
  targetLabel,
}) {
  if (!isEnabling) {
    return;
  }

  const isConfirmed =
    confirmation === true ||
    ["true", "1", "yes"].includes(
      String(confirmation ?? "")
        .trim()
        .toLowerCase(),
    );

  if (!isConfirmed) {
    throw new ApiError(
      400,
      `${targetLabel} requires admin confirmation that the printable file was verified locally before enabling Print Ready.`,
    );
  }
}

function buildPrintReadyVerificationMetadata(body, adminUserId) {
  return {
    verificationConfirmed: true,
    verificationNote: normalizeOptionalText(body.verificationNote),
    checklist: {
      localSlicerVerified: true,
      supportedFileType: true,
      orientationScaleReviewed: true,
      contentSafeForFabLab: true,
    },
    verifiedBy: adminUserId,
    verifiedAt: new Date().toISOString(),
  };
}

function resolveMappingStatus({
  isPrintReady,
  linkedLocalDesignId,
  body,
  fallbackStatus = null,
}) {
  if (!isPrintReady) {
    return "not_requested";
  }

  if (!linkedLocalDesignId) {
    return fallbackStatus || "needs_file";
  }

  if (Object.prototype.hasOwnProperty.call(body, "linkedLocalDesignId")) {
    return "manual_link";
  }

  return fallbackStatus || "mapped";
}

function parsePrintReadyFilter(value) {
  if (!hasText(value)) {
    return null;
  }

  return ["true", "1"].includes(String(value).trim().toLowerCase());
}

function buildOverrideMap(overrides) {
  const map = new Map();

  for (const override of overrides) {
    map.set(Number(override.mmf_object_id), override);
  }

  return map;
}

function applyOverrideToMmfItem(item, override) {
  const normalizedOverride = normalizeDesignOverride(override);

  return {
    ...item,
    override: normalizedOverride
      ? normalizedOverride
      : {
          isHidden: false,
          isPinned: false,
          isPrintReady: false,
          linkedLocalDesignId: null,
          printReadyFileId: null,
          printReadyFile: null,
          clientNote: null,
          mappingStatus: "not_requested",
          mappingError: null,
          mappingMetadata: null,
          printReadyVerifiedAt: null,
          printReadyVerifiedBy: null,
        },
  };
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSearchTokens(searchQuery) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "by",
    "for",
    "of",
    "the",
    "to",
    "with",
  ]);

  return normalizeSearchText(searchQuery)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .flatMap((token) => {
      if (token.endsWith("s") && token.length > 3) {
        return [token, token.slice(0, -1)];
      }

      return [token];
    });
}

function scoreMmfSearchResult(item, searchQuery) {
  const normalizedQuery = normalizeSearchText(searchQuery);
  const tokens = [...new Set(getSearchTokens(searchQuery))];

  if (!normalizedQuery || tokens.length === 0) {
    return 0;
  }

  const title = normalizeSearchText(item.name || item.title);
  const description = normalizeSearchText(item.description);
  const designer = normalizeSearchText(
    item.designer?.name || item.designer?.username,
  );
  const tags = normalizeSearchText(
    (item.tags || [])
      .map((tag) =>
        typeof tag === "string" ? tag : tag?.name || tag?.slug || "",
      )
      .join(" "),
  );
  const categories = normalizeSearchText(
    (item.categories || [])
      .map((category) => category?.name || category?.slug || "")
      .join(" "),
  );

  const allSearchableText = [
    title,
    description,
    designer,
    tags,
    categories,
  ]
    .filter(Boolean)
    .join(" ");

  let score = 0;

  if (title === normalizedQuery) score += 160;
  if (title.includes(normalizedQuery)) score += 110;
  if (tags.includes(normalizedQuery)) score += 70;
  if (categories.includes(normalizedQuery)) score += 60;
  if (designer.includes(normalizedQuery)) score += 30;
  if (description.includes(normalizedQuery)) score += 20;

  for (const token of tokens) {
    if (title.includes(token)) score += 25;
    if (tags.includes(token)) score += 18;
    if (categories.includes(token)) score += 14;
    if (designer.includes(token)) score += 8;
    if (description.includes(token)) score += 4;
  }

  const matchedTokenCount = tokens.filter((token) =>
    allSearchableText.includes(token),
  ).length;

  if (matchedTokenCount === tokens.length) {
    score += 45;
  } else if (matchedTokenCount > 0) {
    score += matchedTokenCount * 8;
  }

  return score;
}

function rankMmfSearchResults(items, searchQuery, sortMode) {
  if (!Array.isArray(items) || items.length === 0 || sortMode !== "relevance") {
    return items;
  }

  const scoredItems = items.map((item, index) => ({
    item,
    index,
    score: scoreMmfSearchResult(item, searchQuery),
  }));

  const hasPositiveScore = scoredItems.some((entry) => entry.score > 0);

  if (!hasPositiveScore) {
    return items;
  }

  return scoredItems
    .filter((entry) => entry.score > 0 || entry.item.override?.isPinned)
    .sort((a, b) => {
      const pinnedDelta =
        Number(Boolean(b.item.override?.isPinned)) -
        Number(Boolean(a.item.override?.isPinned));

      if (pinnedDelta !== 0) return pinnedDelta;
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function hasDesignLibraryFilters(req) {
  return [
    req.query.q,
    req.query.category,
    req.query.tag,
    req.query.sourceKind,
    req.query.printReady,
  ].some(hasText);
}

function isCuratedMmfOverride(override) {
  return (
    !override.is_hidden &&
    (Boolean(override.is_pinned) || Boolean(override.is_print_ready))
  );
}

async function getCuratedMmfOverrides() {
  return (await getAllDesignOverrides())
    .filter(isCuratedMmfOverride)
    .sort((a, b) => {
      const pinnedDelta =
        Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));

      if (pinnedDelta !== 0) return pinnedDelta;

      const readyDelta =
        Number(Boolean(b.is_print_ready)) - Number(Boolean(a.is_print_ready));

      if (readyDelta !== 0) return readyDelta;

      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

async function buildCuratedMmfSection(limit = 6, overrides = null) {
  const curatedOverrides = overrides || (await getCuratedMmfOverrides());
  const visibleOverrides = curatedOverrides.slice(0, limit);

  const items = await Promise.all(
    visibleOverrides.map(async (override) => {
      try {
        const object = await getObjectById(override.mmf_object_id);
        return applyOverrideToMmfItem(object, override);
      } catch {
        return null;
      }
    }),
  );

  return items.filter(Boolean);
}

async function buildDesignLibrarySections() {
  const [featured, printReady, lab, community, externalReferences] =
    await Promise.all([
      listLibrarySectionDesigns({ featured: true, limit: 8 }),
      listLibrarySectionDesigns({ printReady: true, limit: 8 }),
      listLibrarySectionDesigns({ sourceKind: "lab", limit: 8 }),
      listLibrarySectionDesigns({ sourceKind: "community", limit: 8 }),
      buildCuratedMmfSection(6),
    ]);

  return {
    featured: featured.map(normalizeLocalDesign),
    printReady: printReady.map(normalizeLocalDesign),
    lab: lab.map(normalizeLocalDesign),
    community: community.map(normalizeLocalDesign),
    externalReferences,
  };
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalizedValue)) {
    return false;
  }

  throw new ApiError(400, `${fieldName} must be a valid boolean value`);
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
  }

  return [];
}

function isTruthyBodyBoolean(value) {
  return ["true", "1", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function hasMeaningfulOverrideBody(body = {}) {
  return (
    isTruthyBodyBoolean(body.isHidden) ||
    isTruthyBodyBoolean(body.isPinned) ||
    isTruthyBodyBoolean(body.isPrintReady) ||
    hasText(body.clientNote)
  );
}

function parseJsonList(value) {
  if (!hasText(value)) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseAssetIntent(body = {}) {
  return {
    removeFileIds: parseIdList(body.removeFileIds),
    removeImageIds: parseIdList(body.removeImageIds),
    replaceFileId: hasText(body.replaceFileId) ? Number(body.replaceFileId) : null,
    replaceImageId: hasText(body.replaceImageId)
      ? Number(body.replaceImageId)
      : null,
    primaryFileId: Object.prototype.hasOwnProperty.call(body, "primaryFileId")
      ? hasText(body.primaryFileId)
        ? Number(body.primaryFileId)
        : null
      : undefined,
    primaryImageId: Object.prototype.hasOwnProperty.call(body, "primaryImageId")
      ? hasText(body.primaryImageId)
        ? Number(body.primaryImageId)
        : null
      : undefined,
    fileOrder: parseIdList(parseJsonList(body.fileOrder)),
    imageOrder: parseIdList(parseJsonList(body.imageOrder)),
  };
}

function activeDesignFiles(localDesign) {
  return (localDesign?.files || []).filter(
    (file) => (file.status || "active") === "active",
  );
}

function activeDesignImages(localDesign) {
  return (localDesign?.images || []).filter(
    (image) => (image.status || "active") === "active",
  );
}

function getUploadedFile(req, fieldName) {
  const files = req.files?.[fieldName];

  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  return files[0];
}

function getUploadedFiles(req, ...fieldNames) {
  const uploadedFiles = [];

  for (const fieldName of fieldNames) {
    const files = req.files?.[fieldName];

    if (Array.isArray(files) && files.length > 0) {
      uploadedFiles.push(...files);
    }
  }

  return uploadedFiles;
}

function buildStoredLocalDesignPath(file, fileType) {
  if (!file?.filename) {
    return null;
  }

  if (fileType === "design") {
    return `/storage/local-designs/files/${file.filename}`;
  }

  if (fileType === "thumbnail") {
    return `/storage/local-designs/thumbnails/${file.filename}`;
  }

  return null;
}

function getUploadExtension(file) {
  const name = file?.originalname || file?.filename || "";
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : null;
}

async function getUploadedFileChecksum(file) {
  if (!file?.path) {
    return null;
  }

  try {
    const fileBuffer = await fs.promises.readFile(file.path);
    return createHash("sha256").update(fileBuffer).digest("hex");
  } catch {
    return null;
  }
}

async function buildLocalDesignFilePayload({
  localDesignId,
  file,
  sortOrder,
  isPrimary,
  isPrintReady = false,
  actorId = null,
  connection = null,
  generatedSnapshotPaths = null,
}) {
  const fileUrl = buildStoredLocalDesignPath(file, "design");
  const modelPath = getManagedLocalDesignAbsolutePath(fileUrl, "design");
  const modelSnapshotUrl =
    modelPath && fs.existsSync(modelPath)
      ? await generateStoredLocalDesignSnapshot(modelPath)
      : null;

  if (modelSnapshotUrl && Array.isArray(generatedSnapshotPaths)) {
    generatedSnapshotPaths.push(modelSnapshotUrl);
  }

  const checksumSha256 = await getUploadedFileChecksum(file);
  const fileObject = modelPath
    ? await registerManagedPublicPath({
        publicPath: fileUrl,
        originalFileName: file.originalname || file.filename || null,
        mimeType: file.mimetype || null,
        visibility: "private",
        createdBy: actorId,
        connection,
      })
    : null;
  const modelSnapshotFileObject = modelSnapshotUrl
    ? await registerManagedPublicPath({
        publicPath: modelSnapshotUrl,
        originalFileName: `${file.originalname || file.filename || "model"}-snapshot.png`,
        mimeType: "image/png",
        visibility: "public",
        createdBy: actorId,
        connection,
      })
    : null;

  return {
    localDesignId,
    fileUrl: fileObject?.publicPath || fileUrl,
    uploadedFileUrl: fileUrl,
    fileObjectId: fileObject?.id || null,
    modelSnapshotUrl: modelSnapshotFileObject?.publicPath || modelSnapshotUrl,
    modelSnapshotFileObjectId: modelSnapshotFileObject?.id || null,
    originalFileName: file.originalname || file.filename || null,
    extension: getUploadExtension(file),
    fileSize: fileObject?.fileSize || file.size || null,
    checksumSha256: fileObject?.checksumSha256 || checksumSha256,
    sortOrder,
    isPrimary,
    isPrintReady,
  };
}

async function persistUploadedLocalDesignAssets({
  localDesignId,
  designFiles,
  thumbnailImages,
  connection,
  primaryFileIndex = 0,
  primaryImageIndex = 0,
  fileSortOffset = 0,
  imageSortOffset = 0,
  isPrintReady = false,
  actorId = null,
  generatedSnapshotPaths = null,
}) {
  const seenFileChecksums = new Set();
  let persistedFileIndex = 0;
  const persistedFiles = [];
  const persistedImages = [];
  const duplicateDesignPaths = [];
  const duplicateThumbnailPaths = [];

  for (const [index, file] of designFiles.entries()) {
    const checksumSha256 = await getUploadedFileChecksum(file);

    if (checksumSha256) {
      const uploadedFileUrl = buildStoredLocalDesignPath(file, "design");

      if (seenFileChecksums.has(checksumSha256)) {
        duplicateDesignPaths.push(uploadedFileUrl);
        continue;
      }

      const existingFile = await getLocalDesignFileByChecksum(
        {
          localDesignId,
          checksumSha256,
        },
        connection,
      );

      if (existingFile) {
        seenFileChecksums.add(checksumSha256);
        duplicateDesignPaths.push(uploadedFileUrl);
        continue;
      }

      seenFileChecksums.add(checksumSha256);
    }

    const filePayload = await buildLocalDesignFilePayload({
        localDesignId,
        file,
        sortOrder: fileSortOffset + persistedFileIndex,
        isPrimary: index === primaryFileIndex,
        isPrintReady: index === primaryFileIndex && isPrintReady,
        actorId,
        connection,
        generatedSnapshotPaths,
      });

    const fileRecord = await createLocalDesignFile(filePayload, connection);
    persistedFiles.push(fileRecord);
    persistedFileIndex += 1;
    if (fileRecord?.fileObjectId) {
      await attachManagedFileReference({
        fileObjectId: fileRecord.fileObjectId,
        referenceType: "local_design_file",
        referenceId: fileRecord.id,
        referenceColumn: "file_object_id",
        fileRole: "model",
        ownerUserId: actorId,
        visibility: "private",
        actorId,
        connection,
      });
    }
    if (fileRecord?.modelSnapshotFileObjectId) {
      await attachManagedFileReference({
        fileObjectId: fileRecord.modelSnapshotFileObjectId,
        referenceType: "local_design_file",
        referenceId: fileRecord.id,
        referenceColumn: "model_snapshot_file_object_id",
        fileRole: "thumbnail",
        ownerUserId: actorId,
        visibility: "public",
        actorId,
        connection,
      });
    }

    if (fileRecord?.modelSnapshotUrl) {
      await createLocalDesignModelSnapshotRender(
        {
          localDesignId,
          angleLabel: `file-${fileRecord.id}`,
          imageUrl: fileRecord.modelSnapshotUrl,
          fileObjectId: fileRecord.modelSnapshotFileObjectId || null,
        },
        connection,
      );
    }
  }

  const seenImageUrls = new Set();
  const seenImageChecksums = new Set();
  let persistedImageIndex = 0;

  for (const [index, file] of thumbnailImages.entries()) {
    const imageUrl = buildStoredLocalDesignPath(file, "thumbnail");
    const checksumSha256 = await getUploadedFileChecksum(file);

    if (!imageUrl || seenImageUrls.has(imageUrl)) {
      if (imageUrl) duplicateThumbnailPaths.push(imageUrl);
      continue;
    }

    if (checksumSha256) {
      if (seenImageChecksums.has(checksumSha256)) {
        duplicateThumbnailPaths.push(imageUrl);
        continue;
      }

      const existingImageByChecksum = await getLocalDesignImageByChecksum(
        {
          localDesignId,
          checksumSha256,
        },
        connection,
      );

      if (existingImageByChecksum) {
        seenImageChecksums.add(checksumSha256);
        duplicateThumbnailPaths.push(imageUrl);
        continue;
      }

      seenImageChecksums.add(checksumSha256);
    }

    const imagePath = getManagedLocalDesignAbsolutePath(imageUrl, "thumbnail");
    const imageFileObject = imagePath
      ? await registerManagedPublicPath({
          publicPath: imageUrl,
          originalFileName: file.originalname || file.filename || null,
          mimeType: file.mimetype || null,
          visibility: "public",
          createdBy: actorId,
          connection,
        })
      : null;
    const resolvedImageUrl = imageFileObject?.publicPath || imageUrl;
    const resolvedImageChecksum =
      imageFileObject?.checksumSha256 || checksumSha256;

    const existingImage = await getLocalDesignImageByUrl(
      {
        localDesignId,
        imageUrl: resolvedImageUrl,
      },
      connection,
    );

    if (existingImage) {
      seenImageUrls.add(resolvedImageUrl);
      duplicateThumbnailPaths.push(imageUrl);
      continue;
    }

    seenImageUrls.add(resolvedImageUrl);

    const imageRecord = await createLocalDesignImage(
      {
        localDesignId,
        imageUrl: resolvedImageUrl,
        fileObjectId: imageFileObject?.id || null,
        originalFileName: file.originalname || file.filename || null,
        checksumSha256: resolvedImageChecksum,
        sortOrder: imageSortOffset + persistedImageIndex,
        isPrimary: index === primaryImageIndex,
      },
      connection,
    );
    if (imageRecord?.fileObjectId) {
      await attachManagedFileReference({
        fileObjectId: imageRecord.fileObjectId,
        referenceType: "local_design_image",
        referenceId: imageRecord.id,
        referenceColumn: "file_object_id",
        fileRole: "thumbnail",
        ownerUserId: actorId,
        visibility: "public",
        actorId,
        connection,
      });
    }
    persistedImages.push(imageRecord);

    persistedImageIndex += 1;
  }

  return {
    files: persistedFiles,
    images: persistedImages,
    duplicateDesignPaths,
    duplicateThumbnailPaths,
  };
}

function normalizeLocalDesign(localDesign) {
  if (!localDesign) {
    return null;
  }

  const files = Array.isArray(localDesign.files) ? localDesign.files : [];
  const images = Array.isArray(localDesign.images) ? localDesign.images : [];
  const activeFiles = files.filter((file) => (file.status || "active") === "active");
  const activeImages = images.filter(
    (image) => (image.status || "active") === "active",
  );
  const primaryFile =
    activeFiles.find((file) => file.isPrimary) ||
    activeFiles[0] ||
    (localDesign.file_url
      ? {
          id: null,
          localDesignId: localDesign.id,
          fileUrl: localDesign.file_url,
          modelSnapshotUrl: localDesign.model_snapshot_url || null,
          originalFileName: null,
          extension: getUploadExtension({ originalname: localDesign.file_url }),
          fileSize: null,
          sortOrder: 0,
          isPrimary: true,
          isPrintReady: Boolean(localDesign.is_print_ready),
          printReadyAt: localDesign.print_ready_at,
          printReadyBy: localDesign.print_ready_by,
        }
      : null);
  const primaryImage =
    activeImages.find((image) => image.isPrimary) ||
    activeImages[0] ||
    (localDesign.thumbnail_url
      ? {
          id: null,
          localDesignId: localDesign.id,
          imageUrl: localDesign.thumbnail_url,
          originalFileName: null,
          sortOrder: 0,
          isPrimary: true,
        }
      : null);
  const normalizedFiles = files.map((file) => ({
    ...file,
    fileUrl: file.fileObjectId
      ? buildDownloadUrl(file.fileObjectId, { inline: true })
      : file.fileUrl,
    modelSnapshotUrl: file.modelSnapshotFileObjectId
      ? buildDownloadUrl(file.modelSnapshotFileObjectId, { inline: true })
      : file.modelSnapshotUrl,
  }));
  const normalizedImages = images.map((image) => ({
    ...image,
    imageUrl: image.fileObjectId
      ? buildDownloadUrl(image.fileObjectId, { inline: true })
      : image.imageUrl,
  }));
  const normalizedPrimaryFileUrl = primaryFile?.fileObjectId
    ? buildDownloadUrl(primaryFile.fileObjectId, { inline: true })
    : primaryFile?.fileUrl || localDesign.file_url;
  const normalizedPrimarySnapshotUrl = primaryFile?.modelSnapshotFileObjectId
    ? buildDownloadUrl(primaryFile.modelSnapshotFileObjectId, { inline: true })
    : primaryFile?.modelSnapshotUrl || localDesign.model_snapshot_url || null;
  const normalizedPrimaryImageUrl = primaryImage?.fileObjectId
    ? buildDownloadUrl(primaryImage.fileObjectId, { inline: true })
    : primaryImage?.imageUrl || localDesign.thumbnail_url;

  return {
    id: localDesign.id,
    source: "local",
    sourceKind: localDesign.source_kind,
    moderationStatus: localDesign.moderation_status,
    title: localDesign.title,
    description: localDesign.description,
    thumbnailUrl: normalizedPrimaryImageUrl,
    modelSnapshotUrl: normalizedPrimarySnapshotUrl,
    fileUrl: normalizedPrimaryFileUrl,
    files: normalizedFiles,
    images: normalizedImages,
    primaryFile: primaryFile
      ? {
          ...primaryFile,
          fileUrl: normalizedPrimaryFileUrl,
          modelSnapshotUrl: normalizedPrimarySnapshotUrl,
        }
      : null,
    primaryImage: primaryImage
      ? {
          ...primaryImage,
          imageUrl: normalizedPrimaryImageUrl,
        }
      : null,
    material: localDesign.material,
    dimensions: localDesign.dimensions,
    licenseType: localDesign.license_type,
    category: localDesign.category_id
      ? {
          id: localDesign.category_id,
          name: localDesign.category_name,
          slug: localDesign.category_slug,
          description: localDesign.category_description,
        }
      : null,
    tags: Array.isArray(localDesign.tags) ? localDesign.tags : [],
    isActive: Boolean(localDesign.is_active),
    isPrintReady: Boolean(localDesign.is_print_ready),
    isFeatured: Boolean(localDesign.is_featured),
    featuredRank: Number(localDesign.featured_rank || 0),
    featuredAt: localDesign.featured_at,
    featuredBy: localDesign.featured_by,
    libraryNote: localDesign.library_note,
    isLibraryHidden: Boolean(localDesign.is_library_hidden),
    ownershipConfirmed: Boolean(localDesign.ownership_confirmed),
    policyAcknowledged: Boolean(localDesign.policy_acknowledged),
    moderationFlags: localDesign.moderation_flags,
    moderationSummary: localDesign.moderation_summary,
    moderationFeedback: localDesign.moderation_feedback,
    moderationDecisionSource: localDesign.moderation_decision_source,
    latestModerationRunId: localDesign.latest_moderation_run_id,
    moderationContentHash: localDesign.moderation_content_hash,
    moderationPolicyVersion: localDesign.moderation_policy_version,
    publishedAt: localDesign.published_at,
    reviewedAt: localDesign.reviewed_at,
    reviewedBy: localDesign.reviewed_by,
    printReadyAt: localDesign.print_ready_at,
    printReadyBy: localDesign.print_ready_by,
    uploadedBy: localDesign.uploaded_by,
    archivedAt: localDesign.archived_at,
    archivedBy: localDesign.archived_by,
    deletedAt: localDesign.deleted_at,
    deletedBy: localDesign.deleted_by,
    deleteReason: localDesign.delete_reason,
    createdAt: localDesign.created_at,
    updatedAt: localDesign.updated_at,
    savedAt: localDesign.saved_at || null,
  };
}

async function ensureLocalDesignSnapshot(localDesign) {
  if (!localDesign || !hasText(localDesign.file_url)) {
    return localDesign;
  }

  const existingSnapshotUrl = await getLatestLocalDesignModelSnapshotUrl(
    localDesign.id,
  );

  if (existingSnapshotUrl) {
    return {
      ...localDesign,
      model_snapshot_url: existingSnapshotUrl,
    };
  }

  const modelPath = getManagedLocalDesignAbsolutePath(
    localDesign.file_url,
    "design",
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    return localDesign;
  }

  const modelSnapshotUrl = await generateStoredLocalDesignSnapshot(modelPath);

  if (!modelSnapshotUrl) {
    return localDesign;
  }

  await createLocalDesignModelSnapshotRender({
    localDesignId: localDesign.id,
    imageUrl: modelSnapshotUrl,
  });

  return {
    ...localDesign,
    model_snapshot_url: modelSnapshotUrl,
  };
}

function normalizeDesignOverride(designOverride) {
  if (!designOverride) {
    return null;
  }

  const mappingStatus =
    designOverride.mapping_status ||
    (designOverride.print_ready_file_id || designOverride.linked_local_design_id
      ? "mapped"
      : "not_requested");
  const mappingMetadata = parseJsonSafely(designOverride.mapping_metadata);
  const printReadyFile = designOverride.print_ready_file_id
    ? {
        id: designOverride.print_ready_file_id,
        cachedFileUrl: designOverride.print_ready_file_file_object_id
          ? buildDownloadUrl(designOverride.print_ready_file_file_object_id, {
              inline: true,
            })
          : designOverride.print_ready_file_cached_file_url,
        fileObjectId: designOverride.print_ready_file_file_object_id || null,
        modelSnapshotUrl:
          designOverride.print_ready_file_model_snapshot_file_object_id
            ? buildDownloadUrl(
                designOverride.print_ready_file_model_snapshot_file_object_id,
                { inline: true },
              )
            : designOverride.print_ready_file_model_snapshot_url,
        modelSnapshotFileObjectId:
          designOverride.print_ready_file_model_snapshot_file_object_id || null,
        originalFileName: designOverride.print_ready_file_original_file_name,
        extension: designOverride.print_ready_file_extension,
        fileSize: designOverride.print_ready_file_size,
        status: designOverride.print_ready_file_status,
        verifiedAt: designOverride.print_ready_file_verified_at,
      }
    : null;
  const printReadyFiles = Array.isArray(designOverride.print_ready_files)
    ? designOverride.print_ready_files.map((file) => ({
        id: file.id,
        cachedFileUrl: file.file_object_id
          ? buildDownloadUrl(file.file_object_id, { inline: true })
          : file.cached_file_url,
        fileObjectId: file.file_object_id || null,
        modelSnapshotUrl: file.model_snapshot_file_object_id
          ? buildDownloadUrl(file.model_snapshot_file_object_id, { inline: true })
          : file.model_snapshot_url,
        modelSnapshotFileObjectId: file.model_snapshot_file_object_id || null,
        originalFileName: file.original_file_name,
        extension: file.extension,
        fileSize: file.file_size,
        status: file.status,
        verifiedAt: file.verified_at,
        isPrimary: Boolean(file.is_primary),
        sortOrder: Number(file.sort_order || 0),
        mmfFileId: file.mmf_file_id,
        archiveEntryPath: file.archive_entry_path,
        archiveEntryName: file.archive_entry_name,
      }))
    : printReadyFile
      ? [printReadyFile]
      : [];

  return {
    id: designOverride.id,
    mmfObjectId: designOverride.mmf_object_id,
    isHidden: Boolean(designOverride.is_hidden),
    isPinned: Boolean(designOverride.is_pinned),
    isPrintReady: Boolean(designOverride.is_print_ready),
    linkedLocalDesignId: designOverride.linked_local_design_id || null,
    printReadyFileId: designOverride.print_ready_file_id || null,
    printReadyFile,
    printReadyFiles,
    mappingStatus,
    mappingError: designOverride.mapping_error || null,
    mappingMetadata,
    mappingDiagnostics: {
      status: mappingStatus,
      message: buildMmfMappingDiagnosticMessage({
        isPrintReady: Boolean(designOverride.is_print_ready),
        linkedLocalDesignId: designOverride.linked_local_design_id,
        printReadyFile,
        mappingStatus,
        mappingError: designOverride.mapping_error,
      }),
    },
    printReadyVerifiedAt: designOverride.print_ready_verified_at,
    printReadyVerifiedBy: designOverride.print_ready_verified_by,
    clientNote: designOverride.client_note,
    createdBy: designOverride.created_by,
    updatedBy: designOverride.updated_by,
    createdAt: designOverride.created_at,
    updatedAt: designOverride.updated_at,
  };
}

function buildMmfMappingDiagnosticMessage({
  isPrintReady,
  linkedLocalDesignId,
  printReadyFile,
  mappingStatus,
  mappingError,
}) {
  if (!isPrintReady) {
    return "Print Ready cached-file setup has not been requested for this MMF design.";
  }

  if (mappingStatus === "failed") {
    return mappingError || "MMF file caching failed. Review the source files or retry later.";
  }

  if (printReadyFile) {
    return "This MMF design has a backend-cached printable file for instant quote.";
  }

  if (linkedLocalDesignId) {
    return "This MMF design uses a legacy linked local file.";
  }

  if (mappingStatus === "needs_file") {
    return "Print Ready is blocked until a backend-managed printable file is mapped.";
  }

  return "MMF mapping status is pending review.";
}

async function ensureMmfPrintReadySnapshot(override) {
  if (
    !override?.print_ready_file_id ||
    !override.print_ready_file_cached_file_url ||
    override.print_ready_file_model_snapshot_url
  ) {
    return override;
  }

  const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
    override.print_ready_file_cached_file_url,
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    return override;
  }

  const modelSnapshotUrl = await generateStoredMmfPrintReadySnapshot(modelPath);

  if (!modelSnapshotUrl) {
    return override;
  }

  const modelSnapshotFileObject = await registerManagedPublicPath({
    publicPath: modelSnapshotUrl,
    visibility: "public",
    createdBy: null,
    dedupe: false,
  });

  await updateMmfPrintReadyFileSnapshotById(
    override.print_ready_file_id,
    modelSnapshotUrl,
    modelSnapshotFileObject?.id || null,
  );

  if (modelSnapshotFileObject?.id) {
    await attachManagedFileReference({
      fileObjectId: modelSnapshotFileObject.id,
      referenceType: "mmf_print_ready_file",
      referenceId: override.print_ready_file_id,
      referenceColumn: "model_snapshot_file_object_id",
      fileRole: "thumbnail",
      ownerUserId: null,
      visibility: "public",
    });
  }

  return {
    ...override,
    print_ready_file_model_snapshot_url: modelSnapshotUrl,
    print_ready_file_model_snapshot_file_object_id:
      modelSnapshotFileObject?.id || null,
  };
}

async function ensureMmfPrintReadyFileSnapshot(printReadyFile) {
  if (
    !printReadyFile?.id ||
    !printReadyFile.cached_file_url ||
    printReadyFile.model_snapshot_url
  ) {
    return printReadyFile;
  }

  const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
    printReadyFile.cached_file_url,
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    return printReadyFile;
  }

  const modelSnapshotUrl = await generateStoredMmfPrintReadySnapshot(modelPath);

  if (!modelSnapshotUrl) {
    return printReadyFile;
  }

  const modelSnapshotFileObject = await registerManagedPublicPath({
    publicPath: modelSnapshotUrl,
    visibility: "public",
    createdBy: null,
    dedupe: false,
  });

  await updateMmfPrintReadyFileSnapshotById(
    printReadyFile.id,
    modelSnapshotUrl,
    modelSnapshotFileObject?.id || null,
  );

  if (modelSnapshotFileObject?.id) {
    await attachManagedFileReference({
      fileObjectId: modelSnapshotFileObject.id,
      referenceType: "mmf_print_ready_file",
      referenceId: printReadyFile.id,
      referenceColumn: "model_snapshot_file_object_id",
      fileRole: "thumbnail",
      ownerUserId: null,
      visibility: "public",
    });
  }

  return {
    ...printReadyFile,
    model_snapshot_url: modelSnapshotUrl,
    model_snapshot_file_object_id: modelSnapshotFileObject?.id || null,
  };
}

function normalizeCategory(category) {
  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: Boolean(category.is_active),
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

function normalizeTag(tag) {
  if (!tag) {
    return null;
  }

  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    isActive: Boolean(tag.is_active),
    createdAt: tag.created_at,
    updatedAt: tag.updated_at,
  };
}

function normalizeLocalDesignAuditEvent(event) {
  return {
    id: event.id,
    localDesignId: event.local_design_id,
    actorId: event.actor_id,
    actorType: event.actor_type,
    eventType: event.event_type,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    summary: event.summary,
    metadata: event.metadata,
    createdAt: event.created_at,
  };
}

function normalizeModerationRunForResponse(run, items = []) {
  return {
    ...run,
    flags: Array.isArray(run.flags) ? run.flags : [],
    items,
  };
}

async function resolveLocalDesignTaxonomy({
  body,
  connection,
  existingLocalDesign = null,
}) {
  let categoryId = existingLocalDesign?.category_id || null;

  if (Object.prototype.hasOwnProperty.call(body, "categoryId")) {
    categoryId = body.categoryId ? Number(body.categoryId) : null;

    if (categoryId) {
      const category = await getDesignCategoryById(categoryId, connection);

      if (!category || !category.is_active) {
        throw new ApiError(400, "Selected design category is unavailable");
      }
    }
  }

  if (hasText(body.categoryName)) {
    throw new ApiError(
      400,
      "Category must be selected from the approved Design Library taxonomy",
    );
  }

  if (hasText(body.tagNames)) {
    throw new ApiError(
      400,
      "Tags must be selected from the approved Design Library taxonomy",
    );
  }

  const hasTagUpdate = Object.prototype.hasOwnProperty.call(body, "tagIds");

  const tagIds = parseIdList(body.tagIds);

  if (tagIds.length > 0) {
    const tags = await getDesignTagsByIds(tagIds, connection);
    const activeTagIds = new Set(
      tags.filter((tag) => tag.is_active).map((tag) => Number(tag.id)),
    );
    const missingOrInactiveTagIds = tagIds.filter(
      (tagId) => !activeTagIds.has(Number(tagId)),
    );

    if (missingOrInactiveTagIds.length > 0) {
      throw new ApiError(
        400,
        "One or more selected design tags are unavailable",
      );
    }
  }

  return {
    categoryId,
    tagIds: [...new Set(tagIds)],
    hasTagUpdate,
  };
}

async function resolveLinkedLocalDesignId(body) {
  if (!Object.prototype.hasOwnProperty.call(body, "linkedLocalDesignId")) {
    return null;
  }

  if (!hasText(body.linkedLocalDesignId)) {
    return null;
  }

  const linkedLocalDesignId = Number(body.linkedLocalDesignId);
  const localDesign = await getLocalDesignById(linkedLocalDesignId);

  if (!localDesign) {
    throw new ApiError(
      400,
      "Linked local design must be active and available to clients",
    );
  }

  return linkedLocalDesignId;
}

function parseSelectedMmfFileMappings(body) {
  const mappings = [];

  if (Array.isArray(body.selectedMmfFiles)) {
    for (const item of body.selectedMmfFiles) {
      const fileId = Number(item?.fileId ?? item?.selectedMmfFileId);

      if (!Number.isInteger(fileId) || fileId <= 0) {
        continue;
      }

      mappings.push({
        selectedMmfFileId: fileId,
        selectedArchiveEntryPath: hasText(item?.archiveEntryPath)
          ? String(item.archiveEntryPath)
          : null,
      });
    }
  }

  if (mappings.length === 0) {
    const selectedFileIds = parseIdList(body.selectedMmfFileIds);

    if (selectedFileIds.length > 0) {
      for (const fileId of selectedFileIds) {
        mappings.push({
          selectedMmfFileId: fileId,
          selectedArchiveEntryPath:
            typeof body.selectedArchiveEntryPaths === "object"
              ? body.selectedArchiveEntryPaths?.[fileId] || null
              : null,
        });
      }
    }
  }

  if (mappings.length === 0 && hasText(body.selectedMmfFileId)) {
    mappings.push({
      selectedMmfFileId: body.selectedMmfFileId,
      selectedArchiveEntryPath: body.selectedArchiveEntryPath || null,
    });
  }

  const seen = new Set();
  return mappings.filter((mapping) => {
    const key = `${mapping.selectedMmfFileId}::${mapping.selectedArchiveEntryPath || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function resolveMmfPrintReadyFileMapping({
  mmfObjectId,
  body,
  existingLinkedLocalDesignId = null,
  isPrintReady,
  adminUserId,
}) {
  const linkedLocalDesignId = Object.prototype.hasOwnProperty.call(
    body,
    "linkedLocalDesignId",
  )
    ? await resolveLinkedLocalDesignId(body)
    : existingLinkedLocalDesignId;

  if (!isPrintReady || linkedLocalDesignId) {
    return {
      linkedLocalDesignId,
      mappingStatus: resolveMappingStatus({
        isPrintReady,
        linkedLocalDesignId,
        body,
      }),
      mappingError: null,
      mappingMetadata: null,
    };
  }

  const mmfObject = await getObjectById(mmfObjectId);
  const selectedMappings = parseSelectedMmfFileMappings(body);

  if (selectedMappings.length === 0) {
    throw new ApiError(
      400,
      "Select at least one MyMiniFactory file before enabling Print Ready mapping.",
    );
  }

  const mappingResults = [];

  for (const selectedMapping of selectedMappings) {
    mappingResults.push(
      await cacheMmfObjectPrintReadyFile({
        mmfObject,
        adminUserId,
        selectedMmfFileId: selectedMapping.selectedMmfFileId,
        selectedArchiveEntryPath: selectedMapping.selectedArchiveEntryPath,
      }),
    );
  }

  const primaryMappingResult = mappingResults[0];
  const { printReadyFile, selectedFile, selectedArchiveEntry, sourceSnapshot } =
    primaryMappingResult;

  return {
    linkedLocalDesignId: null,
    mappingStatus: "mapped",
    mappingError: null,
    mappingMetadata: {
      mmfObjectId,
      sourceObjectName: mmfObject?.name || mmfObject?.title || null,
      printReadyFileId: printReadyFile.id,
      cachedFileUrl: printReadyFile.file_object_id
        ? buildDownloadUrl(printReadyFile.file_object_id, { inline: true })
        : printReadyFile.cached_file_url,
      fileObjectId: printReadyFile.file_object_id || null,
      selectedFile: selectedFile
        ? {
            id: selectedFile.id || null,
            name: selectedFile.name || selectedFile.filename || null,
            extension: selectedFile.extension || null,
            size: selectedFile.size || null,
          }
        : null,
      selectedArchiveEntry: selectedArchiveEntry || null,
      printReadyFiles: mappingResults.map((result) => ({
        id: result.printReadyFile.id,
        cachedFileUrl: result.printReadyFile.file_object_id
          ? buildDownloadUrl(result.printReadyFile.file_object_id, {
              inline: true,
            })
          : result.printReadyFile.cached_file_url,
        fileObjectId: result.printReadyFile.file_object_id || null,
        selectedFileId: result.selectedFile?.id || null,
        selectedArchiveEntry: result.selectedArchiveEntry || null,
      })),
      sourceSnapshot,
      mappedAt: new Date().toISOString(),
    },
  };
}

async function cleanupNewUploadedLocalDesignAssets(req) {
  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );

  for (const uploadedDesignFile of uploadedDesignFiles) {
    const uploadedDesignPath = buildStoredLocalDesignPath(
      uploadedDesignFile,
      "design",
    );
    await removeManagedLocalDesignFile(uploadedDesignPath, "design");
  }

  for (const uploadedThumbnailImage of uploadedThumbnailImages) {
    const uploadedThumbnailPath = buildStoredLocalDesignPath(
      uploadedThumbnailImage,
      "thumbnail",
    );
    await removeManagedLocalDesignFile(uploadedThumbnailPath, "thumbnail");
  }
}

async function cleanupManagedLocalDesignPublicPaths(publicPaths, assetType) {
  for (const publicPath of publicPaths.filter(Boolean)) {
    try {
      await removeManagedLocalDesignFile(publicPath, assetType);
    } catch {
      // Best-effort cleanup; the DB transaction has already decided ownership.
    }
  }
}

async function markLocalDesignAssetReferencesInactive({
  localDesign,
  status,
  reason,
  connection,
}) {
  for (const file of localDesign?.files || []) {
    await markFileReferencesInactive(
      {
        referenceType: "local_design_file",
        referenceId: file.id,
        status,
        reason,
      },
      connection,
    );
  }

  for (const image of localDesign?.images || []) {
    await markFileReferencesInactive(
      {
        referenceType: "local_design_image",
        referenceId: image.id,
        status,
        reason,
      },
      connection,
    );
  }
}

async function archiveMmfPrintReadyFilesAndReferences({
  mmfObjectId,
  errorMessage,
  connection = null,
}) {
  const existingFiles = await listMmfPrintReadyFilesByObjectId(
    mmfObjectId,
    connection,
  );
  const affectedCount = await archiveMmfPrintReadyFilesByObjectId(
    {
      mmfObjectId,
      errorMessage,
    },
    connection,
  );

  for (const printReadyFile of existingFiles.filter(
    (file) => file.status === "cached",
  )) {
    await markFileReferencesInactive(
      {
        referenceType: "mmf_print_ready_file",
        referenceId: printReadyFile.id,
        status: "archived",
        reason: errorMessage || "MMF Print Ready cached file was archived.",
      },
      connection,
    );
  }

  return affectedCount;
}

async function applyLocalDesignAssetIntent({
  localDesignId,
  existingLocalDesign,
  body,
  uploadedDesignFiles,
  uploadedThumbnailImages,
  actorId,
  actorType,
  connection,
  allowZeroActiveModelFiles = true,
  generatedSnapshotPaths = null,
}) {
  const intent = parseAssetIntent(body);
  const initialActiveFiles = activeDesignFiles(existingLocalDesign);
  const initialActiveImages = activeDesignImages(existingLocalDesign);
  const initialPrimaryFile = initialActiveFiles.find((file) => file.isPrimary);
  const initialPrimaryImage = initialActiveImages.find((image) => image.isPrimary);
  const replacementFileUpload =
    intent.replaceFileId && uploadedDesignFiles.length > 0
      ? uploadedDesignFiles[0]
      : null;
  const replacementImageUpload =
    intent.replaceImageId && uploadedThumbnailImages.length > 0
      ? uploadedThumbnailImages[0]
      : null;

  if (intent.replaceFileId && !replacementFileUpload) {
    throw new ApiError(400, "Upload a model file before replacing an existing design file");
  }

  if (intent.replaceImageId && !replacementImageUpload) {
    throw new ApiError(400, "Upload an image before replacing an existing preview image");
  }

  const replacedFile = intent.replaceFileId
    ? initialActiveFiles.find((file) => Number(file.id) === Number(intent.replaceFileId))
    : null;
  const replacedImage = intent.replaceImageId
    ? initialActiveImages.find((image) => Number(image.id) === Number(intent.replaceImageId))
    : null;

  if (intent.replaceFileId && !replacedFile) {
    throw new ApiError(400, "The selected model file cannot be replaced");
  }

  if (intent.replaceImageId && !replacedImage) {
    throw new ApiError(400, "The selected preview image cannot be replaced");
  }

  const filesForCreate = replacementFileUpload
    ? uploadedDesignFiles.slice(1)
    : uploadedDesignFiles;
  const imagesForCreate = replacementImageUpload
    ? uploadedThumbnailImages.slice(1)
    : uploadedThumbnailImages;
  const duplicateDesignPaths = [];
  const duplicateThumbnailPaths = [];
  const auditEvents = [];
  let replacementFileRecord = null;
  let replacementImageRecord = null;

  if (replacementFileUpload) {
    const result = await persistUploadedLocalDesignAssets({
      localDesignId,
      designFiles: [replacementFileUpload],
      thumbnailImages: [],
      connection,
      primaryFileIndex: -1,
      fileSortOffset: replacedFile.sortOrder,
      actorId,
      generatedSnapshotPaths,
    });
    duplicateDesignPaths.push(...result.duplicateDesignPaths);
    replacementFileRecord = result.files[0] || null;

    if (!replacementFileRecord) {
      throw new ApiError(400, "Replacement model file duplicates an existing active file");
    }

    await markLocalDesignFileRemoved(
      {
        localDesignId,
        fileId: replacedFile.id,
        removedBy: actorId,
        status: "replaced",
        replacedById: replacementFileRecord.id,
        removalReason: "Replaced during design update",
      },
      connection,
    );
    await markFileReferencesInactive(
      {
        referenceType: "local_design_file",
        referenceId: replacedFile.id,
        status: "replaced",
        reason: "Model file was replaced during design update.",
      },
      connection,
    );
    auditEvents.push({
      eventType: "asset_replaced",
      summary: "A model file was replaced.",
      metadata: {
        oldFileId: replacedFile.id,
        newFileId: replacementFileRecord.id,
        fileName: replacedFile.originalFileName || replacedFile.fileUrl,
      },
    });
  }

  if (replacementImageUpload) {
    const result = await persistUploadedLocalDesignAssets({
      localDesignId,
      designFiles: [],
      thumbnailImages: [replacementImageUpload],
      connection,
      primaryImageIndex: -1,
      imageSortOffset: replacedImage.sortOrder,
      actorId,
    });
    duplicateThumbnailPaths.push(...result.duplicateThumbnailPaths);
    replacementImageRecord = result.images[0] || null;

    if (!replacementImageRecord) {
      throw new ApiError(400, "Replacement preview image duplicates an existing active image");
    }

    await markLocalDesignImageRemoved(
      {
        localDesignId,
        imageId: replacedImage.id,
        removedBy: actorId,
        status: "replaced",
        replacedById: replacementImageRecord.id,
        removalReason: "Replaced during design update",
      },
      connection,
    );
    await markFileReferencesInactive(
      {
        referenceType: "local_design_image",
        referenceId: replacedImage.id,
        status: "replaced",
        reason: "Preview image was replaced during design update.",
      },
      connection,
    );
    auditEvents.push({
      eventType: "asset_replaced",
      summary: "A preview image was replaced.",
      metadata: {
        oldImageId: replacedImage.id,
        newImageId: replacementImageRecord.id,
        fileName: replacedImage.originalFileName || replacedImage.imageUrl,
      },
    });
  }

  for (const fileId of intent.removeFileIds) {
    if (Number(fileId) === Number(intent.replaceFileId)) continue;
    const removed = await markLocalDesignFileRemoved(
      {
        localDesignId,
        fileId,
        removedBy: actorId,
        status: "removed",
        removalReason: "Removed during design update",
      },
      connection,
    );
    if (removed) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_file",
          referenceId: removed.id,
          status: "removed",
          reason: "Model file was removed during design update.",
        },
        connection,
      );
      auditEvents.push({
        eventType: "asset_removed",
        summary: "A model file was removed from the active design.",
        metadata: {
          fileId: removed.id,
          fileName: removed.originalFileName || removed.fileUrl,
        },
      });
    }
  }

  for (const imageId of intent.removeImageIds) {
    if (Number(imageId) === Number(intent.replaceImageId)) continue;
    const removed = await markLocalDesignImageRemoved(
      {
        localDesignId,
        imageId,
        removedBy: actorId,
        status: "removed",
        removalReason: "Removed during design update",
      },
      connection,
    );
    if (removed) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_image",
          referenceId: removed.id,
          status: "removed",
          reason: "Preview image was removed during design update.",
        },
        connection,
      );
      auditEvents.push({
        eventType: "asset_removed",
        summary: "A preview image was removed from the active design.",
        metadata: {
          imageId: removed.id,
          fileName: removed.originalFileName || removed.imageUrl,
        },
      });
    }
  }

  const appendResult = await persistUploadedLocalDesignAssets({
    localDesignId,
    designFiles: filesForCreate,
    thumbnailImages: imagesForCreate,
    connection,
    primaryFileIndex: -1,
    primaryImageIndex: -1,
    fileSortOffset: initialActiveFiles.length,
    imageSortOffset: initialActiveImages.length,
    actorId,
    generatedSnapshotPaths,
  });
  duplicateDesignPaths.push(...appendResult.duplicateDesignPaths);
  duplicateThumbnailPaths.push(...appendResult.duplicateThumbnailPaths);

  for (const file of appendResult.files) {
    auditEvents.push({
      eventType: "asset_added",
      summary: "A model file was added to the design.",
      metadata: {
        fileId: file.id,
        fileName: file.originalFileName || file.fileUrl,
      },
    });
  }

  for (const image of appendResult.images) {
    auditEvents.push({
      eventType: "asset_added",
      summary: "A preview image was added to the design.",
      metadata: {
        imageId: image.id,
        fileName: image.originalFileName || image.imageUrl,
      },
    });
  }

  let nextPrimaryFileId =
    intent.primaryFileId === undefined ? initialPrimaryFile?.id || null : intent.primaryFileId;
  let nextPrimaryImageId =
    intent.primaryImageId === undefined ? initialPrimaryImage?.id || null : intent.primaryImageId;

  if (replacementFileRecord && Number(nextPrimaryFileId) === Number(replacedFile.id)) {
    nextPrimaryFileId = replacementFileRecord.id;
  }

  if (replacementImageRecord && Number(nextPrimaryImageId) === Number(replacedImage.id)) {
    nextPrimaryImageId = replacementImageRecord.id;
  }

  const refreshedBeforePrimary = await getLocalDesignByIdForAdmin(
    localDesignId,
    connection,
  );
  const activeFilesAfterMutation = activeDesignFiles(refreshedBeforePrimary);
  const activeImagesAfterMutation = activeDesignImages(refreshedBeforePrimary);

  if (
    activeFilesAfterMutation.length > 0 &&
    (!nextPrimaryFileId ||
      !activeFilesAfterMutation.some(
        (file) => Number(file.id) === Number(nextPrimaryFileId),
      ))
  ) {
    nextPrimaryFileId = activeFilesAfterMutation[0].id;
  }

  if (
    activeImagesAfterMutation.length > 0 &&
    (!nextPrimaryImageId ||
      !activeImagesAfterMutation.some(
        (image) => Number(image.id) === Number(nextPrimaryImageId),
      ))
  ) {
    nextPrimaryImageId = activeImagesAfterMutation[0].id;
  }

  if (
    nextPrimaryFileId &&
    activeFilesAfterMutation.some((file) => Number(file.id) === Number(nextPrimaryFileId))
  ) {
    await setLocalDesignPrimaryFile({ localDesignId, fileId: nextPrimaryFileId }, connection);
    if (Number(initialPrimaryFile?.id || 0) !== Number(nextPrimaryFileId)) {
      auditEvents.push({
        eventType: "asset_primary_updated",
        summary: "Primary model file was updated.",
        metadata: { primaryFileId: nextPrimaryFileId },
      });
    }
  }

  if (
    nextPrimaryImageId &&
    activeImagesAfterMutation.some((image) => Number(image.id) === Number(nextPrimaryImageId))
  ) {
    await setLocalDesignPrimaryImage({ localDesignId, imageId: nextPrimaryImageId }, connection);
    if (Number(initialPrimaryImage?.id || 0) !== Number(nextPrimaryImageId)) {
      auditEvents.push({
        eventType: "asset_primary_updated",
        summary: "Primary preview image was updated.",
        metadata: { primaryImageId: nextPrimaryImageId },
      });
    }
  }

  if (intent.fileOrder.length > 0) {
    await reorderLocalDesignFiles(
      { localDesignId, orderedFileIds: intent.fileOrder },
      connection,
    );
    auditEvents.push({
      eventType: "asset_order_updated",
      summary: "Model file order was updated.",
      metadata: { fileOrder: intent.fileOrder },
    });
  }

  if (intent.imageOrder.length > 0) {
    await reorderLocalDesignImages(
      { localDesignId, orderedImageIds: intent.imageOrder },
      connection,
    );
    auditEvents.push({
      eventType: "asset_order_updated",
      summary: "Preview image order was updated.",
      metadata: { imageOrder: intent.imageOrder },
    });
  }

  const activeFileCount = await countActiveLocalDesignFiles(localDesignId, connection);

  if (!allowZeroActiveModelFiles && activeFileCount === 0) {
    throw new ApiError(400, "At least one active model file is required");
  }

  await syncLocalDesignPrimaryAssetSummary(localDesignId, connection);
  const updatedDesign = await syncLocalDesignPrintReadySummary(
    localDesignId,
    connection,
  );

  for (const event of auditEvents) {
    await createLocalDesignAuditEvent(
      {
        localDesignId,
        actorId,
        actorType,
        eventType: event.eventType,
        fromStatus: existingLocalDesign.moderation_status,
        toStatus: existingLocalDesign.moderation_status,
        summary: event.summary,
        metadata: event.metadata,
      },
      connection,
    );
  }

  return {
    updatedDesign,
    auditEvents,
    duplicateDesignPaths,
    duplicateThumbnailPaths,
    changed:
      auditEvents.length > 0 ||
      duplicateDesignPaths.length > 0 ||
      duplicateThumbnailPaths.length > 0 ||
      intent.primaryFileId !== undefined ||
      intent.primaryImageId !== undefined,
  };
}

const searchDesignLibrary = asyncHandler(async (req, res) => {
  const activeTab = hasText(req.query.tab)
    ? String(req.query.tab).trim()
    : "local";

  const isLocalTab = activeTab === "local";
  const isMmfTab = activeTab === "mmf";
  const searchQuery = hasText(req.query.q) ? String(req.query.q).trim() : null;
  const shouldIncludeSections = isLocalTab && !hasDesignLibraryFilters(req);

  let localResult = {
    items: [],
    page: Number(req.query.localPage || 1),
    limit: Number(req.query.localLimit || 12),
    totalCount: 0,
    totalPages: 1,
  };

  if (isLocalTab) {
    localResult = await searchActiveLocalDesigns({
      searchQuery,
      category: hasText(req.query.category)
        ? String(req.query.category).trim()
        : null,
      tag: hasText(req.query.tag) ? String(req.query.tag).trim() : null,
      sourceKind: hasText(req.query.sourceKind)
        ? String(req.query.sourceKind).trim()
        : null,
      printReady: parsePrintReadyFilter(req.query.printReady),
      sort: hasText(req.query.localSort)
        ? String(req.query.localSort).trim()
        : "newest",
      page: Number(req.query.localPage || 1),
      limit: Number(req.query.localLimit || 12),
    });
  }

  const localAvailability =
    isLocalTab
      ? localResult.totalCount > 0
      : (
          await searchActiveLocalDesigns({
            searchQuery,
            sort: "newest",
            page: 1,
            limit: 1,
          })
        ).totalCount > 0;

  const mmfPage = Number(req.query.mmfPage || req.query.page || 1);
  const mmfPerPage = Number(req.query.mmfPerPage || req.query.per_page || 12);
  const mmfSort = hasText(req.query.mmfSort)
    ? String(req.query.mmfSort).trim()
    : hasText(req.query.sort)
      ? String(req.query.sort).trim()
      : "relevance";
  const mmfOrder = hasText(req.query.mmfOrder)
    ? String(req.query.mmfOrder).trim()
    : hasText(req.query.order)
      ? String(req.query.order).trim()
      : "desc";

  let mmfResults = null;
  const curatedMmfOverrides = !searchQuery
    ? await getCuratedMmfOverrides()
    : null;
  const curatedMmfOverrideCount = curatedMmfOverrides?.length || 0;
  let mmfStatus = {
    available: true,
    message: null,
  };

  if (isMmfTab && searchQuery) {
    try {
      mmfResults = await searchObjects({
        q: searchQuery,
        page: mmfPage,
        per_page: mmfPerPage,
        sort: mmfSort === "relevance" ? undefined : mmfSort,
        order: mmfSort === "relevance" ? undefined : mmfOrder,
      });
    } catch (error) {
      mmfStatus = {
        available: false,
        message: error.message || "MyMiniFactory is currently unavailable",
      };
    }
  }

  let mmfSearchAvailability = null;

  if (searchQuery && !isMmfTab) {
    try {
      const availabilityResult = await searchObjects({
        q: searchQuery,
        page: 1,
        per_page: 1,
      });

      mmfSearchAvailability =
        Number(availabilityResult?.totalCount || 0) > 0 ||
        (Array.isArray(availabilityResult?.items) &&
          availabilityResult.items.length > 0);
    } catch {
      mmfSearchAvailability = false;
    }
  }

  let curatedMmfResults = {
    items: [],
    page: Math.max(mmfPage, 1),
    limit: Math.max(mmfPerPage, 1),
    totalCount: 0,
    totalPages: 1,
    visibleCount: 0,
  };

  if (mmfResults) {
    const mmfObjectIds = Array.isArray(mmfResults.items)
      ? mmfResults.items.map((item) => item.id)
      : [];

    const overrides = await getDesignOverridesByMmfObjectIds(mmfObjectIds);
    const overrideMap = buildOverrideMap(overrides);

    const visibleItems = mmfResults.items
      .map((item) => {
        const override = overrideMap.get(Number(item.id)) || null;
        return applyOverrideToMmfItem(item, override);
      })
      .filter((item) => !item.override?.isHidden);

    const rankedVisibleItems = rankMmfSearchResults(
      visibleItems,
      searchQuery,
      mmfSort,
    );

    const mmfTotalCount = Number(
      mmfResults.totalCount || rankedVisibleItems.length || 0,
    );

    curatedMmfResults = {
      items: rankedVisibleItems,
      page: Math.max(mmfPage, 1),
      limit: Math.max(mmfPerPage, 1),
      totalCount: mmfTotalCount,
      totalPages: Math.max(
        Math.ceil(mmfTotalCount / Math.max(mmfPerPage, 1)),
        1,
      ),
      visibleCount: visibleItems.length,
    };
  }

  if (isMmfTab && !searchQuery) {
    const curatedItems = await buildCuratedMmfSection(
      Math.max(mmfPerPage, 1),
      curatedMmfOverrides,
    );

    curatedMmfResults = {
      items: curatedItems,
      page: 1,
      limit: Math.max(mmfPerPage, 1),
      totalCount: curatedMmfOverrideCount,
      totalPages: Math.max(
        Math.ceil(curatedMmfOverrideCount / Math.max(mmfPerPage, 1)),
        1,
      ),
      visibleCount: curatedItems.length,
      isCurated: true,
    };
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activeTab,
        tabAvailability: {
          local: localAvailability,
          mmf: searchQuery
            ? isMmfTab
              ? curatedMmfResults.totalCount > 0
              : Boolean(mmfSearchAvailability)
            : curatedMmfOverrideCount > 0,
        },
        sections: shouldIncludeSections
          ? await buildDesignLibrarySections()
          : null,
        mmfResults: curatedMmfResults,
        localDesigns: {
          items: localResult.items.map(normalizeLocalDesign),
          page: localResult.page,
          limit: localResult.limit,
          totalCount: localResult.totalCount,
          totalPages: localResult.totalPages,
        },
        mmfStatus,
      },
      "Design library results fetched successfully",
    ),
  );
});

const getMmfDesignDetail = asyncHandler(async (req, res) => {
  const mmfObject = await getObjectById(req.params.objectId);
  let override = await ensureMmfPrintReadySnapshot(
    await getDesignOverrideByMmfObjectId(req.params.objectId),
  );
  const printReadyFiles = await Promise.all(
    (await listMmfPrintReadyFilesByObjectId(req.params.objectId)).map(
      ensureMmfPrintReadyFileSnapshot,
    ),
  );

  if (override) {
    const primaryPrintReadyFile =
      printReadyFiles.find((file) => file.is_primary) ||
      printReadyFiles[0] ||
      null;
    override = {
      ...override,
      print_ready_files: printReadyFiles,
      print_ready_file_id: primaryPrintReadyFile?.id || override.print_ready_file_id,
      print_ready_file_cached_file_url:
        primaryPrintReadyFile?.cached_file_url ||
        override.print_ready_file_cached_file_url,
      print_ready_file_model_snapshot_url:
        primaryPrintReadyFile?.model_snapshot_url ||
        override.print_ready_file_model_snapshot_url,
      print_ready_file_original_file_name:
        primaryPrintReadyFile?.original_file_name ||
        override.print_ready_file_original_file_name,
      print_ready_file_extension:
        primaryPrintReadyFile?.extension || override.print_ready_file_extension,
      print_ready_file_size:
        primaryPrintReadyFile?.file_size || override.print_ready_file_size,
      print_ready_file_status:
        primaryPrintReadyFile?.status || override.print_ready_file_status,
      print_ready_file_verified_at:
        primaryPrintReadyFile?.verified_at || override.print_ready_file_verified_at,
    };
  }

  const curatedMmfObject = applyOverrideToMmfItem(mmfObject, override);

  if (curatedMmfObject.override?.isHidden) {
    throw new ApiError(404, "Design not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { mmfObject: curatedMmfObject },
        "Design detail fetched successfully",
      ),
    );
});

const moderateLocalDesign = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const action = String(req.body.action || "").trim();

  if (!ADMIN_DESIGN_ACTIONS.has(action)) {
    throw new ApiError(
      400,
      "Action must be one of: approve, reject, hide, restore, send_to_review",
    );
  }

  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (existingLocalDesign.source_kind !== "community") {
    throw new ApiError(400, "Only community designs use moderation actions");
  }

  if (
    ["approve", "restore"].includes(action) &&
    (await countActiveLocalDesignFiles(designId)) === 0
  ) {
    throw new ApiError(400, "At least one active model file is required before approval");
  }

  if (
    ["approve", "restore"].includes(action) &&
    !existingLocalDesign.latest_moderation_run_id &&
    !normalizeOptionalText(req.body.feedback)
  ) {
    throw new ApiError(
      400,
      "Approval without an AI moderation run requires an admin override reason.",
    );
  }

  if (
    ["approve", "restore"].includes(action) &&
    existingLocalDesign.moderation_status === "screening" &&
    !normalizeOptionalText(req.body.feedback)
  ) {
    throw new ApiError(
      400,
      "Approval while AI screening is still pending requires an admin override reason.",
    );
  }

  const previousStatus = existingLocalDesign.moderation_status;
  const decision = resolveAdminDesignAction({
    action,
    existingDesign: existingLocalDesign,
    feedback: req.body.feedback,
  });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedDesign = await updateLocalDesignModerationState(
      designId,
      {
        moderationStatus: decision.moderationStatus,
        isActive: decision.isActive,
        isPrintReady: decision.isPrintReady,
        moderationFlags: existingLocalDesign.moderation_flags,
        moderationSummary: decision.moderationSummary,
        moderationFeedback: decision.moderationFeedback,
        moderationDecisionSource: decision.moderationDecisionSource,
        reviewedBy: req.user.id,
        reviewedAt: decision.reviewedAt,
        printReadyAt: decision.isPrintReady
          ? existingLocalDesign.print_ready_at
          : null,
        printReadyBy: decision.isPrintReady
          ? existingLocalDesign.print_ready_by
          : null,
      },
      connection,
    );

    await createLocalDesignAuditEvent(
      {
        localDesignId: designId,
        actorId: req.user.id,
        actorType: "admin",
        eventType: decision.eventType,
        fromStatus: previousStatus,
        toStatus: decision.moderationStatus,
        summary: decision.moderationSummary,
        metadata: {
          feedback: decision.moderationFeedback,
        },
      },
      connection,
    );

    await connection.commit();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(updatedDesign) },
          "Design moderation action applied successfully",
        ),
      );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const recheckLocalDesignModeration = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (existingLocalDesign.archived_at) {
    throw new ApiError(400, "Archived designs cannot be rechecked");
  }

  if (existingLocalDesign.source_kind !== "community") {
    throw new ApiError(400, "Only community designs use moderation rechecks");
  }

  if ((await countActiveLocalDesignFiles(designId)) === 0) {
    throw new ApiError(400, "Design file is required before rechecking");
  }

  const connection = await pool.getConnection();
  let moderationRun = null;

  try {
    await connection.beginTransaction();

    const { updatedDesign, moderationRun: queuedRun } =
      await queueDesignForAiScreening({
        localDesign: existingLocalDesign,
        actorId: req.user.id,
        actorType: "admin",
        eventType: "admin_reran_moderation",
        triggerKind: "admin_recheck",
        connection,
      });
    moderationRun = queuedRun;

    await connection.commit();
    enqueueDesignModerationRun(moderationRun.id);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(updatedDesign) },
          "Design AI moderation recheck was queued successfully",
        ),
      );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const listLocalDesigns = asyncHandler(async (req, res) => {
  const localDesigns = (await getActiveLocalDesigns()).map(
    normalizeLocalDesign,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { localDesigns },
        "Local designs fetched successfully",
      ),
    );
});

const getDesignTaxonomy = asyncHandler(async (req, res) => {
  const [categories, tags] = await Promise.all([
    listDesignCategories({ activeOnly: true }),
    listDesignTags({ activeOnly: true }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        categories: categories.map(normalizeCategory),
        tags: tags.map(normalizeTag),
      },
      "Design taxonomy fetched successfully",
    ),
  );
});

const getDesignTaxonomyForAdmin = asyncHandler(async (req, res) => {
  const [categories, tags] = await Promise.all([
    listDesignCategories({ activeOnly: false }),
    listDesignTags({ activeOnly: false }),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        categories: categories.map(normalizeCategory),
        tags: tags.map(normalizeTag),
      },
      "Admin design taxonomy fetched successfully",
    ),
  );
});

const createDesignCategoryForAdmin = asyncHandler(async (req, res) => {
  let category = await upsertDesignCategoryByName({
    name: req.body.name,
    description: normalizeOptionalText(req.body.description),
    userId: req.user.id,
  });

  if (!category) {
    throw new ApiError(400, "Category name is required");
  }

  const isActive = parseOptionalBoolean(req.body.isActive, "isActive") ?? true;

  if (!isActive) {
    category = await updateDesignCategoryById({
      categoryId: category.id,
      name: req.body.name,
      description: normalizeOptionalText(req.body.description),
      isActive,
      userId: req.user.id,
    });
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      { category: normalizeCategory(category) },
      "Design category saved successfully",
    ),
  );
});

const updateDesignCategoryForAdmin = asyncHandler(async (req, res) => {
  const category = await updateDesignCategoryById({
    categoryId: Number(req.params.categoryId),
    name: req.body.name,
    description: normalizeOptionalText(req.body.description),
    isActive:
      parseOptionalBoolean(req.body.isActive, "isActive") ?? true,
    userId: req.user.id,
  });

  if (!category) {
    throw new ApiError(404, "Design category not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { category: normalizeCategory(category) },
      "Design category updated successfully",
    ),
  );
});

const createDesignTagForAdmin = asyncHandler(async (req, res) => {
  let tag = await upsertDesignTagByName({
    name: req.body.name,
    userId: req.user.id,
  });

  if (!tag) {
    throw new ApiError(400, "Tag name is required");
  }

  const isActive = parseOptionalBoolean(req.body.isActive, "isActive") ?? true;

  if (!isActive) {
    tag = await updateDesignTagById({
      tagId: tag.id,
      name: req.body.name,
      isActive,
      userId: req.user.id,
    });
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      { tag: normalizeTag(tag) },
      "Design tag saved successfully",
    ),
  );
});

const updateDesignTagForAdmin = asyncHandler(async (req, res) => {
  const tag = await updateDesignTagById({
    tagId: Number(req.params.tagId),
    name: req.body.name,
    isActive:
      parseOptionalBoolean(req.body.isActive, "isActive") ?? true,
    userId: req.user.id,
  });

  if (!tag) {
    throw new ApiError(404, "Design tag not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { tag: normalizeTag(tag) },
      "Design tag updated successfully",
    ),
  );
});

const listLocalDesignsForAdmin = asyncHandler(async (req, res) => {
  const archived = ["true", "1", "yes"].includes(
    String(req.query.archived ?? "")
      .trim()
      .toLowerCase(),
  );
  const sourceKind = hasText(req.query.sourceKind)
    ? String(req.query.sourceKind).trim()
    : null;
  const statuses = hasText(req.query.status)
    ? String(req.query.status)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const printReady = hasText(req.query.printReady)
    ? ["true", "1", "yes"].includes(
        String(req.query.printReady).trim().toLowerCase(),
      )
    : null;

  if (sourceKind && !["lab", "community"].includes(sourceKind)) {
    throw new ApiError(400, "sourceKind must be either lab or community");
  }

  const invalidStatus = statuses.find(
    (status) => !DESIGN_MODERATION_STATUSES.has(status),
  );

  if (invalidStatus) {
    throw new ApiError(400, `Invalid design status filter: ${invalidStatus}`);
  }

  const result = await getAllLocalDesignsForAdmin({
    archived,
    sourceKind,
    statuses,
    search: hasText(req.query.search) ? String(req.query.search).trim() : null,
    printReady,
    page: req.query.page,
    limit: req.query.limit,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          localDesigns: result.rows.map(normalizeLocalDesign),
          counts: {
            byStatus: Object.fromEntries(
              (result.statusCounts || []).map((item) => [
                item.status,
                Number(item.count || 0),
              ]),
            ),
          },
          pagination: {
            page: result.page,
            limit: result.limit,
            totalCount: result.totalCount,
            totalPages: Math.max(Math.ceil(result.totalCount / result.limit), 1),
          },
          filters: {
            archived: req.query.archived || "",
            sourceKind: sourceKind || "",
            status: req.query.status || "",
            search: req.query.search || "",
            printReady: req.query.printReady || "",
          },
        },
        "Admin local designs fetched successfully",
      ),
    );
});

const updateLocalDesignLibraryCurationSettings = asyncHandler(
  async (req, res) => {
    const designId = req.params.designId;
    const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

    if (!existingLocalDesign) {
      throw new ApiError(404, "Local design not found");
    }

    if (existingLocalDesign.archived_at) {
      throw new ApiError(400, "Archived designs cannot be curated");
    }

    const isFeatured =
      parseOptionalBoolean(req.body.isFeatured, "isFeatured") ??
      Boolean(existingLocalDesign.is_featured);
    const isLibraryHidden =
      parseOptionalBoolean(req.body.isLibraryHidden, "isLibraryHidden") ??
      Boolean(existingLocalDesign.is_library_hidden);
    const featuredRank =
      req.body.featuredRank === undefined || req.body.featuredRank === null
        ? Number(existingLocalDesign.featured_rank || 0)
        : Number(req.body.featuredRank);
    const libraryNote = hasText(req.body.libraryNote)
      ? String(req.body.libraryNote).trim()
      : null;

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const updatedDesign = await updateLocalDesignLibraryCuration(
        designId,
        {
          isFeatured,
          featuredRank,
          libraryNote,
          isLibraryHidden,
          actorId: req.user.id,
        },
        connection,
      );

      await createLocalDesignAuditEvent(
        {
          localDesignId: designId,
          actorId: req.user.id,
          actorType: "admin",
          eventType: "library_curation_updated",
          fromStatus: existingLocalDesign.moderation_status,
          toStatus: existingLocalDesign.moderation_status,
          summary: "Library curation settings updated.",
          metadata: {
            isFeatured,
            featuredRank,
            isLibraryHidden,
            libraryNote,
          },
        },
        connection,
      );

      await connection.commit();

      return res.status(200).json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(updatedDesign) },
          "Library curation settings updated successfully",
        ),
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
);

const listSavedDesigns = asyncHandler(async (req, res) => {
  const savedDesigns = (await getSavedDesignsByUser(req.user.id)).map(
    normalizeLocalDesign,
  );
  const savedDesignIds = await getSavedDesignIdsByUser(req.user.id);

  return res.status(200).json(
    new ApiResponse(
      200,
      { savedDesigns, savedDesignIds },
      "Saved designs fetched successfully",
    ),
  );
});

const saveLocalDesign = asyncHandler(async (req, res) => {
  const localDesign = await getLocalDesignById(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Design not found or unavailable");
  }

  await saveDesignForUser({
    userId: req.user.id,
    localDesignId: req.params.designId,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { localDesign: normalizeLocalDesign(localDesign), isSaved: true },
      "Design saved successfully",
    ),
  );
});

const unsaveLocalDesign = asyncHandler(async (req, res) => {
  await unsaveDesignForUser({
    userId: req.user.id,
    localDesignId: req.params.designId,
  });

  return res.status(200).json(
    new ApiResponse(200, { designId: Number(req.params.designId), isSaved: false }, "Design removed from saved designs"),
  );
});

const listMyDesigns = asyncHandler(async (req, res) => {
  const status = hasText(req.query.status)
    ? String(req.query.status).trim()
    : null;

  if (status && !DESIGN_MODERATION_STATUSES.has(status)) {
    throw new ApiError(400, "Invalid design status filter");
  }

  const localDesigns = (
    await getLocalDesignsByOwner(req.user.id, { status })
  ).map(normalizeLocalDesign);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { localDesigns }, "My designs fetched successfully"),
    );
});

const getLocalDesignDetail = asyncHandler(async (req, res) => {
  let localDesign = await getLocalDesignById(req.params.designId);
  let isOwner = false;
  const isAdminViewer = Boolean(req.user?.isEmailVerified && req.user?.isAdmin);

  if (!localDesign && req.user?.isEmailVerified) {
    const privateDesign = await getLocalDesignByIdForAdmin(req.params.designId);
    isOwner =
      privateDesign?.source_kind === "community" &&
      Number(privateDesign.uploaded_by) === Number(req.user.id);

    if (isOwner || isAdminViewer) {
      localDesign = privateDesign;
    }
  }

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  isOwner =
    isOwner ||
    (req.user?.isEmailVerified &&
      localDesign.source_kind === "community" &&
      Number(localDesign.uploaded_by) === Number(req.user.id));

  localDesign = await ensureLocalDesignSnapshot(localDesign);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          localDesign: normalizeLocalDesign(localDesign),
          viewerPermissions: {
            canEdit: Boolean(isOwner),
            isOwner: Boolean(isOwner),
            canAdminView: Boolean(isAdminViewer),
          },
        },
        "Local design fetched successfully",
      ),
    );
});

const getLocalDesignDetailForAdmin = asyncHandler(async (req, res) => {
  const localDesign = await getLocalDesignByIdForAdmin(req.params.designId);
  const auditEvents = await getLocalDesignAuditEvents(req.params.designId);
  const moderationRuns = await listLocalDesignModerationRuns({
    localDesignId: req.params.designId,
    limit: 5,
  });
  const latestModerationRun = moderationRuns[0] || null;
  const latestModerationRunItems = latestModerationRun
    ? await listLocalDesignModerationRunItems(latestModerationRun.id)
    : [];

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        localDesign: normalizeLocalDesign(localDesign),
        auditEvents: auditEvents.map(normalizeLocalDesignAuditEvent),
        moderationRuns: moderationRuns.map((run) =>
          normalizeModerationRunForResponse(
            run,
            latestModerationRun?.id === run.id ? latestModerationRunItems : [],
          ),
        ),
      },
      "Admin local design fetched successfully",
    ),
  );
});

const createLocalDesign = asyncHandler(async (req, res) => {
  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );
  const uploadedDesignFile = uploadedDesignFiles[0] || null;
  const uploadedThumbnailImage = uploadedThumbnailImages[0] || null;

  if (!uploadedDesignFile) {
    throw new ApiError(400, "Design file is required");
  }

  const fileUrl = buildStoredLocalDesignPath(uploadedDesignFile, "design");
  const thumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : null;
  const generatedSnapshotPaths = [];

  try {
    const connection = await pool.getConnection();
    let duplicateDesignPaths = [];
    let duplicateThumbnailPaths = [];

    try {
      await connection.beginTransaction();

      const taxonomy = await resolveLocalDesignTaxonomy({
        body: req.body,
        userId: req.user.id,
        connection,
      });

      const localDesign = await createLocalDesignRecord(
        {
          title: String(req.body.title).trim(),
          description: normalizeOptionalText(req.body.description),
          thumbnailUrl,
          fileUrl,
          material: normalizeOptionalText(req.body.material),
          dimensions: normalizeOptionalText(req.body.dimensions),
          licenseType: normalizeOptionalText(req.body.licenseType),
          categoryId: taxonomy.categoryId,
          uploadedBy: req.user.id,
        },
        connection,
      );

      await replaceLocalDesignTags({
        localDesignId: localDesign.id,
        tagIds: taxonomy.tagIds,
        connection,
      });

      const assetResult = await persistUploadedLocalDesignAssets({
        localDesignId: localDesign.id,
        designFiles: uploadedDesignFiles,
        thumbnailImages: uploadedThumbnailImages,
        connection,
        isPrintReady: true,
        actorId: req.user.id,
        generatedSnapshotPaths,
      });
      duplicateDesignPaths = assetResult.duplicateDesignPaths;
      duplicateThumbnailPaths = assetResult.duplicateThumbnailPaths;
      await syncLocalDesignPrimaryAssetSummary(localDesign.id, connection);
      await syncLocalDesignPrintReadySummary(localDesign.id, connection);

      await connection.commit();
      await cleanupManagedLocalDesignPublicPaths(duplicateDesignPaths, "design");
      await cleanupManagedLocalDesignPublicPaths(
        duplicateThumbnailPaths,
        "thumbnail",
      );

      const savedLocalDesign = await getLocalDesignByIdForAdmin(localDesign.id);

      return res
        .status(201)
        .json(
          new ApiResponse(
            201,
            { localDesign: normalizeLocalDesign(savedLocalDesign) },
            "Local design created successfully",
          ),
        );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    await cleanupNewUploadedLocalDesignAssets(req);
    await cleanupManagedLocalDesignPublicPaths(
      generatedSnapshotPaths,
      "thumbnail",
    );

    throw error;
  }
});

const createMyDesignDraft = asyncHandler(async (req, res) => {
  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );
  const uploadedDesignFile = uploadedDesignFiles[0] || null;
  const uploadedThumbnailImage = uploadedThumbnailImages[0] || null;

  const fileUrl = uploadedDesignFile
    ? buildStoredLocalDesignPath(uploadedDesignFile, "design")
    : null;

  const thumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : null;
  const generatedSnapshotPaths = [];

  try {
    const connection = await pool.getConnection();
    let duplicateDesignPaths = [];
    let duplicateThumbnailPaths = [];

    try {
      await connection.beginTransaction();

      const taxonomy = await resolveLocalDesignTaxonomy({
        body: req.body,
        userId: req.user.id,
        connection,
      });

      const localDesign = await createLocalDesignRecord(
        {
          sourceKind: "community",
          title: hasText(req.body.title)
            ? String(req.body.title).trim()
            : "Untitled draft",
          description: normalizeOptionalText(req.body.description),
          thumbnailUrl,
          fileUrl,
          material: normalizeOptionalText(req.body.material),
          dimensions: normalizeOptionalText(req.body.dimensions),
          licenseType: normalizeOptionalText(req.body.licenseType),
          categoryId: taxonomy.categoryId,
          uploadedBy: req.user.id,
          isActive: false,
          moderationStatus: "draft",
          isPrintReady: false,
          ownershipConfirmed:
            parseOptionalBoolean(
              req.body.ownershipConfirmed,
              "ownershipConfirmed",
            ) ?? false,
          policyAcknowledged:
            parseOptionalBoolean(
              req.body.policyAcknowledged,
              "policyAcknowledged",
            ) ?? false,
        },
        connection,
      );

      await replaceLocalDesignTags({
        localDesignId: localDesign.id,
        tagIds: taxonomy.tagIds,
        connection,
      });

      const assetResult = await persistUploadedLocalDesignAssets({
        localDesignId: localDesign.id,
        designFiles: uploadedDesignFiles,
        thumbnailImages: uploadedThumbnailImages,
        connection,
        actorId: req.user.id,
        generatedSnapshotPaths,
      });
      duplicateDesignPaths = assetResult.duplicateDesignPaths;
      duplicateThumbnailPaths = assetResult.duplicateThumbnailPaths;
      await syncLocalDesignPrimaryAssetSummary(localDesign.id, connection);

      await createLocalDesignAuditEvent(
        {
          localDesignId: localDesign.id,
          actorId: req.user.id,
          actorType: "user",
          eventType: "draft_created",
          toStatus: "draft",
          summary: "User saved a design draft.",
        },
        connection,
      );

      await connection.commit();

      const savedLocalDesign = await getLocalDesignByIdForAdmin(localDesign.id);

      return res
        .status(201)
        .json(
          new ApiResponse(
            201,
            { localDesign: normalizeLocalDesign(savedLocalDesign) },
            "Design draft saved successfully",
          ),
        );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    await cleanupNewUploadedLocalDesignAssets(req);
    await cleanupManagedLocalDesignPublicPaths(
      generatedSnapshotPaths,
      "thumbnail",
    );

    throw error;
  }
});

const publishMyDesign = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    throw new ApiError(404, "Design not found");
  }

  if (Number(existingLocalDesign.uploaded_by) !== Number(req.user.id)) {
    throw new ApiError(403, "You can only publish your own designs");
  }

  if (existingLocalDesign.source_kind !== "community") {
    throw new ApiError(400, "Only community designs can be published");
  }

  if (
    !["draft", "auto_rejected", "admin_rejected"].includes(
      existingLocalDesign.moderation_status,
    )
  ) {
    throw new ApiError(400, "Only draft or rejected designs can be published");
  }

  if (
    !hasText(existingLocalDesign.title) ||
    existingLocalDesign.title === "Untitled draft"
  ) {
    throw new ApiError(400, "Title is required before publishing");
  }

  if (!hasText(existingLocalDesign.description)) {
    throw new ApiError(400, "Description is required before publishing");
  }

  if ((await countActiveLocalDesignFiles(designId)) === 0) {
    throw new ApiError(400, "Design file is required before publishing");
  }

  if (!existingLocalDesign.ownership_confirmed) {
    throw new ApiError(
      400,
      "Ownership confirmation is required before publishing",
    );
  }

  if (!existingLocalDesign.policy_acknowledged) {
    throw new ApiError(
      400,
      "FabLab policy acknowledgement is required before publishing",
    );
  }

  const connection = await pool.getConnection();
  let moderationRun = null;

  try {
    await connection.beginTransaction();

    const { updatedDesign, moderationRun: queuedRun } =
      await queueDesignForAiScreening({
        localDesign: existingLocalDesign,
        actorId: req.user.id,
        actorType: "user",
        eventType: "published_for_screening",
        triggerKind: "publish",
        publishedAt: new Date(),
        connection,
      });
    moderationRun = queuedRun;

    await connection.commit();
    enqueueDesignModerationRun(moderationRun.id);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(updatedDesign) },
          "Design published and queued for AI screening successfully",
        ),
      );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const updateLocalDesign = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(404, "Local design not found");
  }

  if (existingLocalDesign.archived_at) {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(400, "Archived local designs cannot be updated");
  }

  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );
  const nextFileUrl = existingLocalDesign.file_url;
  const nextThumbnailUrl = existingLocalDesign.thumbnail_url;

  const isActive =
    parseOptionalBoolean(req.body.isActive, "isActive") ??
    Boolean(existingLocalDesign.is_active);
  const generatedSnapshotPaths = [];

  try {
    const connection = await pool.getConnection();
    let localDesign;
    let duplicateDesignPaths = [];
    let duplicateThumbnailPaths = [];

    try {
      await connection.beginTransaction();

      const taxonomy = await resolveLocalDesignTaxonomy({
        body: req.body,
        userId: req.user.id,
        connection,
        existingLocalDesign,
      });

      localDesign = await updateLocalDesignById(
        designId,
        {
          title: hasText(req.body.title)
            ? String(req.body.title).trim()
            : existingLocalDesign.title,
          description: hasText(req.body.description)
            ? String(req.body.description).trim()
            : existingLocalDesign.description,
          thumbnailUrl: nextThumbnailUrl,
          fileUrl: nextFileUrl,
          material: hasText(req.body.material)
            ? String(req.body.material).trim()
            : existingLocalDesign.material,
          dimensions: hasText(req.body.dimensions)
            ? String(req.body.dimensions).trim()
            : existingLocalDesign.dimensions,
          licenseType: hasText(req.body.licenseType)
            ? String(req.body.licenseType).trim()
            : existingLocalDesign.license_type,
          categoryId: taxonomy.categoryId,
          isActive,
        },
        connection,
      );

      if (taxonomy.hasTagUpdate) {
        await replaceLocalDesignTags({
          localDesignId: Number(designId),
          tagIds: taxonomy.tagIds,
          connection,
        });
      }

      const assetResult = await applyLocalDesignAssetIntent({
        localDesignId: Number(designId),
        existingLocalDesign,
        body: req.body,
        uploadedDesignFiles,
        uploadedThumbnailImages,
        actorId: req.user.id,
        actorType: "admin",
        connection,
        allowZeroActiveModelFiles: !isActive,
        generatedSnapshotPaths,
      });
      duplicateDesignPaths = assetResult.duplicateDesignPaths;
      duplicateThumbnailPaths = assetResult.duplicateThumbnailPaths;

      await connection.commit();
      await cleanupManagedLocalDesignPublicPaths(duplicateDesignPaths, "design");
      await cleanupManagedLocalDesignPublicPaths(
        duplicateThumbnailPaths,
        "thumbnail",
      );
      await cleanupManagedLocalDesignPublicPaths(duplicateDesignPaths, "design");
      await cleanupManagedLocalDesignPublicPaths(
        duplicateThumbnailPaths,
        "thumbnail",
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    if (!localDesign) {
      throw new ApiError(404, "Local design not found");
    }

    const refreshedLocalDesign = await getLocalDesignByIdForAdmin(designId);

    // Existing physical assets are retained because older files/images may now
    // be referenced by child records even when the legacy primary URL changes.

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(refreshedLocalDesign) },
          "Local design updated successfully",
        ),
      );
  } catch (error) {
    await cleanupNewUploadedLocalDesignAssets(req);
    await cleanupManagedLocalDesignPublicPaths(
      generatedSnapshotPaths,
      "thumbnail",
    );

    throw error;
  }
});

const deactivateLocalDesign = asyncHandler(async (req, res) => {
  const localDesign = await deactivateLocalDesignById(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { localDesign: normalizeLocalDesign(localDesign) },
        "Local design deactivated successfully",
      ),
    );
});

const archiveLocalDesign = asyncHandler(async (req, res) => {
  const existingLocalDesign = await getLocalDesignByIdForAdmin(
    req.params.designId,
  );

  if (!existingLocalDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (existingLocalDesign.archived_at) {
    throw new ApiError(400, "Local design is already archived");
  }

  if (existingLocalDesign.is_active) {
    throw new ApiError(400, "Only unavailable local designs can be archived");
  }

  const localDesign = await archiveLocalDesignById(
    req.params.designId,
    req.user.id,
  );

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { localDesign: normalizeLocalDesign(localDesign) },
        "Local design archived successfully",
      ),
    );
});

const deleteLocalDesign = asyncHandler(async (req, res) => {
  const existingLocalDesign = await getLocalDesignByIdForAdmin(
    req.params.designId,
  );

  if (!existingLocalDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (!existingLocalDesign.archived_at) {
    throw new ApiError(400, "Only archived local designs can be deleted");
  }

  if (existingLocalDesign.is_active) {
    throw new ApiError(400, "Only unavailable local designs can be deleted");
  }

  const references = await countLocalDesignReferences(req.params.designId);

  if (references.printRequestCount > 0) {
    throw new ApiError(
      409,
      "Local design cannot be deleted while print requests still reference it",
    );
  }

  const connection = await pool.getConnection();
  let deleted = false;

  try {
    await connection.beginTransaction();

    for (const file of existingLocalDesign.files || []) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_file",
          referenceId: file.id,
          status: "deleted",
          reason: "Local design was permanently deleted by admin.",
        },
        connection,
      );
    }

    for (const image of existingLocalDesign.images || []) {
      await markFileReferencesInactive(
        {
          referenceType: "local_design_image",
          referenceId: image.id,
          status: "deleted",
          reason: "Local design was permanently deleted by admin.",
        },
        connection,
      );
    }

    deleted = await deleteLocalDesignById(req.params.designId, connection);

    if (!deleted) {
      throw new ApiError(404, "Local design not found");
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (!deleted) {
    throw new ApiError(404, "Local design not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Local design deleted successfully"));
});

const listDesignOverrides = asyncHandler(async (req, res) => {
  const result = await listDesignOverridesForAdmin({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    filter: req.query.filter,
  });
  const designOverrides = result.rows.map(normalizeDesignOverride);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          designOverrides,
          counts: result.counts,
          pagination: {
            page: result.page,
            limit: result.limit,
            totalCount: result.totalCount,
            totalPages: Math.max(Math.ceil(result.totalCount / result.limit), 1),
          },
          filters: {
            search: req.query.search || "",
            filter: req.query.filter || "",
          },
        },
        "Design overrides fetched successfully",
      ),
    );
});

const getMmfOAuthConnectionStatus = asyncHandler(async (req, res) => {
  const status = await getMmfOAuthStatus();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { status },
        "MyMiniFactory OAuth status fetched successfully",
      ),
    );
});

const startMmfOAuthConnection = asyncHandler(async (req, res) => {
  const authorizationUrl = buildMmfOAuthAuthorizationUrl(req.user.id);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { authorizationUrl },
        "MyMiniFactory OAuth authorization URL generated successfully",
      ),
    );
});

const handleMmfOAuthCallback = asyncHandler(async (req, res) => {
  await exchangeMmfOAuthCode({
    code: req.query.code,
    state: req.query.state,
  });

  const redirectUrl = `${
    process.env.CORS_ORIGIN || "http://localhost:5173"
  }/admin/mmf-overrides?mmfOAuth=connected`;

  return res.redirect(redirectUrl);
});

const disconnectMmfOAuthConnection = asyncHandler(async (req, res) => {
  await disconnectMmfOAuth();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "MyMiniFactory OAuth disconnected successfully",
      ),
    );
});

const inspectMmfDesignFiles = asyncHandler(async (req, res) => {
  const inspection = await inspectMmfObjectFiles(req.params.objectId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { inspection },
        "MyMiniFactory files inspected successfully",
      ),
    );
});

const removeMmfPrintReadyFile = asyncHandler(async (req, res) => {
  const mmfObjectId = Number(req.params.objectId);
  await archiveMmfPrintReadyFilesAndReferences({
    mmfObjectId,
    errorMessage: "Archived by admin cache removal action.",
  });

  const override = await getDesignOverrideByMmfObjectId(mmfObjectId);

  if (override) {
    await updateDesignOverrideById(override.id, {
      isHidden: Boolean(override.is_hidden),
      isPinned: Boolean(override.is_pinned),
      isPrintReady: false,
      linkedLocalDesignId: null,
      mappingStatus: "needs_file",
      mappingError: null,
      mappingMetadata: {
        ...(parseJsonSafely(override.mapping_metadata) || {}),
        cachedFileArchivedAt: new Date().toISOString(),
      },
      printReadyVerifiedAt: null,
      printReadyVerifiedBy: null,
      clientNote: override.client_note,
      updatedBy: req.user.id,
    });
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "MyMiniFactory cached Print Ready file archived successfully",
      ),
    );
});

const createDesignOverride = asyncHandler(async (req, res) => {
  const mmfObjectId = Number(req.body.mmfObjectId);

  const existingOverride = await getDesignOverrideByMmfObjectId(mmfObjectId);

  if (existingOverride) {
    throw new ApiError(
      409,
      `Design override already exists for MMF object ID: ${mmfObjectId}`,
    );
  }

  const isPrintReady =
    parseOptionalBoolean(req.body.isPrintReady, "isPrintReady") ?? false;
  requirePrintReadyVerification({
    isEnabling: isPrintReady,
    confirmation: req.body.verificationConfirmed,
    targetLabel: "MMF Print Ready",
  });

  let mappingResult;

  try {
    mappingResult = await resolveMmfPrintReadyFileMapping({
      mmfObjectId,
      body: req.body,
      isPrintReady,
      adminUserId: req.user.id,
    });
  } catch (error) {
    await createDesignOverrideRecord({
      mmfObjectId,
      isHidden: parseOptionalBoolean(req.body.isHidden, "isHidden") ?? false,
      isPinned: parseOptionalBoolean(req.body.isPinned, "isPinned") ?? false,
      isPrintReady: false,
      linkedLocalDesignId: null,
      mappingStatus: "failed",
      mappingError: error.message,
      mappingMetadata: {
        mmfObjectId,
        attemptedAt: new Date().toISOString(),
        requestedPrintReady: true,
      },
      clientNote: normalizeOptionalText(req.body.clientNote),
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    throw new ApiError(
      400,
      `MMF Print Ready file caching failed: ${error.message}`,
    );
  }

  const verificationMetadata = isPrintReady
    ? buildPrintReadyVerificationMetadata(req.body, req.user.id)
    : null;

  const designOverride = await createDesignOverrideRecord({
    mmfObjectId,
    isHidden: parseOptionalBoolean(req.body.isHidden, "isHidden") ?? false,
    isPinned: parseOptionalBoolean(req.body.isPinned, "isPinned") ?? false,
    isPrintReady,
    linkedLocalDesignId: mappingResult.linkedLocalDesignId,
    mappingStatus: mappingResult.mappingStatus,
    mappingError: mappingResult.mappingError,
    mappingMetadata: {
      ...(mappingResult.mappingMetadata || {}),
      ...(verificationMetadata ? { verification: verificationMetadata } : {}),
    },
    printReadyVerifiedAt: isPrintReady ? new Date() : null,
    printReadyVerifiedBy: isPrintReady ? req.user.id : null,
    clientNote: normalizeOptionalText(req.body.clientNote),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { designOverride: normalizeDesignOverride(designOverride) },
        "Design override created successfully",
      ),
    );
});

const updateDesignOverride = asyncHandler(async (req, res) => {
  const overrideId = req.params.overrideId;
  const existingOverride = await getDesignOverrideById(overrideId);

  if (!existingOverride) {
    throw new ApiError(404, "Design override not found");
  }

  if (!hasMeaningfulOverrideBody(req.body)) {
    await archiveMmfPrintReadyFilesAndReferences({
      mmfObjectId: existingOverride.mmf_object_id,
      errorMessage: "Archived because all MMF override options were cleared.",
    });

    await deleteDesignOverrideById(overrideId);

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Design override removed successfully"));
  }

  const isPrintReady =
    parseOptionalBoolean(req.body.isPrintReady, "isPrintReady") ??
    Boolean(existingOverride.is_print_ready);
  const isEnablingPrintReady =
    isPrintReady && !Boolean(existingOverride.is_print_ready);

  requirePrintReadyVerification({
    isEnabling: isEnablingPrintReady,
    confirmation: req.body.verificationConfirmed,
    targetLabel: "MMF Print Ready",
  });

  let mappingResult;

  try {
    mappingResult = Object.prototype.hasOwnProperty.call(
      req.body,
      "linkedLocalDesignId",
    )
      ? await resolveMmfPrintReadyFileMapping({
          mmfObjectId: existingOverride.mmf_object_id,
          body: req.body,
          isPrintReady,
          adminUserId: req.user.id,
        })
      : await resolveMmfPrintReadyFileMapping({
          mmfObjectId: existingOverride.mmf_object_id,
          body: req.body,
          existingLinkedLocalDesignId: existingOverride.linked_local_design_id,
          isPrintReady,
          adminUserId: req.user.id,
        });
  } catch (error) {
    await updateDesignOverrideById(overrideId, {
      isHidden:
        parseOptionalBoolean(req.body.isHidden, "isHidden") ??
        Boolean(existingOverride.is_hidden),
      isPinned:
        parseOptionalBoolean(req.body.isPinned, "isPinned") ??
        Boolean(existingOverride.is_pinned),
      isPrintReady: false,
      linkedLocalDesignId: existingOverride.linked_local_design_id,
      mappingStatus: "failed",
      mappingError: error.message,
      mappingMetadata: {
        mmfObjectId: existingOverride.mmf_object_id,
        attemptedAt: new Date().toISOString(),
        requestedPrintReady: true,
      },
      printReadyVerifiedAt: existingOverride.print_ready_verified_at,
      printReadyVerifiedBy: existingOverride.print_ready_verified_by,
      clientNote: Object.prototype.hasOwnProperty.call(req.body, "clientNote")
        ? normalizeOptionalText(req.body.clientNote)
        : existingOverride.client_note,
      updatedBy: req.user.id,
    });

    throw new ApiError(
      400,
      `MMF Print Ready file caching failed: ${error.message}`,
    );
  }

  const verificationMetadata = isEnablingPrintReady
    ? buildPrintReadyVerificationMetadata(req.body, req.user.id)
    : parseJsonSafely(existingOverride.mapping_metadata)?.verification || null;

  if (!isPrintReady && Boolean(existingOverride.is_print_ready)) {
    await archiveMmfPrintReadyFilesAndReferences({
      mmfObjectId: existingOverride.mmf_object_id,
      errorMessage: "Archived because MMF Print Ready was disabled.",
    });
  }

  const designOverride = await updateDesignOverrideById(overrideId, {
    isHidden:
      parseOptionalBoolean(req.body.isHidden, "isHidden") ??
      Boolean(existingOverride.is_hidden),
    isPinned:
      parseOptionalBoolean(req.body.isPinned, "isPinned") ??
      Boolean(existingOverride.is_pinned),
    isPrintReady,
    linkedLocalDesignId: mappingResult.linkedLocalDesignId,
    mappingStatus: mappingResult.mappingStatus,
    mappingError: mappingResult.mappingError,
    mappingMetadata: {
      ...(mappingResult.mappingMetadata ||
        parseJsonSafely(existingOverride.mapping_metadata) ||
        {}),
      ...(verificationMetadata ? { verification: verificationMetadata } : {}),
    },
    printReadyVerifiedAt: isPrintReady
      ? existingOverride.print_ready_verified_at || new Date()
      : null,
    printReadyVerifiedBy: isPrintReady
      ? existingOverride.print_ready_verified_by || req.user.id
      : null,
    clientNote: Object.prototype.hasOwnProperty.call(req.body, "clientNote")
      ? normalizeOptionalText(req.body.clientNote)
      : existingOverride.client_note,
    updatedBy: req.user.id,
  });

  if (!designOverride) {
    throw new ApiError(404, "Design override not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { designOverride: normalizeDesignOverride(designOverride) },
        "Design override updated successfully",
      ),
    );
});

const deleteDesignOverride = asyncHandler(async (req, res) => {
  const existingOverride = await getDesignOverrideById(req.params.overrideId);

  if (!existingOverride) {
    throw new ApiError(404, "Design override not found");
  }

  await archiveMmfPrintReadyFilesAndReferences({
    mmfObjectId: existingOverride.mmf_object_id,
    errorMessage: "Archived because the MMF override was deleted.",
  });

  const deleted = await deleteDesignOverrideById(req.params.overrideId);

  if (!deleted) {
    throw new ApiError(404, "Design override not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Design override deleted successfully"));
});

const updateLocalDesignPrintReady = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const designFileId =
    req.body.designFileId === undefined || req.body.designFileId === ""
      ? null
      : Number(req.body.designFileId);
  const isPrintReady = parseOptionalBoolean(
    req.body.isPrintReady,
    "isPrintReady",
  );

  if (isPrintReady === undefined) {
    throw new ApiError(400, "isPrintReady is required");
  }

  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (
    !["auto_approved", "admin_approved"].includes(
      existingLocalDesign.moderation_status,
    )
  ) {
    throw new ApiError(400, "Only approved designs can be marked Print Ready");
  }

  const targetFile =
    designFileId
      ? existingLocalDesign.files?.find(
          (file) =>
            Number(file.id) === Number(designFileId) &&
            (file.status || "active") === "active",
        )
      : existingLocalDesign.files?.find(
          (file) => file.isPrimary && (file.status || "active") === "active",
        ) ||
        existingLocalDesign.files?.find(
          (file) => (file.status || "active") === "active",
        ) ||
        null;

  if (!targetFile && isPrintReady) {
    throw new ApiError(400, "Select a design file before marking Print Ready");
  }

  requirePrintReadyVerification({
    isEnabling: isPrintReady && !Boolean(targetFile?.isPrintReady),
    confirmation: req.body.verificationConfirmed,
    targetLabel: "Local file Print Ready",
  });

  const verificationMetadata =
    isPrintReady && !Boolean(targetFile?.isPrintReady)
      ? buildPrintReadyVerificationMetadata(req.body, req.user.id)
      : null;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (targetFile?.id) {
      await updateLocalDesignFilePrintReady(
        {
          localDesignId: Number(designId),
          designFileId: targetFile.id,
          isPrintReady,
          printReadyAt: isPrintReady ? new Date() : null,
          printReadyBy: isPrintReady ? req.user.id : null,
        },
        connection,
      );
    }

    const updatedDesign = await syncLocalDesignPrintReadySummary(
      Number(designId),
      connection,
    );

    await createLocalDesignAuditEvent(
      {
        localDesignId: designId,
        actorId: req.user.id,
        actorType: "admin",
        eventType: isPrintReady
          ? "admin_marked_print_ready"
          : "admin_unmarked_print_ready",
        fromStatus: existingLocalDesign.moderation_status,
        toStatus: existingLocalDesign.moderation_status,
        summary: isPrintReady
          ? "Admin marked the design as Print Ready after local verification."
          : "Admin removed Print Ready status.",
        metadata: {
          designFileId: targetFile?.id || null,
          fileName: targetFile?.originalFileName || targetFile?.fileUrl || null,
          verification: verificationMetadata,
        },
      },
      connection,
    );

    await connection.commit();

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { localDesign: normalizeLocalDesign(updatedDesign) },
          "Print Ready status updated successfully",
        ),
      );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const updateMyDesign = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(404, "Design not found");
  }

  if (existingLocalDesign.source_kind !== "community") {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(400, "Only community designs can be edited here");
  }

  if (Number(existingLocalDesign.uploaded_by) !== Number(req.user.id)) {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(403, "You can only edit your own designs");
  }

  if (!EDITABLE_OWNER_STATUSES.has(existingLocalDesign.moderation_status)) {
    await cleanupNewUploadedLocalDesignAssets(req);
    throw new ApiError(
      400,
      "This design cannot be edited in its current status",
    );
  }

  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );
  const nextFileUrl = existingLocalDesign.file_url;
  const nextThumbnailUrl = existingLocalDesign.thumbnail_url;
  const assetIntent = parseAssetIntent(req.body);
  const hasAssetIntentUpdate =
    uploadedDesignFiles.length > 0 ||
    uploadedThumbnailImages.length > 0 ||
    assetIntent.removeFileIds.length > 0 ||
    assetIntent.removeImageIds.length > 0 ||
    Boolean(assetIntent.replaceFileId) ||
    Boolean(assetIntent.replaceImageId) ||
    assetIntent.primaryFileId !== undefined ||
    assetIntent.primaryImageId !== undefined ||
    assetIntent.fileOrder.length > 0 ||
    assetIntent.imageOrder.length > 0;

  const hasMetadataUpdate =
    Object.prototype.hasOwnProperty.call(req.body, "title") ||
    Object.prototype.hasOwnProperty.call(req.body, "description") ||
    Object.prototype.hasOwnProperty.call(req.body, "categoryId") ||
    Object.prototype.hasOwnProperty.call(req.body, "tagIds") ||
    Object.prototype.hasOwnProperty.call(req.body, "licenseType") ||
    Object.prototype.hasOwnProperty.call(req.body, "ownershipConfirmed") ||
    Object.prototype.hasOwnProperty.call(req.body, "policyAcknowledged");

  const shouldScreenApprovedEdit =
    hasAssetIntentUpdate ||
    hasMetadataUpdate;

  const nextState = resolveOwnerEditState(
    existingLocalDesign,
    shouldScreenApprovedEdit,
  );

  let committedAssetChanges = false;
  let moderationRun = null;
  const generatedSnapshotPaths = [];

  try {
    const connection = await pool.getConnection();
    let duplicateDesignPaths = [];
    let duplicateThumbnailPaths = [];

    try {
      await connection.beginTransaction();

      const taxonomy = await resolveLocalDesignTaxonomy({
        body: req.body,
        userId: req.user.id,
        connection,
        existingLocalDesign,
      });

      const updatedDesign = await updateCommunityDesignById(
        designId,
        {
          title: hasText(req.body.title)
            ? String(req.body.title).trim()
            : existingLocalDesign.title,
          description: Object.prototype.hasOwnProperty.call(
            req.body,
            "description",
          )
            ? normalizeOptionalText(req.body.description)
            : existingLocalDesign.description,
          thumbnailUrl: nextThumbnailUrl,
          fileUrl: nextFileUrl,
          material: Object.prototype.hasOwnProperty.call(req.body, "material")
            ? normalizeOptionalText(req.body.material)
            : existingLocalDesign.material,
          dimensions: Object.prototype.hasOwnProperty.call(
            req.body,
            "dimensions",
          )
            ? normalizeOptionalText(req.body.dimensions)
            : existingLocalDesign.dimensions,
          licenseType: Object.prototype.hasOwnProperty.call(
            req.body,
            "licenseType",
          )
            ? normalizeOptionalText(req.body.licenseType)
            : existingLocalDesign.license_type,
          categoryId: taxonomy.categoryId,
          ownershipConfirmed:
            parseOptionalBoolean(
              req.body.ownershipConfirmed,
              "ownershipConfirmed",
            ) ?? Boolean(existingLocalDesign.ownership_confirmed),
          policyAcknowledged:
            parseOptionalBoolean(
              req.body.policyAcknowledged,
              "policyAcknowledged",
            ) ?? Boolean(existingLocalDesign.policy_acknowledged),
          ...nextState,
        },
        connection,
      );

      if (taxonomy.hasTagUpdate) {
        await replaceLocalDesignTags({
          localDesignId: Number(designId),
          tagIds: taxonomy.tagIds,
          connection,
        });
      }

      const assetResult = await applyLocalDesignAssetIntent({
        localDesignId: Number(designId),
        existingLocalDesign,
        body: req.body,
        uploadedDesignFiles,
        uploadedThumbnailImages,
        actorId: req.user.id,
        actorType: "user",
        connection,
        allowZeroActiveModelFiles: !APPROVED_DESIGN_STATUSES.has(
          existingLocalDesign.moderation_status,
        ),
        generatedSnapshotPaths,
      });
      duplicateDesignPaths = assetResult.duplicateDesignPaths;
      duplicateThumbnailPaths = assetResult.duplicateThumbnailPaths;

      let refreshedLocalDesign = null;
      const shouldQueueAiScreening =
        shouldScreenApprovedEdit &&
        APPROVED_DESIGN_STATUSES.has(existingLocalDesign.moderation_status);

      if (shouldQueueAiScreening) {
        const latestDesign = await getLocalDesignByIdForAdmin(designId, connection);
        const { updatedDesign: queuedDesign, moderationRun: queuedRun } =
          await queueDesignForAiScreening({
            localDesign: latestDesign,
            actorId: req.user.id,
            actorType: "user",
            eventType: nextState.eventType,
            triggerKind: "owner_edit",
            connection,
          });
        refreshedLocalDesign = queuedDesign;
        moderationRun = queuedRun;
      } else {
        await createLocalDesignAuditEvent(
          {
            localDesignId: designId,
            actorId: req.user.id,
            actorType: "user",
            eventType: nextState.eventType,
            fromStatus: existingLocalDesign.moderation_status,
            toStatus: nextState.moderationStatus,
            summary: nextState.moderationSummary || "Owner updated the design.",
          },
          connection,
        );
      }

      await connection.commit();
      committedAssetChanges = true;
      if (moderationRun) {
        enqueueDesignModerationRun(moderationRun.id);
      }
      await cleanupManagedLocalDesignPublicPaths(duplicateDesignPaths, "design");
      await cleanupManagedLocalDesignPublicPaths(
        duplicateThumbnailPaths,
        "thumbnail",
      );

      if (!refreshedLocalDesign) {
        refreshedLocalDesign = await getLocalDesignByIdForAdmin(updatedDesign.id);
      }

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { localDesign: normalizeLocalDesign(refreshedLocalDesign) },
            "Design updated successfully",
          ),
        );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (!committedAssetChanges) {
      await cleanupNewUploadedLocalDesignAssets(req);
      await cleanupManagedLocalDesignPublicPaths(
        generatedSnapshotPaths,
        "thumbnail",
      );
    }

    throw error;
  }
});

const deleteMyDesign = asyncHandler(async (req, res) => {
  const designId = req.params.designId;
  const existingLocalDesign = await getLocalDesignByIdForAdmin(designId);

  if (!existingLocalDesign) {
    throw new ApiError(404, "Design not found");
  }

  if (existingLocalDesign.source_kind !== "community") {
    throw new ApiError(400, "Only community designs can be deleted here");
  }

  if (Number(existingLocalDesign.uploaded_by) !== Number(req.user.id)) {
    throw new ApiError(403, "You can only delete your own designs");
  }

  if (existingLocalDesign.deleted_at) {
    return res
      .status(200)
      .json(new ApiResponse(200, null, "Design already deleted"));
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await softDeleteCommunityDesignById(
      {
        designId,
        deletedBy: req.user.id,
        deleteReason: normalizeOptionalText(req.body?.deleteReason),
      },
      connection,
    );

    await markLocalDesignAssetReferencesInactive({
      localDesign: existingLocalDesign,
      status: "owner_deleted",
      reason:
        "Owner deleted the design; files remain privately retained until cleanup.",
      connection,
    });

    await createLocalDesignAuditEvent(
      {
        localDesignId: designId,
        actorId: req.user.id,
        actorType: "user",
        eventType: "owner_deleted_design",
        fromStatus: existingLocalDesign.moderation_status,
        toStatus: existingLocalDesign.moderation_status,
        summary:
          "Owner deleted the design. It is hidden from public and owner default views.",
        metadata: {
          deleteReason: normalizeOptionalText(req.body?.deleteReason),
        },
      },
      connection,
    );

    await connection.commit();

    return res
      .status(200)
      .json(new ApiResponse(200, null, "Design deleted successfully"));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export {
  searchDesignLibrary,
  getMmfDesignDetail,
  getDesignTaxonomy,
  getDesignTaxonomyForAdmin,
  createDesignCategoryForAdmin,
  updateDesignCategoryForAdmin,
  createDesignTagForAdmin,
  updateDesignTagForAdmin,
  listLocalDesigns,
  listLocalDesignsForAdmin,
  updateLocalDesignLibraryCurationSettings,
  getLocalDesignDetail,
  getLocalDesignDetailForAdmin,
  listSavedDesigns,
  saveLocalDesign,
  unsaveLocalDesign,
  createLocalDesign,
  updateLocalDesign,
  deactivateLocalDesign,
  archiveLocalDesign,
  deleteLocalDesign,
  listDesignOverrides,
  getMmfOAuthConnectionStatus,
  startMmfOAuthConnection,
  handleMmfOAuthCallback,
  disconnectMmfOAuthConnection,
  inspectMmfDesignFiles,
  removeMmfPrintReadyFile,
  createDesignOverride,
  updateDesignOverride,
  deleteDesignOverride,
  listMyDesigns,
  createMyDesignDraft,
  publishMyDesign,
  moderateLocalDesign,
  recheckLocalDesignModeration,
  updateLocalDesignPrintReady,
  updateMyDesign,
  deleteMyDesign,
};
