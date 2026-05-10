import { body, query, param } from "express-validator";
import {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";

const ALLOWED_SORT_VALUES = ["visits", "date", "popularity"];
const ALLOWED_ORDER_VALUES = ["asc", "desc"];

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

const searchDesignLibraryValidator = () => {
  return [
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
      .withMessage("Sort must be one of: visits, date, popularity"),

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

    body("categoryId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),

    body("categoryName")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Category name must be between 1 and 100 characters"),

    body("tagIds")
      .optional()
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
            .every(
              (item) => Number.isInteger(Number(item)) && Number(item) > 0,
            );
        }

        throw new Error("Tag IDs must be an array or comma-separated list");
      }),

    body("tagNames")
      .optional()
      .custom((value) => {
        const tagNames = Array.isArray(value)
          ? value
          : String(value)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);

        return tagNames.every((item) => item.length >= 1 && item.length <= 100);
      })
      .withMessage("Each tag name must be between 1 and 100 characters"),
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

    body("categoryId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),

    body("categoryName")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Category name must be between 1 and 100 characters"),

    body("tagIds")
      .optional()
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
            .every(
              (item) => Number.isInteger(Number(item)) && Number(item) > 0,
            );
        }

        throw new Error("Tag IDs must be an array or comma-separated list");
      }),

    body("tagNames")
      .optional()
      .custom((value) => {
        const tagNames = Array.isArray(value)
          ? value
          : String(value)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);

        return tagNames.every((item) => item.length >= 1 && item.length <= 100);
      })
      .withMessage("Each tag name must be between 1 and 100 characters"),
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

    body("categoryId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Category ID must be a positive integer"),

    body("categoryName")
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Category name must be between 1 and 100 characters"),

    body("tagIds")
      .optional()
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
            .every(
              (item) => Number.isInteger(Number(item)) && Number(item) > 0,
            );
        }

        throw new Error("Tag IDs must be an array or comma-separated list");
      }),

    body("tagNames")
      .optional()
      .custom((value) => {
        const tagNames = Array.isArray(value)
          ? value
          : String(value)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);

        return tagNames.every((item) => item.length >= 1 && item.length <= 100);
      })
      .withMessage("Each tag name must be between 1 and 100 characters"),

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
        Object.prototype.hasOwnProperty.call(req.body, "categoryId") ||
        Object.prototype.hasOwnProperty.call(req.body, "categoryName") ||
        Object.prototype.hasOwnProperty.call(req.body, "tagIds") ||
        Object.prototype.hasOwnProperty.call(req.body, "tagNames") ||
        Object.prototype.hasOwnProperty.call(req.body, "isActive");

      const hasUploadedDesignFile =
        Array.isArray(req.files?.[LOCAL_DESIGN_FILE_UPLOAD_FIELD]) &&
        req.files[LOCAL_DESIGN_FILE_UPLOAD_FIELD].length > 0;

      const hasUploadedThumbnail =
        Array.isArray(req.files?.[LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD]) &&
        req.files[LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD].length > 0;

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

    body("clientNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Client note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Client note must not exceed 2000 characters"),

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

    body("clientNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Client note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Client note must not exceed 2000 characters"),

    body().custom((_, { req }) => {
      const hasAnyUpdatableField =
        Object.prototype.hasOwnProperty.call(req.body, "isHidden") ||
        Object.prototype.hasOwnProperty.call(req.body, "isPinned") ||
        Object.prototype.hasOwnProperty.call(req.body, "isPrintReady") ||
        Object.prototype.hasOwnProperty.call(req.body, "linkedLocalDesignId") ||
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
  ];
};

export {
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
};
