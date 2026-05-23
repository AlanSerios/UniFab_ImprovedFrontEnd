import express from "express";
import {
  calculateMmfDesignQuote,
  calculateQuote,
  calculateLocalDesignQuote,
  recalculateUploadQuote,
  getQuoteByToken,
  cleanupExpiredQuotes,
  getAdminQuoteReadiness,
  listAdminQuoteDiagnostics,
} from "../controllers/quote.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import { quoteUploadMiddleware } from "../middlewares/quote-upload.middleware.js";
import {
  calculateLocalDesignQuoteValidator,
  calculateMmfDesignQuoteValidator,
  calculateQuoteValidator,
  cleanupExpiredQuotesValidator,
  listQuoteDiagnosticsValidator,
  quoteTokenValidator,
} from "../validators/quote.validator.js";
import {
  optionalVerifyJWT,
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import {
  publicReadRateLimiter,
  quoteCalculationRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router
  .route("/calculate")
  .post(
    quoteCalculationRateLimiter,
    optionalVerifyJWT,
    quoteUploadMiddleware,
    calculateQuoteValidator(),
    validate,
    calculateQuote,
  );

router
  .route("/local-designs/:designId")
  .post(
    quoteCalculationRateLimiter,
    optionalVerifyJWT,
    calculateLocalDesignQuoteValidator(),
    validate,
    calculateLocalDesignQuote,
  );

router
  .route("/mmf/:objectId")
  .post(
    quoteCalculationRateLimiter,
    optionalVerifyJWT,
    calculateMmfDesignQuoteValidator(),
    validate,
    calculateMmfDesignQuote,
  );

router
  .route("/:quoteToken/recalculate")
  .post(
    quoteCalculationRateLimiter,
    optionalVerifyJWT,
    quoteTokenValidator(),
    calculateQuoteValidator(),
    validate,
    recalculateUploadQuote,
  );

router
  .route("/expired")
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    cleanupExpiredQuotesValidator(),
    validate,
    cleanupExpiredQuotes,
  );

router
  .route("/admin/readiness")
  .get(
    publicReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    getAdminQuoteReadiness,
  );

router
  .route("/admin/diagnostics")
  .get(
    publicReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    listQuoteDiagnosticsValidator(),
    validate,
    listAdminQuoteDiagnostics,
  );

router
  .route("/:quoteToken")
  .get(publicReadRateLimiter, quoteTokenValidator(), validate, getQuoteByToken);

export default router;
