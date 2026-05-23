import express from "express";
import {
  addCartItem,
  clearMyCart,
  getMyCart,
  removeMyCartItem,
} from "../controllers/cart.controller.js";
import { verifyEmailVerified, verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  addCartItemValidator,
  cartItemIdValidator,
} from "../validators/cart.validator.js";
import {
  authenticatedReadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router.use(verifyJWT, verifyEmailVerified);

router
  .route("/")
  .get(authenticatedReadRateLimiter, getMyCart)
  .delete(writeRateLimiter, clearMyCart);

router
  .route("/items")
  .post(writeRateLimiter, addCartItemValidator(), validate, addCartItem);

router
  .route("/items/:cartItemId")
  .delete(
    writeRateLimiter,
    cartItemIdValidator(),
    validate,
    removeMyCartItem,
  );

export default router;
