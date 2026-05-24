import express from "express";
import {
  createRequestDraft,
  previewRequestDraft,
  submitRequestDraft,
  listMyPrintRequests,
  getMyPrintRequestDetail,
  listAllPrintRequests,
  updatePrintRequestStatus,
  archivePrintRequest,
  deletePrintRequest,
  undoPrintRequestStatus,
  cancelPrintRequest,
  streamAdminPrintRequestModel,
  streamAdminPrintRequestItemModel,
  deprecatedDraftOnlySubmission,
} from "../controllers/print-request.controller.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  createRequestDraftValidator,
  previewRequestDraftValidator,
  submitRequestDraftValidator,
  printRequestIdValidator,
  listMyPrintRequestsQueryValidator,
  listAllPrintRequestsQueryValidator,
  updatePrintRequestStatusValidator,
  correctPrintRequestStatusValidator,
  cancelPrintRequestValidator,
  printRequestItemModelValidator,
} from "../validators/print-request.validator.js";
import {
  authenticatedReadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router.use(verifyJWT);

router
  .route("/admin")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    listAllPrintRequestsQueryValidator(),
    validate,
    listAllPrintRequests,
  );

router
  .route("/admin/:requestId/items/:itemId/model")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    printRequestItemModelValidator(),
    validate,
    streamAdminPrintRequestItemModel,
  );

router
  .route("/admin/:requestId/model")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    streamAdminPrintRequestModel,
  );

router
  .route("/admin/:requestId")
  .delete(
    writeRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    deletePrintRequest,
  );

router
  .route("/admin/:requestId/status")
  .put(
    writeRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    updatePrintRequestStatusValidator(),
    validate,
    updatePrintRequestStatus,
  );

router
  .route("/admin/:requestId/undo")
  .post(
    writeRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    correctPrintRequestStatusValidator(),
    validate,
    undoPrintRequestStatus,
  );

router
  .route("/admin/:requestId/archive")
  .patch(
    writeRateLimiter,
    verifyEmailVerified,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    archivePrintRequest,
  );

router
  .route("/drafts")
  .post(
    writeRateLimiter,
    verifyEmailVerified,
    createRequestDraftValidator(),
    validate,
    createRequestDraft,
  );

router
  .route("/drafts/:draftToken/preview")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    previewRequestDraftValidator(),
    validate,
    previewRequestDraft,
  );

router
  .route("/drafts/:draftToken/submit")
  .post(
    writeRateLimiter,
    verifyEmailVerified,
    submitRequestDraftValidator(),
    validate,
    submitRequestDraft,
  );

router
  .route("/preview")
  .post(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    deprecatedDraftOnlySubmission,
  );

router
  .route("/")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    listMyPrintRequestsQueryValidator(),
    validate,
    listMyPrintRequests,
  )
  .post(writeRateLimiter, verifyEmailVerified, deprecatedDraftOnlySubmission);

router
  .route("/:requestId/cancel")
  .post(
    writeRateLimiter,
    verifyEmailVerified,
    cancelPrintRequestValidator(),
    validate,
    cancelPrintRequest,
  );

router
  .route("/:requestId")
  .get(
    authenticatedReadRateLimiter,
    verifyEmailVerified,
    printRequestIdValidator(),
    validate,
    getMyPrintRequestDetail,
  );

export default router;
