import { ApiError } from "./api-error.js";
import {
  PRINT_REQUEST_STATUSES,
  PRINT_REQUEST_STATUS_TRANSITIONS,
} from "../constants/print-request.constants.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function normalizeOptionalMoney(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new ApiError(400, `${fieldName} must be a non-negative number`);
  }

  return parsedValue;
}

function assertValidStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    throw new ApiError(400, "Request is already in the selected status");
  }

  const allowedNextStatuses =
    PRINT_REQUEST_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    throw new ApiError(
      400,
      `Cannot change status from ${currentStatus} to ${nextStatus}`,
    );
  }
}

function buildStatusHistoryNote({ fallback, note }) {
  return normalizeOptionalText(note) || fallback;
}

function parseItemConfirmedCosts(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        itemId: Number(item.itemId),
        confirmedCost: normalizeOptionalMoney(
          item.confirmedCost,
          "Item confirmed cost",
        ),
      }))
    : [];
}

function resolveNextConfirmedCost({ body, itemCosts }) {
  const parsedConfirmedCost = normalizeOptionalMoney(
    body.confirmedCost,
    "Confirmed cost",
  );

  return itemCosts.length > 0
    ? itemCosts.reduce((sum, item) => sum + Number(item.confirmedCost), 0)
    : parsedConfirmedCost;
}

function resolveRejectionReason({
  nextStatus,
  body,
  existingPrintRequest,
}) {
  const nextRejectionReason =
    nextStatus === PRINT_REQUEST_STATUSES.REJECTED
      ? normalizeOptionalText(body.rejectionReason)
      : existingPrintRequest.rejection_reason;

  if (nextStatus === PRINT_REQUEST_STATUSES.REJECTED && !nextRejectionReason) {
    throw new ApiError(
      400,
      "Rejection reason is required when rejecting a request",
    );
  }

  return nextRejectionReason;
}

function resolveReceiptVerificationFields({
  nextStatus,
  body,
  existingPrintRequest,
}) {
  const receiptReferenceNumber =
    nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED
      ? normalizeOptionalText(body.receiptReferenceNumber)
      : existingPrintRequest.receipt_reference_number;

  if (
    nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED &&
    !receiptReferenceNumber
  ) {
    throw new ApiError(
      400,
      "Receipt/reference number is required when verifying payment.",
    );
  }

  const receiptVerificationNote =
    nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED
      ? normalizeOptionalText(body.receiptVerificationNote)
      : existingPrintRequest.receipt_verification_note;

  if (
    nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED &&
    !receiptVerificationNote
  ) {
    throw new ApiError(
      400,
      "Verification note is required when verifying payment.",
    );
  }

  return {
    receiptReferenceNumber,
    receiptVerificationNote,
  };
}

function assertPaymentSlipConfirmedCost({ nextStatus, nextConfirmedCost }) {
  if (
    nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_SLIP_ISSUED &&
    nextConfirmedCost == null
  ) {
    throw new ApiError(
      400,
      "Confirmed cost must be provided when issuing a payment slip.",
    );
  }
}

function buildStatusUpdatePayload({
  nextStatus,
  adminId,
  existingPrintRequest,
  nextRejectionReason,
  nextConfirmedCost,
  paymentSlip,
  receiptReferenceNumber,
  receiptVerificationNote,
}) {
  return {
    status: nextStatus,
    rejectionReason: nextRejectionReason,
    confirmedCost: nextConfirmedCost,
    paymentSlipUrl: paymentSlip.url,
    paymentSlipFileObjectId: paymentSlip.fileObjectId,
    paymentSlipGeneratedAt: paymentSlip.generatedAt,
    paymentSlipGeneratedBy: paymentSlip.generatedBy,
    receiptReferenceNumber,
    receiptVerifiedAt:
      nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED
        ? new Date()
        : existingPrintRequest.receipt_verified_at,
    receiptVerifiedBy:
      nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_VERIFIED
        ? adminId
        : existingPrintRequest.receipt_verified_by,
    receiptVerificationNote,
  };
}

function buildInitialPaymentSlipState(existingPrintRequest) {
  return {
    url: existingPrintRequest.payment_slip_url,
    fileObjectId: existingPrintRequest.payment_slip_file_object_id,
    generatedAt: existingPrintRequest.payment_slip_generated_at,
    generatedBy: existingPrintRequest.payment_slip_generated_by,
  };
}

export {
  assertPaymentSlipConfirmedCost,
  assertValidStatusTransition,
  buildInitialPaymentSlipState,
  buildStatusHistoryNote,
  buildStatusUpdatePayload,
  normalizeOptionalText,
  parseItemConfirmedCosts,
  resolveNextConfirmedCost,
  resolveReceiptVerificationFields,
  resolveRejectionReason,
};
