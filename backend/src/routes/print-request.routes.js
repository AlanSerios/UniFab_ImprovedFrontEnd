import express from "express";
import {
  submitPrintRequest,
  listMyPrintRequests,
  getMyPrintRequestDetail,
  listAllPrintRequests,
  updatePrintRequestStatus,
  archivePrintRequest,
  deletePrintRequest,
  undoPrintRequestStatus,
} from "../controllers/print-request.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  submitPrintRequestValidator,
  printRequestIdValidator,
  listMyPrintRequestsQueryValidator,
  listAllPrintRequestsQueryValidator,
  updatePrintRequestStatusValidator,
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
    verifyAdmin,
    listAllPrintRequestsQueryValidator(),
    validate,
    listAllPrintRequests,
  );

router
  .route("/admin/:requestId")
  .delete(
    writeRateLimiter,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    deletePrintRequest,
  );

router
  .route("/admin/:requestId/status")
  .put(
    writeRateLimiter,
    verifyAdmin,
    updatePrintRequestStatusValidator(),
    validate,
    updatePrintRequestStatus,
  );

router
  .route("/admin/:requestId/undo")
  .post(
    writeRateLimiter,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    undoPrintRequestStatus,
  );

router
  .route("/admin/:requestId/archive")
  .patch(
    writeRateLimiter,
    verifyAdmin,
    printRequestIdValidator(),
    validate,
    archivePrintRequest,
  );

router
  .route("/")
  .get(
    authenticatedReadRateLimiter,
    listMyPrintRequestsQueryValidator(),
    validate,
    listMyPrintRequests,
  )
  .post(
    writeRateLimiter,
    submitPrintRequestValidator(),
    validate,
    submitPrintRequest,
  );

router
  .route("/:requestId")
  .get(
    authenticatedReadRateLimiter,
    printRequestIdValidator(),
    validate,
    getMyPrintRequestDetail,
  );

export default router;
