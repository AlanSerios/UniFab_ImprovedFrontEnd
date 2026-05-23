import { body, query, param } from "express-validator";
import {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";

const ALLOWED_SORT_VALUES = ["relevance", "visits", "date", "popularity"];
const ALLOWED_ORDER_VALUES = ["asc", "desc"];
const ALLOWED_DESIGN_TAB_VALUES = ["local", "mmf"];
const ALLOWED_LOCAL_SORT_VALUES = [
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "print_ready",
];

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

const categoryIdValidator = () =>
  body("categoryId")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Category ID must be a positive integer");

const categoryNameValidator = () =>
  body("categoryName")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => {
      throw new Error(
        "Category must be selected from the approved Design Library taxonomy",
      );
    });

const tagIdsValidator = () =>
  body("tagIds")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (Array.isArray(value)) {
        return value.every(
          (item) => Number.isInteger(Number(item)) && Number(item) > 0,
        );
      }

      if (typeof value === "string") {
        return value
          .split(",")
          .filter(Boolean)
          .every((item) => Number.isInteger(Number(item)) && Number(item) > 0);
      }

      throw new Error("Tag IDs must be an array or comma-separated list");
    });

const tagNamesValidator = () =>
  body("tagNames")
    .optional({ nullable: true, checkFalsy: true })
    .custom(() => {
      throw new Error(
        "Tags must be selected from the approved Design Library taxonomy",
      );
    });

const optionalIdListValidator = (fieldName, label) =>
  body(fieldName)
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (Array.isArray(value)) {
        return value.every(
          (item) => Number.isInteger(Number(item)) && Number(item) > 0,
        );
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return true;

        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.every(
              (item) => Number.isInteger(Number(item)) && Number(item) > 0,
            );
          }
        } catch {
          // Fall back to comma-separated parsing below.
        }

        return trimmed
          .split(",")
          .filter(Boolean)
          .every((item) => Number.isInteger(Number(item)) && Number(item) > 0);
      }

      throw new Error(`${label} must be an array or comma-separated list`);
    });

const optionalAssetIdValidator = (fieldName, label) =>
  body(fieldName)
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage(`${label} must be a positive integer`);

