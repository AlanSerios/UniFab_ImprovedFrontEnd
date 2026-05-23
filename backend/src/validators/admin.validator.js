import { body, param, query } from "express-validator";

const listAdminUsersValidator = () => [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Search must not exceed 120 characters"),
  query("role")
    .optional()
    .isIn(["admin", "client"])
    .withMessage("Role must be admin or client"),
  query("verified")
    .optional()
    .isIn(["true", "false"])
    .withMessage("Verified must be true or false"),
];

const updateAdminUserValidator = () => [
  param("userId")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer"),
  body("isAdmin")
    .optional()
    .custom(isBooleanLike)
    .withMessage("isAdmin must be a valid boolean"),
  body("isEmailVerified")
    .optional()
    .custom(isBooleanLike)
    .withMessage("isEmailVerified must be a valid boolean"),
  body().custom((_, { req }) => {
    const allowedFields = new Set(["isAdmin", "isEmailVerified"]);

    for (const field of Object.keys(req.body || {})) {
      if (!allowedFields.has(field)) {
        throw new Error(`${field} is not allowed for admin user updates`);
      }
    }

    return true;
  }),
];

function isBooleanLike(value) {
  if (typeof value === "boolean") return true;
  return ["true", "false", "1", "0", "yes", "no"].includes(
    String(value).trim().toLowerCase(),
  );
}

const listAdminAuditValidator = () => [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("entityType")
    .optional()
    .trim()
    .isLength({ max: 80 })
    .withMessage("Entity type must not exceed 80 characters"),
  query("actorId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Actor ID must be a positive integer"),
];

const updateContentValidator = () => [
  param("contentKey")
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage("Content key must be between 1 and 80 characters")
    .bail()
    .matches(/^[a-z0-9_-]+$/)
    .withMessage("Content key can only contain lowercase letters, numbers, underscores, and hyphens"),
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .bail()
    .isLength({ max: 160 })
    .withMessage("Title must not exceed 160 characters"),
  body("body")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("Body must not exceed 10000 characters"),
  body("metadata")
    .optional()
    .isObject()
    .withMessage("Metadata must be an object"),
];

export {
  listAdminAuditValidator,
  listAdminUsersValidator,
  updateAdminUserValidator,
  updateContentValidator,
};
