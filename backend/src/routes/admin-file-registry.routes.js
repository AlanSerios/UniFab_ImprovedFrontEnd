import express from "express";
import {
  dryRunDatabaseRetentionCleanup,
  dryRunDesignFileCleanup,
  dryRunAdminFileRegistryCleanup,
  getAdminFileObjectDetail,
  getAdminFileRegistrySummary,
  listAdminFileObjects,
  runDatabaseRetentionCleanup,
  runAdminDesignFileCleanup,
  runAdminFileRegistryCleanup,
} from "../controllers/admin-file-registry.controller.js";
import {
  authenticatedReadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";

const router = express.Router();

router.use(verifyJWT, verifyEmailVerified, verifyAdmin);

router.route("/summary").get(authenticatedReadRateLimiter, getAdminFileRegistrySummary);

router.route("/objects").get(authenticatedReadRateLimiter, listAdminFileObjects);

router
  .route("/objects/:fileObjectId")
  .get(authenticatedReadRateLimiter, getAdminFileObjectDetail);

router.route("/cleanup/dry-run").post(writeRateLimiter, dryRunAdminFileRegistryCleanup);

router.route("/cleanup").post(writeRateLimiter, runAdminFileRegistryCleanup);

router
  .route("/design-cleanup/dry-run")
  .post(writeRateLimiter, dryRunDesignFileCleanup);

router.route("/design-cleanup").post(writeRateLimiter, runAdminDesignFileCleanup);

router
  .route("/retention-cleanup/dry-run")
  .post(writeRateLimiter, dryRunDatabaseRetentionCleanup);

router
  .route("/retention-cleanup")
  .post(writeRateLimiter, runDatabaseRetentionCleanup);

export default router;
