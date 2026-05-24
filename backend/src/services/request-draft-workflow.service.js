import fs from "fs";
import { randomBytes } from "crypto";
import { ApiError } from "../utils/api-error.js";
import { PRINT_REQUEST_SOURCE_TYPES } from "../constants/print-request.constants.js";
import { listActiveCartItemsForUser } from "../models/cart-item.model.js";
import {
  createRequestDraft as createRequestDraftRecord,
  getRequestDraftByTokenForUser,
} from "../models/request-draft.model.js";
import { getManagedQuoteModelAbsolutePath } from "../utils/quote-storage.util.js";
import { getManagedPrintRequestModelAbsolutePath } from "../utils/print-request-storage.util.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";
import { getManagedMmfPrintReadyFileAbsolutePath } from "../utils/mmf-print-ready-storage.util.js";
import { buildInlineManagedFileDownloadUrl } from "../utils/managed-file-response.util.js";

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

function getRequestDraftTtlHours() {
  const value = Number(process.env.REQUEST_DRAFT_TTL_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function buildRequestDraftExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + getRequestDraftTtlHours());
  return expiresAt;
}

function generateRequestDraftToken() {
  return randomBytes(32).toString("hex");
}

function getDraftSource(cartItemIds) {
  if (!cartItemIds.length) {
    return "cart";
  }

  return cartItemIds.length === 1 ? "single_quote" : "selected_cart";
}

function getQuotePreviewLabel(quoteRecord) {
  const designSnapshot = parseJsonSafely(quoteRecord.design_snapshot);
  const quoteSnapshot = parseJsonSafely(quoteRecord.quote_snapshot);

  return (
    quoteRecord.file_original_name ||
    designSnapshot?.title ||
    designSnapshot?.name ||
    quoteSnapshot?.file?.originalName ||
    quoteSnapshot?.design?.title ||
    quoteSnapshot?.mmfObject?.name ||
    "Quoted model"
  );
}

function getQuotePreviewCurrency(quoteRecord) {
  const pricingConfigSnapshot = parseJsonSafely(
    quoteRecord.pricing_config_snapshot,
  );
  const quoteSnapshot = parseJsonSafely(quoteRecord.quote_snapshot);

  return pricingConfigSnapshot?.currency || quoteSnapshot?.currency || "PHP";
}

async function validateQuoteRecordForSubmission(quoteRecord) {
  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.UPLOAD) {
    if (!quoteRecord.file_url) {
      throw new ApiError(500, "Quote is missing its uploaded model file");
    }

    const modelPath =
      getManagedQuoteModelAbsolutePath(quoteRecord.file_url) ||
      getManagedPrintRequestModelAbsolutePath(quoteRecord.file_url);

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A quote model file is no longer available. Please calculate a new quote.",
      );
    }
  }

  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.LIBRARY) {
    const modelPath = getManagedLocalDesignAbsolutePath(
      quoteRecord.file_url,
      "design",
    );

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A linked local design file is no longer available. Please calculate a new quote.",
      );
    }
  }

  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.MMF) {
    const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
      quoteRecord.file_url,
    );

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A cached MyMiniFactory printable file is no longer available. Please calculate a new quote.",
      );
    }
  }
}

function buildQuotePreviewItem({ cartItem, quoteRecord }) {
  const thumbnailUrl = buildInlineManagedFileDownloadUrl(
    quoteRecord.thumbnail_file_object_id,
    quoteRecord.thumbnail_url,
  );
  const fileUrl = buildInlineManagedFileDownloadUrl(
    quoteRecord.file_object_id,
    quoteRecord.file_url,
  );

  return {
    id: cartItem?.id || null,
    quoteRecordId: quoteRecord.id,
    sourceType: quoteRecord.source_type,
    designId: quoteRecord.design_id,
    label: getQuotePreviewLabel(quoteRecord),
    fileObjectId: quoteRecord.file_object_id,
    fileUrl,
    fileOriginalName: quoteRecord.file_original_name,
    fileSize: quoteRecord.file_size,
    thumbnailUrl,
    material: quoteRecord.material,
    materialColorId: quoteRecord.material_color_id,
    materialColorName: quoteRecord.material_color_name,
    materialColorHex: quoteRecord.material_color_hex,
    printQuality: quoteRecord.print_quality,
    infill: Number(quoteRecord.infill),
    quantity: Number(quoteRecord.quantity),
    estimatedCost: Number(quoteRecord.estimated_cost || 0),
    currency: getQuotePreviewCurrency(quoteRecord),
    expiresAt: quoteRecord.expires_at,
    createdAt: quoteRecord.created_at,
  };
}

