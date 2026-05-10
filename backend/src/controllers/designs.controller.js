import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import pool from "../db/db.js";
import {
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
  upsertDesignCategoryByName,
  upsertDesignTagByName,
  replaceLocalDesignTags,
  getLocalDesignsByOwner,
  createLocalDesignAuditEvent,
  updateLocalDesignModerationState,
  updateCommunityDesignById,
  searchActiveLocalDesigns,
} from "../models/local-design.model.js";
import {
  getAllDesignOverrides,
  getDesignOverrideById,
  getDesignOverrideByMmfObjectId,
  getDesignOverridesByMmfObjectIds,
  createDesignOverride as createDesignOverrideRecord,
  updateDesignOverrideById,
  deleteDesignOverrideById,
} from "../models/design-overrides.model.js";
import {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";
import { removeManagedLocalDesignFile } from "../utils/local-design-storage.util.js";
import { runDesignModerationPipeline } from "../services/design-moderation-pipeline.service.js";
import { mapMmfObjectToLocalDesign } from "../services/mmf-print-ready-mapping.service.js";

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

function resolveOwnerEditState(existingDesign, shouldReturnToReview) {
  if (
    shouldReturnToReview &&
    ["auto_approved", "admin_approved"].includes(
      existingDesign.moderation_status,
    )
  ) {
    return {
      moderationStatus: "needs_admin_review",
      isActive: false,
      isPrintReady: false,
      moderationFeedback:
        "This design was updated and must be reviewed before public visibility.",
      moderationSummary:
        "Owner updated an approved design, so it was returned to review.",
      moderationDecisionSource: "rules",
      eventType: "owner_updated_approved_design",
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

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
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
  return {
    ...item,
    override: override
      ? {
          id: override.id,
          isHidden: Boolean(override.is_hidden),
          isPinned: Boolean(override.is_pinned),
          isPrintReady: Boolean(override.is_print_ready),
          linkedLocalDesignId: override.linked_local_design_id || null,
          clientNote: override.client_note || null,
        }
      : {
          isHidden: false,
          isPinned: false,
          isPrintReady: false,
          linkedLocalDesignId: null,
          clientNote: null,
        },
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

function parseNameList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeOptionalText).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map(normalizeOptionalText).filter(Boolean);
  }

  return [];
}

function getUploadedFile(req, fieldName) {
  const files = req.files?.[fieldName];

  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  return files[0];
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

function normalizeLocalDesign(localDesign) {
  if (!localDesign) {
    return null;
  }

  return {
    id: localDesign.id,
    source: "local",
    sourceKind: localDesign.source_kind,
    moderationStatus: localDesign.moderation_status,
    title: localDesign.title,
    description: localDesign.description,
    thumbnailUrl: localDesign.thumbnail_url,
    fileUrl: localDesign.file_url,
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
    ownershipConfirmed: Boolean(localDesign.ownership_confirmed),
    policyAcknowledged: Boolean(localDesign.policy_acknowledged),
    moderationFlags: localDesign.moderation_flags,
    moderationSummary: localDesign.moderation_summary,
    moderationFeedback: localDesign.moderation_feedback,
    moderationDecisionSource: localDesign.moderation_decision_source,
    publishedAt: localDesign.published_at,
    reviewedAt: localDesign.reviewed_at,
    reviewedBy: localDesign.reviewed_by,
    printReadyAt: localDesign.print_ready_at,
    printReadyBy: localDesign.print_ready_by,
    uploadedBy: localDesign.uploaded_by,
    archivedAt: localDesign.archived_at,
    archivedBy: localDesign.archived_by,
    createdAt: localDesign.created_at,
    updatedAt: localDesign.updated_at,
  };
}

function normalizeDesignOverride(designOverride) {
  if (!designOverride) {
    return null;
  }

  return {
    id: designOverride.id,
    mmfObjectId: designOverride.mmf_object_id,
    isHidden: Boolean(designOverride.is_hidden),
    isPinned: Boolean(designOverride.is_pinned),
    isPrintReady: Boolean(designOverride.is_print_ready),
    linkedLocalDesignId: designOverride.linked_local_design_id || null,
    clientNote: designOverride.client_note,
    createdBy: designOverride.created_by,
    updatedBy: designOverride.updated_by,
    createdAt: designOverride.created_at,
    updatedAt: designOverride.updated_at,
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

async function resolveLocalDesignTaxonomy({
  body,
  userId,
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
    const category = await upsertDesignCategoryByName({
      name: body.categoryName,
      userId,
      connection,
    });
    categoryId = category?.id || null;
  }

  const hasTagUpdate =
    Object.prototype.hasOwnProperty.call(body, "tagIds") ||
    Object.prototype.hasOwnProperty.call(body, "tagNames");

  const tagIds = parseIdList(body.tagIds);
  const tagNames = parseNameList(body.tagNames);

  for (const tagName of tagNames) {
    const tag = await upsertDesignTagByName({
      name: tagName,
      userId,
      connection,
    });

    if (tag?.id) {
      tagIds.push(tag.id);
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

async function resolveMmfPrintReadyLinkedDesignId({
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
    return linkedLocalDesignId;
  }

  const mmfObject = await getObjectById(mmfObjectId);
  const { localDesign } = await mapMmfObjectToLocalDesign({
    mmfObject,
    adminUserId,
  });

  return localDesign.id;
}

async function cleanupNewUploadedLocalDesignAssets(req) {
  const uploadedDesignFile = getUploadedFile(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  );
  const uploadedThumbnailImage = getUploadedFile(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  );

  if (uploadedDesignFile) {
    const uploadedDesignPath = buildStoredLocalDesignPath(
      uploadedDesignFile,
      "design",
    );
    await removeManagedLocalDesignFile(uploadedDesignPath, "design");
  }

  if (uploadedThumbnailImage) {
    const uploadedThumbnailPath = buildStoredLocalDesignPath(
      uploadedThumbnailImage,
      "thumbnail",
    );
    await removeManagedLocalDesignFile(uploadedThumbnailPath, "thumbnail");
  }
}

const searchDesignLibrary = asyncHandler(async (req, res) => {
  const searchQuery = hasText(req.query.q) ? String(req.query.q).trim() : null;

  const localResult = await searchActiveLocalDesigns({
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

  let mmfResults = null;
  let mmfStatus = {
    available: true,
    message: null,
  };

  if (searchQuery) {
    try {
      const mmfPage = Number(req.query.mmfPage || req.query.page || 1);
      const mmfPerPage = Number(
        req.query.mmfPerPage || req.query.per_page || 12,
      );
      const mmfSort = hasText(req.query.mmfSort)
        ? String(req.query.mmfSort).trim()
        : hasText(req.query.sort)
          ? String(req.query.sort).trim()
          : "popularity";
      const mmfOrder = hasText(req.query.mmfOrder)
        ? String(req.query.mmfOrder).trim()
        : hasText(req.query.order)
          ? String(req.query.order).trim()
          : "desc";

      mmfResults = await searchObjects({
        q: searchQuery,
        page: mmfPage,
        per_page: mmfPerPage,
        sort: mmfSort,
        order: mmfOrder,
      });
    } catch (error) {
      mmfStatus = {
        available: false,
        message: error.message || "MyMiniFactory is currently unavailable",
      };
    }
  }

  let curatedMmfResults = {
    items: [],
    page: searchQuery ? Number(req.query.mmfPage || req.query.page || 1) : 1,
    limit: searchQuery
      ? Number(req.query.mmfPerPage || req.query.per_page || 12)
      : 12,
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

    const pinnedItems = visibleItems.filter((item) => item.override?.isPinned);
    const unpinnedItems = visibleItems.filter(
      (item) => !item.override?.isPinned,
    );

    const mmfPage = Number(req.query.mmfPage || req.query.page || 1);
    const mmfPerPage = Number(req.query.mmfPerPage || req.query.per_page || 12);
    const mmfTotalCount = Number(
      mmfResults.totalCount || visibleItems.length || 0,
    );

    curatedMmfResults = {
      items: [...pinnedItems, ...unpinnedItems],
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

  return res.status(200).json(
    new ApiResponse(
      200,
      {
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
  const override = await getDesignOverrideByMmfObjectId(req.params.objectId);

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

  if (sourceKind && !["lab", "community"].includes(sourceKind)) {
    throw new ApiError(400, "sourceKind must be either lab or community");
  }

  const invalidStatus = statuses.find(
    (status) => !DESIGN_MODERATION_STATUSES.has(status),
  );

  if (invalidStatus) {
    throw new ApiError(400, `Invalid design status filter: ${invalidStatus}`);
  }

  const localDesigns = (
    await getAllLocalDesignsForAdmin({
      archived,
      sourceKind,
      statuses,
    })
  ).map(normalizeLocalDesign);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { localDesigns },
        "Admin local designs fetched successfully",
      ),
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
  const localDesign = await getLocalDesignById(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { localDesign: normalizeLocalDesign(localDesign) },
        "Local design fetched successfully",
      ),
    );
});

const getLocalDesignDetailForAdmin = asyncHandler(async (req, res) => {
  const localDesign = await getLocalDesignByIdForAdmin(req.params.designId);
  const auditEvents = await getLocalDesignAuditEvents(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        localDesign: normalizeLocalDesign(localDesign),
        auditEvents: auditEvents.map(normalizeLocalDesignAuditEvent),
      },
      "Admin local design fetched successfully",
    ),
  );
});

const createLocalDesign = asyncHandler(async (req, res) => {
  const uploadedDesignFile = getUploadedFile(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  );
  const uploadedThumbnailImage = getUploadedFile(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  );

  if (!uploadedDesignFile) {
    throw new ApiError(400, "Design file is required");
  }

  const fileUrl = buildStoredLocalDesignPath(uploadedDesignFile, "design");
  const thumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : null;

  try {
    const connection = await pool.getConnection();

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

      await connection.commit();

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
    await removeManagedLocalDesignFile(fileUrl, "design");

    if (thumbnailUrl) {
      await removeManagedLocalDesignFile(thumbnailUrl, "thumbnail");
    }

    throw error;
  }
});

const createMyDesignDraft = asyncHandler(async (req, res) => {
  const uploadedDesignFile = getUploadedFile(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  );
  const uploadedThumbnailImage = getUploadedFile(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  );

  const fileUrl = uploadedDesignFile
    ? buildStoredLocalDesignPath(uploadedDesignFile, "design")
    : null;

  const thumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : null;

  try {
    const connection = await pool.getConnection();

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
    if (fileUrl) await removeManagedLocalDesignFile(fileUrl, "design");
    if (thumbnailUrl) {
      await removeManagedLocalDesignFile(thumbnailUrl, "thumbnail");
    }

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

  if (!hasText(existingLocalDesign.file_url)) {
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

  const moderation = await runDesignModerationPipeline(existingLocalDesign);
  const previousStatus = existingLocalDesign.moderation_status;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedDesign = await updateLocalDesignModerationState(
      designId,
      {
        moderationStatus: moderation.status,
        isActive: moderation.isActive,
        isPrintReady: false,
        moderationFlags: moderation.flags,
        moderationSummary: moderation.summary,
        moderationFeedback: moderation.feedback,
        moderationDecisionSource: moderation.decisionSource,
        publishedAt: new Date(),
        reviewedAt:
          moderation.status === "needs_admin_review" ? null : new Date(),
      },
      connection,
    );

    await createLocalDesignAuditEvent(
      {
        localDesignId: designId,
        actorId: req.user.id,
        actorType: "user",
        eventType: "published_for_screening",
        fromStatus: previousStatus,
        toStatus: moderation.status,
        summary: moderation.summary,
        metadata: {
          decisionSource: moderation.decisionSource,
          flags: moderation.flags,
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
          "Design published for review successfully",
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

  const uploadedDesignFile = getUploadedFile(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  );
  const uploadedThumbnailImage = getUploadedFile(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  );

  const nextFileUrl = uploadedDesignFile
    ? buildStoredLocalDesignPath(uploadedDesignFile, "design")
    : existingLocalDesign.file_url;

  const nextThumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : existingLocalDesign.thumbnail_url;

  const isActive =
    parseOptionalBoolean(req.body.isActive, "isActive") ??
    Boolean(existingLocalDesign.is_active);

  try {
    const connection = await pool.getConnection();
    let localDesign;

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

      await connection.commit();
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

    const replacedDesignFile =
      uploadedDesignFile &&
      existingLocalDesign.file_url &&
      existingLocalDesign.file_url !== localDesign.file_url;

    const replacedThumbnailFile =
      uploadedThumbnailImage &&
      existingLocalDesign.thumbnail_url &&
      existingLocalDesign.thumbnail_url !== localDesign.thumbnail_url;

    if (replacedDesignFile) {
      await removeManagedLocalDesignFile(
        existingLocalDesign.file_url,
        "design",
      );
    }

    if (replacedThumbnailFile) {
      await removeManagedLocalDesignFile(
        existingLocalDesign.thumbnail_url,
        "thumbnail",
      );
    }

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
    if (uploadedDesignFile && nextFileUrl !== existingLocalDesign.file_url) {
      await removeManagedLocalDesignFile(nextFileUrl, "design");
    }

    if (
      uploadedThumbnailImage &&
      nextThumbnailUrl !== existingLocalDesign.thumbnail_url
    ) {
      await removeManagedLocalDesignFile(nextThumbnailUrl, "thumbnail");
    }

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

  if (references.printRequestCount > 0 || references.designRequestCount > 0) {
    throw new ApiError(
      409,
      "Local design cannot be deleted while print requests or design requests still reference it",
    );
  }

  const deleted = await deleteLocalDesignById(req.params.designId);

  if (!deleted) {
    throw new ApiError(404, "Local design not found");
  }

  await Promise.all([
    removeManagedLocalDesignFile(existingLocalDesign.file_url, "design"),
    removeManagedLocalDesignFile(
      existingLocalDesign.thumbnail_url,
      "thumbnail",
    ),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Local design deleted successfully"));
});

const listDesignOverrides = asyncHandler(async (req, res) => {
  const designOverrides = (await getAllDesignOverrides()).map(
    normalizeDesignOverride,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { designOverrides },
        "Design overrides fetched successfully",
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
  const linkedLocalDesignId = await resolveMmfPrintReadyLinkedDesignId({
    mmfObjectId,
    body: req.body,
    isPrintReady,
    adminUserId: req.user.id,
  });

  const designOverride = await createDesignOverrideRecord({
    mmfObjectId,
    isHidden: parseOptionalBoolean(req.body.isHidden, "isHidden") ?? false,
    isPinned: parseOptionalBoolean(req.body.isPinned, "isPinned") ?? false,
    isPrintReady,
    linkedLocalDesignId,
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

  const isPrintReady =
    parseOptionalBoolean(req.body.isPrintReady, "isPrintReady") ??
    Boolean(existingOverride.is_print_ready);
  const linkedLocalDesignId = Object.prototype.hasOwnProperty.call(
    req.body,
    "linkedLocalDesignId",
  )
    ? await resolveMmfPrintReadyLinkedDesignId({
        mmfObjectId: existingOverride.mmf_object_id,
        body: req.body,
        isPrintReady,
        adminUserId: req.user.id,
      })
    : await resolveMmfPrintReadyLinkedDesignId({
        mmfObjectId: existingOverride.mmf_object_id,
        body: req.body,
        existingLinkedLocalDesignId: existingOverride.linked_local_design_id,
        isPrintReady,
        adminUserId: req.user.id,
      });

  const designOverride = await updateDesignOverrideById(overrideId, {
    isHidden:
      parseOptionalBoolean(req.body.isHidden, "isHidden") ??
      Boolean(existingOverride.is_hidden),
    isPinned:
      parseOptionalBoolean(req.body.isPinned, "isPinned") ??
      Boolean(existingOverride.is_pinned),
    isPrintReady,
    linkedLocalDesignId,
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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedDesign = await updateLocalDesignModerationState(
      designId,
      {
        moderationStatus: existingLocalDesign.moderation_status,
        isActive: Boolean(existingLocalDesign.is_active),
        isPrintReady,
        moderationFlags: existingLocalDesign.moderation_flags,
        moderationSummary: existingLocalDesign.moderation_summary,
        moderationFeedback: existingLocalDesign.moderation_feedback,
        moderationDecisionSource:
          existingLocalDesign.moderation_decision_source,
        reviewedBy: existingLocalDesign.reviewed_by,
        reviewedAt: existingLocalDesign.reviewed_at,
        printReadyAt: isPrintReady ? new Date() : null,
        printReadyBy: isPrintReady ? req.user.id : null,
      },
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

  const uploadedDesignFile = getUploadedFile(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  );
  const uploadedThumbnailImage = getUploadedFile(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  );

  const nextFileUrl = uploadedDesignFile
    ? buildStoredLocalDesignPath(uploadedDesignFile, "design")
    : existingLocalDesign.file_url;

  const nextThumbnailUrl = uploadedThumbnailImage
    ? buildStoredLocalDesignPath(uploadedThumbnailImage, "thumbnail")
    : existingLocalDesign.thumbnail_url;

  const replacedDesignFile =
    Boolean(uploadedDesignFile) &&
    existingLocalDesign.file_url &&
    existingLocalDesign.file_url !== nextFileUrl;

  const hasMetadataUpdate =
    Object.prototype.hasOwnProperty.call(req.body, "title") ||
    Object.prototype.hasOwnProperty.call(req.body, "description") ||
    Object.prototype.hasOwnProperty.call(req.body, "categoryId") ||
    Object.prototype.hasOwnProperty.call(req.body, "categoryName") ||
    Object.prototype.hasOwnProperty.call(req.body, "tagIds") ||
    Object.prototype.hasOwnProperty.call(req.body, "tagNames") ||
    Object.prototype.hasOwnProperty.call(req.body, "licenseType") ||
    Object.prototype.hasOwnProperty.call(req.body, "ownershipConfirmed") ||
    Object.prototype.hasOwnProperty.call(req.body, "policyAcknowledged");

  const shouldReturnToReview =
    replacedDesignFile || hasMetadataUpdate || Boolean(uploadedThumbnailImage);

  const nextState = resolveOwnerEditState(
    existingLocalDesign,
    shouldReturnToReview,
  );

  try {
    const connection = await pool.getConnection();

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

      await connection.commit();

      if (uploadedDesignFile && existingLocalDesign.file_url) {
        await removeManagedLocalDesignFile(
          existingLocalDesign.file_url,
          "design",
        );
      }

      if (uploadedThumbnailImage && existingLocalDesign.thumbnail_url) {
        await removeManagedLocalDesignFile(
          existingLocalDesign.thumbnail_url,
          "thumbnail",
        );
      }

      const refreshedLocalDesign = await getLocalDesignByIdForAdmin(
        updatedDesign.id,
      );

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
    if (uploadedDesignFile && nextFileUrl !== existingLocalDesign.file_url) {
      await removeManagedLocalDesignFile(nextFileUrl, "design");
    }

    if (
      uploadedThumbnailImage &&
      nextThumbnailUrl !== existingLocalDesign.thumbnail_url
    ) {
      await removeManagedLocalDesignFile(nextThumbnailUrl, "thumbnail");
    }

    throw error;
  }
});

export {
  searchDesignLibrary,
  getMmfDesignDetail,
  getDesignTaxonomy,
  listLocalDesigns,
  listLocalDesignsForAdmin,
  getLocalDesignDetail,
  getLocalDesignDetailForAdmin,
  createLocalDesign,
  updateLocalDesign,
  deactivateLocalDesign,
  archiveLocalDesign,
  deleteLocalDesign,
  listDesignOverrides,
  createDesignOverride,
  updateDesignOverride,
  deleteDesignOverride,
  listMyDesigns,
  createMyDesignDraft,
  publishMyDesign,
  moderateLocalDesign,
  updateLocalDesignPrintReady,
  updateMyDesign,
};
