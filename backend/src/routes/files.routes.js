import express from "express";
import { downloadFile } from "../controllers/files.controller.js";
import { optionalVerifyJWT } from "../middlewares/auth.middleware.js";
import { authenticatedReadRateLimiter } from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router
  .route("/:fileObjectId/download")
  .get(authenticatedReadRateLimiter, optionalVerifyJWT, downloadFile);

export default router;
