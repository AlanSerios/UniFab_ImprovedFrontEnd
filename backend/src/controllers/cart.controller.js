import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  addQuoteToCart,
  clearCart,
  getCartForUser,
  removeCartItem,
} from "../services/cart.service.js";

const getMyCart = asyncHandler(async (req, res) => {
  const cart = await getCartForUser({ userId: req.user.id });

  return res
    .status(200)
    .json(new ApiResponse(200, { cart }, "Cart fetched successfully"));
});

const addCartItem = asyncHandler(async (req, res) => {
  const result = await addQuoteToCart({
    userId: req.user.id,
    quoteToken: req.body.quoteToken,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { cart: result.cart, cartItem: result.cartItem },
        "Quote added to cart successfully",
      ),
    );
});

const removeMyCartItem = asyncHandler(async (req, res) => {
  const cart = await removeCartItem({
    userId: req.user.id,
    cartItemId: Number(req.params.cartItemId),
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { cart }, "Cart item removed successfully"));
});

const clearMyCart = asyncHandler(async (req, res) => {
  const cart = await clearCart({ userId: req.user.id });

  return res
    .status(200)
    .json(new ApiResponse(200, { cart }, "Cart cleared successfully"));
});

export { addCartItem, clearMyCart, getMyCart, removeMyCartItem };
