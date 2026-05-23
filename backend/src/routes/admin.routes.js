import express from "express";
import {
  getAdminDashboard,
  getContent,
  listAuditEvents,
  listUsers,
  updateContent,
  updateUser,
} from "../controllers/admin.controller.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import {
  authenticatedReadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  listAdminAuditValidator,
  listAdminUsersValidator,
  updateAdminUserValidator,
  updateContentValidator,
} from "../validators/admin.validator.js";

const router = express.Router();

router.use(verifyJWT, verifyEmailVerified, verifyAdmin);

router.route("/dashboard").get(authenticatedReadRateLimiter, getAdminDashboard);

router
  .route("/users")
  .get(
    authenticatedReadRateLimiter,
    listAdminUsersValidator(),
    validate,
    listUsers,
  );

router
  .route("/users/:userId")
  .patch(
    writeRateLimiter,
    updateAdminUserValidator(),
    validate,
    updateUser,
  );

router
  .route("/audit")
  .get(
    authenticatedReadRateLimiter,
    listAdminAuditValidator(),
    validate,
    listAuditEvents,
  );

router.route("/content").get(authenticatedReadRateLimiter, getContent);

router
  .route("/content/:contentKey")
  .patch(
    writeRateLimiter,
    updateContentValidator(),
    validate,
    updateContent,
  );

export default router;