function normalizeCartItemIds(cartItemIds) {
  if (!Array.isArray(cartItemIds)) {
    return [];
  }

  return [
    ...new Set(
      cartItemIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

async function getActiveCartQuoteRecords({
  clientId,
  cartItemIds = [],
  connection = null,
}) {
  const selectedCartItemIds = normalizeCartItemIds(cartItemIds);
  const cartItems = await listActiveCartItemsForUser(
    {
      userId: clientId,
      retentionDays: Number(process.env.CART_RETENTION_DAYS || 30),
    },
    connection,
  );

  if (cartItems.length === 0) {
    throw new ApiError(400, "Your cart is empty");
  }

  const selectedCartItems =
    selectedCartItemIds.length > 0
      ? cartItems.filter((cartItem) => selectedCartItemIds.includes(cartItem.id))
      : cartItems;

  if (selectedCartItemIds.length > 0) {
    const selectedIds = new Set(selectedCartItems.map((cartItem) => cartItem.id));

    for (const cartItemId of selectedCartItemIds) {
      if (!selectedIds.has(cartItemId)) {
        throw new ApiError(404, "One or more selected cart items were not found");
      }
    }
  }

  if (selectedCartItems.length === 0) {
    throw new ApiError(400, "No cart items selected for submission");
  }

  return selectedCartItems.map((cartItem) => ({
    cartItem,
    quoteRecord: cartItem.quoteRecord,
  }));
}

async function validateCartQuoteRecordsForSubmission(cartQuoteRecords) {
  const items = [];

  for (const { cartItem, quoteRecord } of cartQuoteRecords) {
    if (
      quoteRecord.used_at ||
      (quoteRecord.expires_at &&
        new Date(quoteRecord.expires_at).getTime() <= Date.now())
    ) {
      throw new ApiError(400, "One or more quote tokens are invalid or expired");
    }

    if (
      quoteRecord.owner_user_id &&
      cartItem?.user_id &&
      Number(quoteRecord.owner_user_id) !== Number(cartItem.user_id)
    ) {
      throw new ApiError(403, "One or more quotes belong to another account");
    }

    await validateQuoteRecordForSubmission(quoteRecord);
    items.push(buildQuotePreviewItem({ cartItem, quoteRecord }));
  }

  return items;
}

function buildSubmissionPreview(items, draft = null) {
  const estimatedTotal = items.reduce(
    (sum, item) => sum + Number(item.estimatedCost || 0),
    0,
  );
  const currency = items[0]?.currency || "PHP";

  return {
    draft: draft
      ? {
          draftToken: draft.draft_token,
          source: draft.source,
          status: draft.status,
          expiresAt: draft.expires_at,
        }
      : null,
    items,
    itemCount: items.length,
    estimatedTotal,
    currency,
  };
}

async function createRequestDraft({ clientId, body = {} }) {
  const selectedCartItemIds = normalizeCartItemIds(body.cartItemIds);
  const cartQuoteRecords = await getActiveCartQuoteRecords({
    clientId,
    cartItemIds: selectedCartItemIds,
  });

  await validateCartQuoteRecordsForSubmission(cartQuoteRecords);

  return createRequestDraftRecord({
    draftToken: generateRequestDraftToken(),
    userId: clientId,
    source: getDraftSource(selectedCartItemIds),
    cartItemIds: cartQuoteRecords.map(({ cartItem }) => cartItem.id),
    expiresAt: buildRequestDraftExpiresAt(),
  });
}

async function getValidRequestDraftForUser({ clientId, draftToken }) {
  const draft = await getRequestDraftByTokenForUser({
    draftToken,
    userId: clientId,
  });

  if (!draft) {
    throw new ApiError(404, "Request draft not found");
  }

  if (draft.status !== "active") {
    throw new ApiError(400, "Request draft is no longer active");
  }

  if (draft.expires_at && new Date(draft.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, "Request draft has expired");
  }

  return draft;
}

async function previewRequestDraft({ clientId, draftToken }) {
  const draft = await getValidRequestDraftForUser({ clientId, draftToken });
  const cartQuoteRecords = await getActiveCartQuoteRecords({
    clientId,
    cartItemIds: draft.cart_item_ids,
  });
  const items = await validateCartQuoteRecordsForSubmission(cartQuoteRecords);

  return buildSubmissionPreview(items, draft);
}

export {
  createRequestDraft,
  getActiveCartQuoteRecords,
  getValidRequestDraftForUser,
  previewRequestDraft,
  validateQuoteRecordForSubmission,
};
