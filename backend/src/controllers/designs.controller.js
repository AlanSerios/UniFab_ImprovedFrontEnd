import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import fs from "fs";
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
  getAllLocalDesignsForAdmin,
  getLocalDesignById,
  getLocalDesignByIdForAdmin,
  getLocalDesignAuditEvents,
  createLocalDesign as createLocalDesignRecord,
  updateLocalDesignById,
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
  updateLocalDesignFilePrintReady,
  syncLocalDesignPrintReadySummary,
  syncLocalDesignPrimaryAssetSummary,
  countActiveLocalDesignFiles,
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
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";
import {
  getManagedLocalDesignAbsolutePath,
} from "../utils/local-design-storage.util.js";
import { markFileReferencesInactive } from "../models/file-registry.model.js";
import {
  generateStoredLocalDesignSnapshot,
} from "../utils/model-snapshot.util.js";
import { enqueueDesignModerationRun } from "../services/design-ai-moderation-orchestrator.service.js";
import {
  listLocalDesignModerationRunItems,
  listLocalDesignModerationRuns,
} from "../models/local-design-moderation-run.model.js";
import {
  normalizeDesignOverride,
  normalizeLocalDesign,
} from "../utils/design-library-response.util.js";
import {
  buildStoredLocalDesignPath,
  cleanupManagedLocalDesignPublicPaths,
  cleanupNewUploadedLocalDesignAssets,
  getUploadedFiles,
  persistUploadedLocalDesignAssets,
} from "../services/local-design-assets.service.js";
import {
  applyLocalDesignAssetIntent,
  parseAssetIntent,
} from "../services/local-design-asset-intent.service.js";
import {
  ADMIN_DESIGN_ACTIONS,
  APPROVED_DESIGN_STATUSES,
  DESIGN_MODERATION_STATUSES,
  EDITABLE_OWNER_STATUSES,
  queueDesignForAiScreening,
  resolveAdminDesignAction,
  resolveOwnerEditState,
} from "../services/design-moderation-workflow.service.js";
import {
  archiveMmfPrintReadyFilesAndReferences,
  buildPrintReadyVerificationMetadata,
  hasMeaningfulOverrideBody,
  loadMmfOverrideWithPrintReadyFiles,
  requirePrintReadyVerification,
  resolveMmfPrintReadyFileMapping,
} from "../services/mmf-design-override-workflow.service.js";

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
  const override = await loadMmfOverrideWithPrintReadyFiles({
    override: await getDesignOverrideByMmfObjectId(req.params.objectId),
    mmfObjectId: req.params.objectId,
  });

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
  listLocalDesignsForAdmin,
  updateLocalDesignLibraryCurationSettings,
  getLocalDesignDetail,
  getLocalDesignDetailForAdmin,
  listSavedDesigns,
  saveLocalDesign,
  unsaveLocalDesign,
  createLocalDesign,
  updateLocalDesign,
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
