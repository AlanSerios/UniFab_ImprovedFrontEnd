import express from "express";
import {
  searchDesignLibrary,
  getMmfDesignDetail,
  listLocalDesigns,
  getDesignTaxonomyForAdmin,
  createDesignCategoryForAdmin,
  updateDesignCategoryForAdmin,
  createDesignTagForAdmin,
  updateDesignTagForAdmin,
  listLocalDesignsForAdmin,
  updateLocalDesignLibraryCurationSettings,
  getLocalDesignDetail,
  getLocalDesignDetailForAdmin,
  listSavedDesigns,
  saveLocalDesign,
  unsaveLocalDesign,
  createLocalDesign,
  updateLocalDesign,
  deactivateLocalDesign,
  archiveLocalDesign,
  deleteLocalDesign,
  getDesignTaxonomy,
  listDesignOverrides,
  getMmfOAuthConnectionStatus,
  startMmfOAuthConnection,
  handleMmfOAuthCallback,
  disconnectMmfOAuthConnection,
  inspectMmfDesignFiles,
  removeMmfPrintReadyFile,
  createDesignOverride,
  updateDesignOverride,
  deleteDesignOverride,
  listMyDesigns,
  createMyDesignDraft,
  publishMyDesign,
  moderateLocalDesign,
  recheckLocalDesignModeration,
  updateLocalDesignPrintReady,
  updateMyDesign,
  deleteMyDesign,
} from "../controllers/designs.controller.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  optionalVerifyJWT,
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { localDesignUploadMiddleware } from "../middlewares/local-design-upload.middleware.js";
import {
  searchDesignLibraryValidator,
  listAdminLocalDesignsValidator,
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
  recheckLocalDesignValidator,
  updateLocalDesignPrintReadyValidator,
  updateLocalDesignLibraryCurationValidator,
  taxonomyCategoryIdValidator,
  taxonomyTagIdValidator,
  upsertDesignCategoryValidator,
  upsertDesignTagValidator,
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
  .route("/admin/taxonomy")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    getDesignTaxonomyForAdmin,
  );

router
  .route("/admin/taxonomy/categories")
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    upsertDesignCategoryValidator(),
    validate,
    createDesignCategoryForAdmin,
  );

router
  .route("/admin/taxonomy/categories/:categoryId")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    taxonomyCategoryIdValidator(),
    upsertDesignCategoryValidator(),
    validate,
    updateDesignCategoryForAdmin,
  );

router
  .route("/admin/taxonomy/tags")
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    upsertDesignTagValidator(),
    validate,
    createDesignTagForAdmin,
  );

router
  .route("/admin/taxonomy/tags/:tagId")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    taxonomyTagIdValidator(),
    upsertDesignTagValidator(),
    validate,
    updateDesignTagForAdmin,
  );

router
  .route("/saved")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    listSavedDesigns,
  );

router
  .route("/:designId/save")
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    localDesignIdValidator(),
    validate,
    saveLocalDesign,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    localDesignIdValidator(),
    validate,
    unsaveLocalDesign,
  );

router
  .route("/admin/local")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    listAdminLocalDesignsValidator(),
    validate,
    listLocalDesignsForAdmin,
  );

router
  .route("/admin/local/:designId")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    localDesignIdValidator(),
    validate,
    getLocalDesignDetailForAdmin,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
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
    verifyEmailVerified,
    verifyAdmin,
    moderateLocalDesignValidator(),
    validate,
    moderateLocalDesign,
  );

router
  .route("/admin/local/:designId/recheck")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    recheckLocalDesignValidator(),
    validate,
    recheckLocalDesignModeration,
  );

router
  .route("/admin/local/:designId/print-ready")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    updateLocalDesignPrintReadyValidator(),
    validate,
    updateLocalDesignPrintReady,
  );

router
  .route("/admin/local/:designId/library-curation")
  .patch(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    updateLocalDesignLibraryCurationValidator(),
    validate,
    updateLocalDesignLibraryCurationSettings,
  );

router
  .route("/my")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    listMyDesigns,
  )
  .post(
    uploadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
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
    verifyEmailVerified,
    localDesignIdValidator(),
    validate,
    publishMyDesign,
  );

router
  .route("/my/:designId")
  .patch(
    uploadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    localDesignUploadMiddleware,
    updateLocalDesignValidator(),
    validate,
    updateMyDesign,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    localDesignIdValidator(),
    validate,
    deleteMyDesign,
  );

router
  .route("/local/:designId")
  .get(
    publicReadRateLimiter,
    optionalVerifyJWT,
    localDesignIdValidator(),
    validate,
    getLocalDesignDetail,
  )
  .patch(
    uploadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
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
    verifyEmailVerified,
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
    verifyEmailVerified,
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
    verifyEmailVerified,
    verifyAdmin,
    localDesignIdValidator(),
    validate,
    archiveLocalDesign,
  );

router
  .route("/admin/mmf/oauth/status")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    getMmfOAuthConnectionStatus,
  );

router
  .route("/admin/mmf/oauth/start")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    startMmfOAuthConnection,
  );

router.route("/admin/mmf/oauth/callback").get(handleMmfOAuthCallback);

router
  .route("/admin/mmf/oauth/disconnect")
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    disconnectMmfOAuthConnection,
  );

router
  .route("/admin/mmf/:objectId/files")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    mmfObjectIdValidator(),
    validate,
    inspectMmfDesignFiles,
  );

router
  .route("/admin/mmf/:objectId/print-ready-file")
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    mmfObjectIdValidator(),
    validate,
    removeMmfPrintReadyFile,
  );

router
  .route("/admin/overrides")
  .get(
    authenticatedReadRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    listDesignOverrides,
  )
  .post(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
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
    verifyEmailVerified,
    verifyAdmin,
    updateDesignOverrideValidator(),
    validate,
    updateDesignOverride,
  )
  .delete(
    writeRateLimiter,
    verifyJWT,
    verifyEmailVerified,
    verifyAdmin,
    overrideIdValidator(),
    validate,
    deleteDesignOverride,
  );

export default router;
