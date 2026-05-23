import express from "express";
import {
  listActiveMaterials,
  listMaterials,
  listSlicerProfiles,
  createMaterial,
  updateMaterial,
  deactivateMaterial,
  uploadSlicerProfileVersion,
} from "../controllers/materials.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { slicerProfileUploadMiddleware } from "../middlewares/slicer-profile-upload.middleware.js";
import {
  createMaterialValidator,
  updateMaterialValidator,
  deactivateMaterialValidator,
  uploadSlicerProfileVersionValidator,
} from "../validators/materials.validator.js";
import {
  publicReadRateLimiter,
  uploadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router.route("/active").get(publicReadRateLimiter, listActiveMaterials);

router.use(verifyJWT, verifyEmailVerified, verifyAdmin);

router
  .route("/")
  .get(publicReadRateLimiter, listMaterials)
  .post(writeRateLimiter, createMaterialValidator(), validate, createMaterial);

router.route("/profiles").get(publicReadRateLimiter, listSlicerProfiles);

router
  .route("/:materialKey")
  .patch(writeRateLimiter, updateMaterialValidator(), validate, updateMaterial);

router
  .route("/:materialKey/deactivate")
  .patch(
    writeRateLimiter,
    deactivateMaterialValidator(),
    validate,
    deactivateMaterial,
  );

router
  .route("/:materialKey/profiles")
  .post(
    uploadRateLimiter,
    slicerProfileUploadMiddleware,
    uploadSlicerProfileVersionValidator(),
    validate,
    uploadSlicerProfileVersion,
  );

export default router;
