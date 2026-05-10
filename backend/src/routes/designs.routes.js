import express from "express";
import {
  searchDesignLibrary,
  getMmfDesignDetail,
  listLocalDesigns,
  listLocalDesignsForAdmin,
  getLocalDesignDetail,
  getLocalDesignDetailForAdmin,
  createLocalDesign,
  updateLocalDesign,
  deactivateLocalDesign,
  archiveLocalDesign,
  deleteLocalDesign,
  getDesignTaxonomy,
  listDesignOverrides,
  createDesignOverride,
  updateDesignOverride,
  deleteDesignOverride,
  listMyDesigns,
  createMyDesignDraft,
  publishMyDesign,
  moderateLocalDesign,
  updateLocalDesignPrintReady,
  updateMyDesign,
} from "../controllers/designs.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { localDesignUploadMiddleware } from "../middlewares/local-design-upload.middleware.js";
import {
  searchDesignLibraryValidator,
  mmfObjectIdValidator,
  localDesignIdValidator,
  createLocalDesignValidator,
  updateLocalDesignValidator,
  deactivateLocalDesignValidator,
  overrideIdValidator,
  createDesignOverrideValidator,
  updateDesignOverrideValidator,
  createMyDesignValidator,
  moderateLocalDesignValidator,
  updateLocalDesignPrintReadyValidator,
} from "../validators/designs.validator.js";
import {
  authenticatedReadRateLimiter,
  publicReadRateLimiter,
  uploadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router
  .route("/")
  .get(
    publicReadRateLimiter,
    searchDesignLibraryValidator(),
    validate,
    searchDesignLibrary,
  );

router
  .route("/mmf/:objectId")
  .get(
    publicReadRateLimiter,
    mmfObjectIdValidator(),
    validate,
    getMmfDesignDetail,
  );

router.route("/local").get(publicReadRateLimiter, listLocalDesigns);

router.route("/taxonomy").get(publicReadRateLimiter, getDesignTaxonomy);

router
  .route("/admin/local")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyAdmin,
    listLocalDesignsForAdmin,
  );

router
  .route("/admin/local/:designId")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyAdmin,
    localDesignIdValidator(),
    validate,
    getLocalDesignDetailForAdmin,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    localDesignIdValidator(),
    validate,
    deleteLocalDesign,
  );

router
  .route("/admin/local/:designId/moderate")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    moderateLocalDesignValidator(),
    validate,
    moderateLocalDesign,
  );

router
  .route("/admin/local/:designId/print-ready")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    updateLocalDesignPrintReadyValidator(),
    validate,
    updateLocalDesignPrintReady,
  );

router
  .route("/my")
  .get(authenticatedReadRateLimiter, verifyJWT, listMyDesigns)
  .post(
    uploadRateLimiter,
    verifyJWT,
    localDesignUploadMiddleware,
    createMyDesignValidator(),
    validate,
    createMyDesignDraft,
  );

router
  .route("/my/:designId/publish")
  .patch(
    writeRateLimiter,
    verifyJWT,
    localDesignIdValidator(),
    validate,
    publishMyDesign,
  );

router
  .route("/my/:designId")
  .patch(
    uploadRateLimiter,
    verifyJWT,
    localDesignUploadMiddleware,
    updateLocalDesignValidator(),
    validate,
    updateMyDesign,
  );

router
  .route("/local/:designId")
  .get(
    publicReadRateLimiter,
    localDesignIdValidator(),
    validate,
    getLocalDesignDetail,
  )
  .patch(
    uploadRateLimiter,
    verifyJWT,
    verifyAdmin,
    localDesignUploadMiddleware,
    updateLocalDesignValidator(),
    validate,
    updateLocalDesign,
  );

router
  .route("/local")
  .post(
    uploadRateLimiter,
    verifyJWT,
    verifyAdmin,
    localDesignUploadMiddleware,
    createLocalDesignValidator(),
    validate,
    createLocalDesign,
  );

router
  .route("/local/:designId/deactivate")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    deactivateLocalDesignValidator(),
    validate,
    deactivateLocalDesign,
  );

router
  .route("/admin/local/:designId/archive")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    localDesignIdValidator(),
    validate,
    archiveLocalDesign,
  );

router
  .route("/admin/overrides")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyAdmin,
    listDesignOverrides,
  )
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    createDesignOverrideValidator(),
    validate,
    createDesignOverride,
  );

router
  .route("/admin/overrides/:overrideId")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    updateDesignOverrideValidator(),
    validate,
    updateDesignOverride,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyAdmin,
    overrideIdValidator(),
    validate,
    deleteDesignOverride,
  );

export default router;
