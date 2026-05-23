import { Router } from "express";
import {
  databaseMetrics,
  healthCheck,
} from "../controllers/healthcheck.controller.js";
import { verifyEmailVerified, verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";

const router = Router();

router.route("/").get(healthCheck);

router
  .route("/database")
  .get(verifyJWT, verifyEmailVerified, verifyAdmin, databaseMetrics);

export default router;
