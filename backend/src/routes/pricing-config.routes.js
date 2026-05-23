import express from "express";
import {
  getPricingConfig,
  updatePricing,
} from "../controllers/pricing-config.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { updateQuoteValidator } from "../validators/quote.validator.js";
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const router = express.Router();

router
  .route("/")
  .get(authLimiter, verifyJWT, verifyEmailVerified, verifyAdmin, getPricingConfig)
  .put(
    authLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    updateQuoteValidator(),
    validate,
    updatePricing,
  );

export default router;
