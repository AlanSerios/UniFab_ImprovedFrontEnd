import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import {
  buildCartPreviewItem,
  summarizeCart,
} from "../utils/cart-response.util.js";
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
