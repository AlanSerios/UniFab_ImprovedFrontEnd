import { body, param, query } from "express-validator";
import {
  PRINT_REQUEST_SOURCE_TYPE_VALUES,
  PRINT_REQUEST_STATUS_VALUES,
  MAX_PRINT_REQUEST_NOTES_LENGTH,
} from "../constants/print-request.constants.js";

const ACTIVE_PRINT_REQUEST_STATUS_VALUES = PRINT_REQUEST_STATUS_VALUES;
const ACTIVE_PRINT_REQUEST_STATUS_MESSAGE =
  "Status must be one of: pending_review, design_in_progress, approved, payment_slip_issued, payment_verified, printing, completed, rejected, cancelled";

function hasOwnField(req, fieldName) {
  return Object.prototype.hasOwnProperty.call(req.body, fieldName);
}

function rejectForbiddenClientFields(req) {
  const forbiddenFields = [
    "id",
    "clientId",
    "referenceNumber",
    "fileUrl",
    "fileOriginalName",
    "fileMimeType",
    "fileSize",
    "designSnapshot",
    "estimatedCost",
    "confirmedCost",
    "paymentSlipUrl",
    "receiptUrl",
    "receiptUploadedAt",
    "status",
    "rejectionReason",
    "createdAt",
    "updatedAt",
  ];

  for (const field of forbiddenFields) {
    if (hasOwnField(req, field)) {
      throw new Error(
        `${field} is managed by the server and cannot be submitted`,
      );
    }
  }
}

const submitPrintRequestValidator = ({ allowCartItemIds = true } = {}) => {
  return [
    body("notes")
      .optional()
      .trim()
      .isString()
      .withMessage("Notes must be a string")
      .bail()
      .isLength({ max: MAX_PRINT_REQUEST_NOTES_LENGTH })
      .withMessage(
        `Notes must not exceed ${MAX_PRINT_REQUEST_NOTES_LENGTH} characters`,
      ),

    body("termsAccepted")
      .exists()
      .withMessage("Terms and Conditions acceptance is required")
      .bail()
      .custom((value) => value === true || value === "true")
      .withMessage("Terms and Conditions must be accepted"),

    body("requestorName")
      .optional()
      .trim()
      .isLength({ max: 160 })
      .withMessage("Requestor name must not exceed 160 characters"),

    body("contactNumber")
      .optional()
      .trim()
      .isLength({ max: 60 })
      .withMessage("Contact number must not exceed 60 characters"),

    body("collegeDepartment")
      .optional()
      .trim()
      .isLength({ max: 160 })
      .withMessage("College/department must not exceed 160 characters"),

    body("purpose")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Purpose/use case must not exceed 1000 characters"),

    body("cartItemIds")
      .optional()
      .isArray({ min: 1, max: 50 })
      .withMessage("Cart item selection must be a non-empty array"),

    body("cartItemIds.*")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Cart item ID must be a positive integer"),

    body().custom((_, { req }) => {
      rejectForbiddenClientFields(req);

      if (req.file) {
        throw new Error(
          "Model file is not allowed when submitting from a quote token",
        );
      }

      const allowedFields = new Set([
        "notes",
        "termsAccepted",
        "requestorName",
        "contactNumber",
        "collegeDepartment",
        "purpose",
      ]);

      if (allowCartItemIds) {
        allowedFields.add("cartItemIds");
      }

      for (const field of Object.keys(req.body)) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for quote submission`);
        }
      }

      return true;
    }),
  ];
};

const requestDraftTokenValidator = () => {
  return [
    param("draftToken")
      .trim()
      .isLength({ min: 64, max: 64 })
      .withMessage("Request draft token is invalid")
      .bail()
      .isHexadecimal()
      .withMessage("Request draft token is invalid"),
  ];
};

const createRequestDraftValidator = () => {
  return [
    body("cartItemIds")
      .optional()
      .isArray({ min: 1, max: 50 })
      .withMessage("Cart item selection must be a non-empty array"),

    body("cartItemIds.*")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Cart item ID must be a positive integer"),

    body().custom((_, { req }) => {
      const allowedFields = new Set(["cartItemIds"]);

      for (const field of Object.keys(req.body || {})) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for request drafts`);
        }
      }

      return true;
    }),
  ];
};

const previewRequestDraftValidator = () => requestDraftTokenValidator();

const submitRequestDraftValidator = () => [
  ...requestDraftTokenValidator(),
  ...submitPrintRequestValidator({ allowCartItemIds: false }),
];

