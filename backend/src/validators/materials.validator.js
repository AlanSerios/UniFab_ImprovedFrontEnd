import { body, param } from "express-validator";

const ALLOWED_QUALITIES = ["draft", "standard", "fine"];

const materialKeyParamValidator = () => {
  return [
    param("materialKey")
      .trim()
      .notEmpty()
      .withMessage("Material key is required")
      .bail()
      .isString()
      .withMessage("Material key must be a string")
      .bail()
      .isLength({ min: 1, max: 50 })
      .withMessage("Material key must be between 1 and 50 characters"),
  ];
};

const createMaterialValidator = () => {
  return [
    body("materialKey")
      .trim()
      .notEmpty()
      .withMessage("Material key is required")
      .bail()
      .isString()
      .withMessage("Material key must be a string")
      .bail()
      .isLength({ min: 1, max: 50 })
      .withMessage("Material key must be between 1 and 50 characters"),

    body("displayName")
      .optional()
      .trim()
      .isString()
      .withMessage("Display name must be a string")
      .bail()
      .isLength({ min: 1, max: 100 })
      .withMessage("Display name must be between 1 and 100 characters"),

    body("materialCostPerGram")
      .exists()
      .withMessage("Material cost per gram is required")
      .bail()
      .isFloat({ min: 0 })
      .withMessage("Material cost per gram must be a non-negative number"),

    body("isActiveMaterial")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage(
        "isActiveMaterial must be one of: true, false, 1, 0, yes, no",
      ),

    body("colorOptions")
      .optional()
      .custom((value) => Array.isArray(value) || typeof value === "string")
      .withMessage("Color options must be an array or comma-separated string"),
  ];
};

const updateMaterialValidator = () => {
  return [
    ...materialKeyParamValidator(),

    body("displayName")
      .optional()
      .trim()
      .isString()
      .withMessage("Display name must be a string")
      .bail()
      .isLength({ min: 1, max: 100 })
      .withMessage("Display name must be between 1 and 100 characters"),

    body("materialCostPerGram")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Material cost per gram must be a non-negative number"),

    body("isActiveMaterial")
      .optional()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage(
        "isActiveMaterial must be one of: true, false, 1, 0, yes, no",
      ),

    body("colorOptions")
      .optional()
      .custom((value) => Array.isArray(value) || typeof value === "string")
      .withMessage("Color options must be an array or comma-separated string"),
  ];
};

const deactivateMaterialValidator = () => {
  return [...materialKeyParamValidator()];
};

const uploadSlicerProfileVersionValidator = () => {
  return [
    ...materialKeyParamValidator(),

    body("quality")
      .trim()
      .notEmpty()
      .withMessage("Quality is required")
      .bail()
      .isString()
      .withMessage("Quality must be a string")
      .bail()
      .isIn(ALLOWED_QUALITIES)
      .withMessage("Quality must be one of: draft, standard, fine"),

    body("printerName")
      .optional()
      .trim()
      .isString()
      .withMessage("Printer name must be a string")
      .bail()
      .isLength({ min: 1, max: 100 })
      .withMessage("Printer name must be between 1 and 100 characters"),

    body("nozzle")
      .optional()
      .trim()
      .isString()
      .withMessage("Nozzle must be a string")
      .bail()
      .isLength({ min: 1, max: 20 })
      .withMessage("Nozzle must be between 1 and 20 characters"),

    body("supportRule")
      .optional()
      .trim()
      .isString()
      .withMessage("Support rule must be a string")
      .bail()
      .isLength({ min: 1, max: 30 })
      .withMessage("Support rule must be between 1 and 30 characters"),

    body("orientationRule")
      .optional()
      .trim()
      .isString()
      .withMessage("Orientation rule must be a string")
      .bail()
      .isLength({ min: 1, max: 30 })
      .withMessage("Orientation rule must be between 1 and 30 characters"),
  ];
};

export {
  createMaterialValidator,
  updateMaterialValidator,
  deactivateMaterialValidator,
  uploadSlicerProfileVersionValidator,
};