const searchDesignLibraryValidator = () => {
  return [
    query("tab")
      .optional()
      .isIn(ALLOWED_DESIGN_TAB_VALUES)
      .withMessage("Tab must be either local or mmf"),
    query("q")
      .optional()
      .trim()
      .isString()
      .withMessage("Search query must be a string")
      .bail()
      .isLength({ min: 1, max: 100 })
      .withMessage("Search query must be between 1 and 100 characters"),

    query("page")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("Page can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),

    query("per_page")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("Per page can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isInt({ min: 1, max: 50 })
      .withMessage("Per page must be between 1 and 50"),

    query("sort")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("Sort can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isIn(ALLOWED_SORT_VALUES)
      .withMessage("Sort must be one of: relevance, visits, date, popularity"),

    query("order")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("Order can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isIn(ALLOWED_ORDER_VALUES)
      .withMessage("Order must be either asc or desc"),

    query("category")
      .optional()
      .trim()
      .isLength({ min: 1, max: 120 })
      .withMessage("Category filter must be between 1 and 120 characters"),

    query("tag")
      .optional()
      .trim()
      .isLength({ min: 1, max: 120 })
      .withMessage("Tag filter must be between 1 and 120 characters"),

    query("localPage")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Local page must be a positive integer"),

    query("localLimit")
      .optional()
      .isInt({ min: 1, max: 48 })
      .withMessage("Local limit must be between 1 and 48"),

    query("localSort")
      .optional()
      .isIn(ALLOWED_LOCAL_SORT_VALUES)
      .withMessage(
        "Local sort must be one of: newest, oldest, title_asc, title_desc, print_ready",
      ),

    query("sourceKind")
      .optional()
      .isIn(["lab", "community"])
      .withMessage("sourceKind must be either lab or community"),

    query("printReady")
      .optional()
      .isIn(["true", "false", "1", "0"])
      .withMessage("printReady must be true or false"),

    query("mmfPage")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("MMF page can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isInt({ min: 1 })
      .withMessage("MMF page must be a positive integer"),

    query("mmfPerPage")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("MMF per page can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isInt({ min: 1, max: 50 })
      .withMessage("MMF per page must be between 1 and 50"),

    query("mmfSort")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("MMF sort can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isIn(ALLOWED_SORT_VALUES)
      .withMessage(
        "MMF sort must be one of: relevance, visits, date, popularity",
      ),

    query("mmfOrder")
      .optional()
      .custom((value, { req }) => {
        if (!hasText(req.query.q)) {
          throw new Error("MMF order can only be used when q is provided");
        }
        return true;
      })
      .bail()
      .isIn(ALLOWED_ORDER_VALUES)
      .withMessage("MMF order must be either asc or desc"),
  ];
};

const mmfObjectIdValidator = () => {
  return [
    param("objectId")
      .isInt({ min: 1 })
      .withMessage("Object ID must be a positive integer"),
  ];
};

const localDesignIdValidator = () => {
  return [
    param("designId")
      .isInt({ min: 1 })
      .withMessage("Design ID must be a positive integer"),
  ];
};

const taxonomyCategoryIdValidator = () => {
  return [
    param("categoryId")
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),
  ];
};

const taxonomyTagIdValidator = () => {
  return [
    param("tagId")
      .isInt({ min: 1 })
      .withMessage("Tag ID must be a positive integer"),
  ];
};

const upsertDesignCategoryValidator = () => {
  return [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Category name is required")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Category name must not exceed 100 characters"),
    body("description")
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 500 })
      .withMessage("Category description must not exceed 500 characters"),
    body("isActive")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no", true, false])
      .withMessage("isActive must be a valid boolean"),
  ];
};

const upsertDesignTagValidator = () => {
  return [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Tag name is required")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Tag name must not exceed 100 characters"),
    body("isActive")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no", true, false])
      .withMessage("isActive must be a valid boolean"),
  ];
};

const createLocalDesignValidator = () => {
  return [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .bail()
      .isString()
      .withMessage("Title must be a string")
      .bail()
      .isLength({ min: 1, max: 255 })
      .withMessage("Title must be between 1 and 255 characters"),

    body("description")
      .optional()
      .trim()
      .isString()
      .withMessage("Description must be a string"),

    body("material")
      .optional()
      .trim()
      .isString()
      .withMessage("Material must be a string")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Material must not exceed 100 characters"),

    body("dimensions")
      .optional()
      .trim()
      .isString()
      .withMessage("Dimensions must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("Dimensions must not exceed 255 characters"),

    body("licenseType")
      .optional()
      .trim()
      .isString()
      .withMessage("License type must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("License type must not exceed 255 characters"),

    body("ownershipConfirmed")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("ownershipConfirmed must be a valid boolean"),

    body("policyAcknowledged")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("policyAcknowledged must be a valid boolean"),

    categoryIdValidator(),
    categoryNameValidator(),
    tagIdsValidator(),
    tagNamesValidator(),
  ];
};

const createMyDesignValidator = () => {
  return [
    body("title")
      .optional({ checkFalsy: true })
      .trim()
      .isString()
      .withMessage("Title must be a string")
      .bail()
      .isLength({ min: 1, max: 255 })
      .withMessage("Title must be between 1 and 255 characters"),

    body("description")
      .optional()
      .trim()
      .isString()
      .withMessage("Description must be a string"),

    body("material")
      .optional()
      .trim()
      .isString()
      .withMessage("Material must be a string")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Material must not exceed 100 characters"),

    body("dimensions")
      .optional()
      .trim()
      .isString()
      .withMessage("Dimensions must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("Dimensions must not exceed 255 characters"),

    body("licenseType")
      .optional()
      .trim()
      .isString()
      .withMessage("License type must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("License type must not exceed 255 characters"),

    body("ownershipConfirmed")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("ownershipConfirmed must be a valid boolean"),

    body("policyAcknowledged")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("policyAcknowledged must be a valid boolean"),

    categoryIdValidator(),
    categoryNameValidator(),
    tagIdsValidator(),
    tagNamesValidator(),
  ];
};

const updateLocalDesignValidator = () => {
  return [
    ...localDesignIdValidator(),

    body("title")
      .optional()
      .trim()
      .isString()
      .withMessage("Title must be a string")
      .bail()
      .isLength({ min: 1, max: 255 })
      .withMessage("Title must be between 1 and 255 characters"),

    body("description")
      .optional()
      .trim()
      .isString()
      .withMessage("Description must be a string"),

    body("material")
      .optional()
      .trim()
      .isString()
      .withMessage("Material must be a string")
      .bail()
      .isLength({ max: 100 })
      .withMessage("Material must not exceed 100 characters"),

    body("dimensions")
      .optional()
      .trim()
      .isString()
      .withMessage("Dimensions must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("Dimensions must not exceed 255 characters"),

    body("licenseType")
      .optional()
      .trim()
      .isString()
      .withMessage("License type must be a string")
      .bail()
      .isLength({ max: 255 })
      .withMessage("License type must not exceed 255 characters"),

    categoryIdValidator(),
    categoryNameValidator(),
    tagIdsValidator(),
    tagNamesValidator(),
    optionalIdListValidator("removeFileIds", "Removed file IDs"),
    optionalIdListValidator("removeImageIds", "Removed image IDs"),
    optionalAssetIdValidator("replaceFileId", "Replacement file ID"),
    optionalAssetIdValidator("replaceImageId", "Replacement image ID"),
    optionalAssetIdValidator("primaryFileId", "Primary file ID"),
    optionalAssetIdValidator("primaryImageId", "Primary image ID"),
    optionalIdListValidator("fileOrder", "File order"),
    optionalIdListValidator("imageOrder", "Image order"),

    body("isActive")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isActive must be one of: true, false, 1, 0, yes, no"),

    body().custom((_, { req }) => {
      const hasAnyBodyField =
        Object.prototype.hasOwnProperty.call(req.body, "title") ||
        Object.prototype.hasOwnProperty.call(req.body, "description") ||
        Object.prototype.hasOwnProperty.call(req.body, "material") ||
        Object.prototype.hasOwnProperty.call(req.body, "dimensions") ||
        Object.prototype.hasOwnProperty.call(req.body, "licenseType") ||
        Object.prototype.hasOwnProperty.call(req.body, "ownershipConfirmed") ||
        Object.prototype.hasOwnProperty.call(req.body, "policyAcknowledged") ||
        Object.prototype.hasOwnProperty.call(req.body, "categoryId") ||
        Object.prototype.hasOwnProperty.call(req.body, "tagIds") ||
        Object.prototype.hasOwnProperty.call(req.body, "isActive") ||
        Object.prototype.hasOwnProperty.call(req.body, "removeFileIds") ||
        Object.prototype.hasOwnProperty.call(req.body, "removeImageIds") ||
        Object.prototype.hasOwnProperty.call(req.body, "replaceFileId") ||
        Object.prototype.hasOwnProperty.call(req.body, "replaceImageId") ||
        Object.prototype.hasOwnProperty.call(req.body, "primaryFileId") ||
        Object.prototype.hasOwnProperty.call(req.body, "primaryImageId") ||
        Object.prototype.hasOwnProperty.call(req.body, "fileOrder") ||
        Object.prototype.hasOwnProperty.call(req.body, "imageOrder");

      const hasUploadedDesignFile =
        (Array.isArray(req.files?.[LOCAL_DESIGN_FILE_UPLOAD_FIELD]) &&
          req.files[LOCAL_DESIGN_FILE_UPLOAD_FIELD].length > 0) ||
        (Array.isArray(req.files?.[LOCAL_DESIGN_FILES_UPLOAD_FIELD]) &&
          req.files[LOCAL_DESIGN_FILES_UPLOAD_FIELD].length > 0);

      const hasUploadedThumbnail =
        (Array.isArray(req.files?.[LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD]) &&
          req.files[LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD].length > 0) ||
        (Array.isArray(req.files?.[LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD]) &&
          req.files[LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD].length > 0);

      if (!hasAnyBodyField && !hasUploadedDesignFile && !hasUploadedThumbnail) {
        throw new Error(
          "At least one update is required: metadata field, design file, or thumbnail image",
        );
      }

      return true;
    }),
  ];
};

const deactivateLocalDesignValidator = () => {
  return [...localDesignIdValidator()];
};

const overrideIdValidator = () => {
  return [
    param("overrideId")
      .isInt({ min: 1 })
      .withMessage("Override ID must be a positive integer"),
  ];
};

const createDesignOverrideValidator = () => {
  return [
    body("mmfObjectId")
      .exists()
      .withMessage("mmfObjectId is required")
      .bail()
      .isInt({ min: 1 })
      .withMessage("mmfObjectId must be a positive integer"),

    body("isHidden")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isHidden must be one of: true, false, 1, 0, yes, no"),

    body("isPinned")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isPinned must be one of: true, false, 1, 0, yes, no"),

    body("isPrintReady")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isPrintReady must be one of: true, false, 1, 0, yes, no"),

    body("linkedLocalDesignId")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Linked local design ID must be a positive integer"),

    body("selectedMmfFileId")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selected MMF file ID must be a positive integer"),

    body("selectedArchiveEntryPath")
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isString()
      .withMessage("Selected archive entry path must be a string")
      .bail()
      .isLength({ max: 1000 })
      .withMessage("Selected archive entry path must not exceed 1000 characters"),

    body("clientNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Client note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Client note must not exceed 2000 characters"),

    body("verificationConfirmed")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no", true, false])
      .withMessage(
        "verificationConfirmed must be one of: true, false, 1, 0, yes, no",
      ),

    body("verificationNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Verification note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Verification note must not exceed 2000 characters"),

    body().custom((_, { req }) => {
      const hasMeaningfulOverride =
        ["true", "1", "yes"].includes(
          String(req.body.isHidden ?? "")
            .trim()
            .toLowerCase(),
        ) ||
        ["true", "1", "yes"].includes(
          String(req.body.isPinned ?? "")
            .trim()
            .toLowerCase(),
        ) ||
        ["true", "1", "yes"].includes(
          String(req.body.isPrintReady ?? "")
            .trim()
            .toLowerCase(),
        ) ||
        hasText(req.body.clientNote);

      if (!hasMeaningfulOverride) {
        throw new Error(
          "At least one meaningful override is required: isHidden=true, isPinned=true, isPrintReady=true, or a non-empty clientNote",
        );
      }

      return true;
    }),
  ];
};

const updateDesignOverrideValidator = () => {
  return [
    ...overrideIdValidator(),

    body("isHidden")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isHidden must be one of: true, false, 1, 0, yes, no"),

    body("isPinned")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isPinned must be one of: true, false, 1, 0, yes, no"),

    body("isPrintReady")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isPrintReady must be one of: true, false, 1, 0, yes, no"),

    body("linkedLocalDesignId")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Linked local design ID must be a positive integer"),

    body("selectedMmfFileId")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Selected MMF file ID must be a positive integer"),

    body("selectedArchiveEntryPath")
      .optional({ nullable: true, checkFalsy: true })
      .trim()
      .isString()
      .withMessage("Selected archive entry path must be a string")
      .bail()
      .isLength({ max: 1000 })
      .withMessage("Selected archive entry path must not exceed 1000 characters"),

    body("clientNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Client note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Client note must not exceed 2000 characters"),

    body("verificationConfirmed")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no", true, false])
      .withMessage(
        "verificationConfirmed must be one of: true, false, 1, 0, yes, no",
      ),

    body("verificationNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Verification note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Verification note must not exceed 2000 characters"),

    body().custom((_, { req }) => {
      const hasAnyUpdatableField =
        Object.prototype.hasOwnProperty.call(req.body, "isHidden") ||
        Object.prototype.hasOwnProperty.call(req.body, "isPinned") ||
        Object.prototype.hasOwnProperty.call(req.body, "isPrintReady") ||
        Object.prototype.hasOwnProperty.call(req.body, "linkedLocalDesignId") ||
        Object.prototype.hasOwnProperty.call(req.body, "selectedMmfFileId") ||
        Object.prototype.hasOwnProperty.call(
          req.body,
          "selectedArchiveEntryPath",
        ) ||
        Object.prototype.hasOwnProperty.call(req.body, "clientNote");

      if (!hasAnyUpdatableField) {
        throw new Error(
          "At least one override field must be provided: isHidden, isPinned, isPrintReady, or clientNote",
        );
      }

      return true;
    }),
  ];
};

const moderateLocalDesignValidator = () => {
  return [
    ...localDesignIdValidator(),

    body("action")
      .isIn(["approve", "reject", "hide", "restore", "send_to_review"])
      .withMessage("Invalid moderation action"),

    body("feedback")
      .optional()
      .trim()
      .isString()
      .withMessage("Feedback must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Feedback must not exceed 2000 characters"),
  ];
};

const updateLocalDesignPrintReadyValidator = () => {
  return [
    ...localDesignIdValidator(),

    body("isPrintReady")
      .exists()
      .withMessage("isPrintReady is required")
      .bail()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("isPrintReady must be a valid boolean"),

    body("designFileId")
      .optional({ nullable: true, checkFalsy: true })
      .isInt({ min: 1 })
      .withMessage("Design file ID must be a positive integer"),

    body("verificationConfirmed")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no", true, false])
      .withMessage(
        "verificationConfirmed must be one of: true, false, 1, 0, yes, no",
      ),

    body("verificationNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Verification note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Verification note must not exceed 2000 characters"),
  ];
};

const updateLocalDesignLibraryCurationValidator = () => {
  return [
    ...localDesignIdValidator(),
    body("isFeatured")
      .optional()
      .isBoolean()
      .withMessage("isFeatured must be true or false"),
    body("featuredRank")
      .optional({ nullable: true })
      .isInt({ min: 0, max: 9999 })
      .withMessage("featuredRank must be a number between 0 and 9999"),
    body("libraryNote")
      .optional({ nullable: true })
      .trim()
      .isLength({ max: 1000 })
      .withMessage("libraryNote must be 1000 characters or fewer"),
    body("isLibraryHidden")
      .optional()
      .isBoolean()
      .withMessage("isLibraryHidden must be true or false"),
  ];
};

const recheckLocalDesignValidator = () => {
  return [...localDesignIdValidator()];
};

const listAdminLocalDesignsValidator = () => [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("sourceKind")
    .optional()
    .isIn(["lab", "community"])
    .withMessage("sourceKind must be either lab or community"),
  query("archived")
    .optional()
    .trim()
    .isIn(["true", "false", "1", "0", "yes", "no"])
    .withMessage("Archived must be true or false"),
  query("status")
    .optional()
    .trim()
    .isLength({ max: 240 })
    .withMessage("Status filter is too long"),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Search must not exceed 120 characters"),
  query("printReady")
    .optional()
    .trim()
    .isIn(["true", "false", "1", "0", "yes", "no"])
    .withMessage("printReady must be true or false"),
];

export {
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
};
