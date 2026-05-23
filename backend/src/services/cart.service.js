import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import { buildDownloadUrl } from "./file-storage.service.js";
import {
  claimQuoteRecordForUser,
  getValidQuoteRecordByToken,
} from "../models/quote-record.model.js";
import {
  clearActiveCartForUser,
  getActiveCartItemForQuoteRecord,
  listActiveCartItemsForUser,
  removeCartItemForUser,
  upsertCartItem,
} from "../models/cart-item.model.js";

const CART_RETENTION_DAYS = Number(process.env.CART_RETENTION_DAYS || 30);

function parseJsonSafely(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isExpired(quoteRecord) {
  return quoteRecord.expires_at
    ? new Date(quoteRecord.expires_at).getTime() <= Date.now()
    : false;
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

function buildCartPreviewItem(cartItem) {
  const quoteRecord = cartItem.quoteRecord;
  const thumbnailUrl = quoteRecord.thumbnail_file_object_id
    ? buildDownloadUrl(quoteRecord.thumbnail_file_object_id, { inline: true })
    : quoteRecord.thumbnail_url;
  const fileUrl = quoteRecord.file_object_id
    ? buildDownloadUrl(quoteRecord.file_object_id, { inline: true })
    : quoteRecord.file_url;

  return {
    id: cartItem.id,
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
    addedAt: cartItem.created_at,
    isExpired: isExpired(quoteRecord),
    isSubmitted: Boolean(quoteRecord.used_at),
    designSnapshot: parseJsonSafely(quoteRecord.design_snapshot),
    quoteSnapshot: parseJsonSafely(quoteRecord.quote_snapshot),
  };
}

function summarizeCart(items) {
  const estimatedTotal = items.reduce(
    (sum, item) => sum + Number(item.estimatedCost || 0),
    0,
  );

  return {
    items,
    itemCount: items.length,
    estimatedTotal,
    currency: items[0]?.currency || "PHP",
  };
}

async function getCartForUser({ userId }) {
  const cartItems = await listActiveCartItemsForUser({
    userId,
    retentionDays: CART_RETENTION_DAYS,
  });

  return summarizeCart(cartItems.map(buildCartPreviewItem));
}

async function addQuoteToCart({ userId, quoteToken }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const quoteRecord = await getValidQuoteRecordByToken(
      quoteToken,
      connection,
    );

    if (!quoteRecord) {
      throw new ApiError(404, "Quote not found or expired");
    }

    if (
      quoteRecord.owner_user_id &&
      Number(quoteRecord.owner_user_id) !== Number(userId)
    ) {
      throw new ApiError(403, "This quote belongs to another account");
    }

    const claimed = await claimQuoteRecordForUser(
      quoteRecord.id,
      userId,
      connection,
    );

    if (!claimed) {
      throw new ApiError(403, "This quote belongs to another account");
    }

    await upsertCartItem(
      {
        userId,
        quoteRecordId: quoteRecord.id,
      },
      connection,
    );

    const cartItem = await getActiveCartItemForQuoteRecord(
      {
        userId,
        quoteRecordId: quoteRecord.id,
      },
      connection,
    );

    await connection.commit();

    return {
      cart: await getCartForUser({ userId }),
      cartItem: cartItem ? buildCartPreviewItem(cartItem) : null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function removeCartItem({ userId, cartItemId }) {
  const removed = await removeCartItemForUser({ userId, cartItemId });

  if (!removed) {
    throw new ApiError(404, "Cart item not found");
  }

  return getCartForUser({ userId });
}

async function clearCart({ userId }) {
  await clearActiveCartForUser({ userId });
  return getCartForUser({ userId });
}

export {
  addQuoteToCart,
  buildCartPreviewItem,
  clearCart,
  getCartForUser,
  removeCartItem,
};