const previewPrintRequestSubmissionValidator = () => {
  return [
    body("cartItemIds")
      .optional()
      .isArray({ min: 1, max: 50 })
      .withMessage("Cart item selection must be a non-empty array"),

    body("cartItemIds.*")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Cart item ID must be a positive integer"),

    body().custom((_, { req }) => {
      const allowedFields = new Set(["cartItemIds"]);

      for (const field of Object.keys(req.body || {})) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for submission preview`);
        }
      }

      return true;
    }),
  ];
};

const printRequestIdValidator = () => {
  return [
    param("requestId")
      .isInt({ min: 1 })
      .withMessage("Print request ID must be a positive integer"),
  ];
};

const listMyPrintRequestsQueryValidator = () => {
  return [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),

    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),

    query("status")
      .optional()
      .trim()
      .isIn(ACTIVE_PRINT_REQUEST_STATUS_VALUES)
      .withMessage(ACTIVE_PRINT_REQUEST_STATUS_MESSAGE),
  ];
};

const listAllPrintRequestsQueryValidator = () => {
  return [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),

    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),

    query("status")
      .optional()
      .trim()
      .isIn(ACTIVE_PRINT_REQUEST_STATUS_VALUES)
      .withMessage(ACTIVE_PRINT_REQUEST_STATUS_MESSAGE),

    query("sourceType")
      .optional()
      .trim()
      .isIn(PRINT_REQUEST_SOURCE_TYPE_VALUES)
      .withMessage("Source type must be one of: upload, library, mmf"),

    query("archived")
      .optional()
      .trim()
      .isIn(["true", "false", "1", "0", "yes", "no"])
      .withMessage("Archived must be true or false"),

    query("search")
      .optional()
      .trim()
      .isLength({ max: 120 })
      .withMessage("Search must not exceed 120 characters"),
  ];
};

const updatePrintRequestStatusValidator = () => {
  return [
    ...printRequestIdValidator(),

    body("status")
      .trim()
      .notEmpty()
      .withMessage("Status is required")
      .bail()
      .isIn(ACTIVE_PRINT_REQUEST_STATUS_VALUES)
      .withMessage(ACTIVE_PRINT_REQUEST_STATUS_MESSAGE),

    body("rejectionReason")
      .optional()
      .trim()
      .isString()
      .withMessage("Rejection reason must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Rejection reason must not exceed 2000 characters"),

    body("confirmedCost")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Confirmed cost must be a non-negative number"),

    body("items")
      .optional()
      .isArray({ min: 1 })
      .withMessage("Items must be an array"),

    body("items.*.itemId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Item ID must be a positive integer"),

    body("items.*.confirmedCost")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Item confirmed cost must be a non-negative number"),

    body("note")
      .optional()
      .trim()
      .isString()
      .withMessage("Note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Note must not exceed 2000 characters"),

    body("receiptReferenceNumber")
      .optional()
      .trim()
      .isString()
      .withMessage("Receipt/reference number must be a string")
      .bail()
      .isLength({ max: 120 })
      .withMessage("Receipt/reference number must not exceed 120 characters"),

    body("receiptVerificationNote")
      .optional()
      .trim()
      .isString()
      .withMessage("Receipt verification note must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Receipt verification note must not exceed 2000 characters"),

    body().custom((_, { req }) => {
      const allowedFields = new Set([
        "status",
        "rejectionReason",
        "confirmedCost",
        "items",
        "note",
        "receiptReferenceNumber",
        "receiptVerificationNote",
      ]);

      for (const field of Object.keys(req.body)) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for status updates`);
        }
      }

      return true;
    }),
  ];
};

const printRequestItemModelValidator = () => {
  return [
    ...printRequestIdValidator(),
    param("itemId")
      .isInt({ min: 1 })
      .withMessage("Print request item ID must be a positive integer"),
  ];
};

const cancelPrintRequestValidator = () => {
  return [
    ...printRequestIdValidator(),

    body("cancellationReason")
      .trim()
      .notEmpty()
      .withMessage("Cancellation reason is required")
      .bail()
      .isLength({ max: 1000 })
      .withMessage("Cancellation reason must not exceed 1000 characters"),
  ];
};

const correctPrintRequestStatusValidator = () => {
  return [
    ...printRequestIdValidator(),

    body("correctionReason")
      .trim()
      .notEmpty()
      .withMessage("Correction reason is required")
      .bail()
      .isString()
      .withMessage("Correction reason must be a string")
      .bail()
      .isLength({ max: 2000 })
      .withMessage("Correction reason must not exceed 2000 characters"),

    body().custom((_, { req }) => {
      const allowedFields = new Set(["correctionReason"]);

      for (const field of Object.keys(req.body)) {
        if (!allowedFields.has(field)) {
          throw new Error(`${field} is not allowed for status corrections`);
        }
      }

      return true;
    }),
  ];
};

export {
  createRequestDraftValidator,
  previewRequestDraftValidator,
  previewPrintRequestSubmissionValidator,
  submitRequestDraftValidator,
  submitPrintRequestValidator,
  printRequestIdValidator,
  listMyPrintRequestsQueryValidator,
  listAllPrintRequestsQueryValidator,
  updatePrintRequestStatusValidator,
  correctPrintRequestStatusValidator,
  cancelPrintRequestValidator,
  printRequestItemModelValidator,
};
