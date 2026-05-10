import fs from "fs";
import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import {
  PRINT_REQUEST_SOURCE_TYPES,
  PRINT_REQUEST_STATUSES,
  PRINT_REQUEST_STATUS_TRANSITIONS,
  PRINT_REQUEST_STATUS_LABELS,
  PRINT_REQUEST_TERMS_VERSION,
} from "../constants/print-request.constants.js";
import {
  createPrintRequest,
  createPrintRequestStatusHistory,
  getPrintRequestById,
  getPrintRequestByIdForOwner,
  getPrintRequestStatusHistoryByRequestId,
  getPaginatedPrintRequestsByOwner,
  getPaginatedAllPrintRequests,
  updatePrintRequestStatusById,
  archivePrintRequestById,
  deletePrintRequestById,
} from "../models/print-request.model.js";
import {
  buildPrintRequestModelPublicPath,
  getManagedPrintRequestModelAbsolutePath,
  removeManagedPrintRequestModelFile,
  removeManagedPrintRequestPaymentSlipFile,
} from "../utils/print-request-storage.util.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";
import { findUserById } from "../models/user.model.js";
import { printRequestStatusMailgenContent, sendEmail } from "../utils/mail.js";
import {
  getValidQuoteRecordByToken,
  markQuoteRecordUsed,
} from "../models/quote-record.model.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeOptionalText(value) {
  if (!hasText(value)) {
    return null;
  }

  return String(value).trim();
}

function generateReferenceNumber() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `PR-${year}${month}${day}-${randomPart}`;
}

function normalizePagination(queryPage, queryLimit) {
  const page = Number.parseInt(queryPage, 10);
  const limit = Number.parseInt(queryLimit, 10);

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 20,
  };
}

function parseJsonSafely(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function parseArchivedQuery(value) {
  return ["true", "1", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
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
      `Invalid status transition from ${currentStatus} to ${nextStatus}`,
    );
  }
}

async function sendPrintRequestStatusEmail({ printRequest, note }) {
  const client = await findUserById(printRequest.client_id);

  if (!client?.email) {
    return;
  }

  const username = [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  const statusLabel =
    PRINT_REQUEST_STATUS_LABELS[printRequest.status] || printRequest.status;

  try {
    await sendEmail({
      to: client.email,
      subject: `UniFab Print Request ${printRequest.reference_number} Updated`,
      mailgenContent: printRequestStatusMailgenContent({
        username: username || "UniFab Client",
        referenceNumber: printRequest.reference_number,
        statusLabel,
        note,
      }),
    });
  } catch (error) {
    console.error("Print request status email failed:", error);
  }
}

async function submitPrintRequest({ clientId, user, body, file }) {
  if (!user?.isEmailVerified) {
    throw new ApiError(
      403,
      "Please verify your email before submitting a print request.",
    );
  }

  if (body.termsAccepted !== true && body.termsAccepted !== "true") {
    throw new ApiError(400, "Terms and Conditions must be accepted");
  }

  if (file) {
    const uploadedFileUrl = buildPrintRequestModelPublicPath(file);

    if (uploadedFileUrl) {
      await removeManagedPrintRequestModelFile(uploadedFileUrl);
    }

    throw new ApiError(
      400,
      "Submit a print request with a quote token instead of uploading a model",
    );
  }

  const quoteToken = String(body.quoteToken || "").trim();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const quoteRecord = await getValidQuoteRecordByToken(
      quoteToken,
      connection,
    );

    if (!quoteRecord) {
      throw new ApiError(400, "Quote token is invalid or expired");
    }

    if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.UPLOAD) {
      if (!quoteRecord.file_url) {
        throw new ApiError(500, "Quote is missing its uploaded model file");
      }

      const modelPath = getManagedPrintRequestModelAbsolutePath(
        quoteRecord.file_url,
      );

      if (!modelPath || !fs.existsSync(modelPath)) {
        throw new ApiError(
          410,
          "Quote model file is no longer available. Please calculate a new quote.",
        );
      }
    }

    if (
      [
        PRINT_REQUEST_SOURCE_TYPES.LIBRARY,
        PRINT_REQUEST_SOURCE_TYPES.DESIGN_REQUEST,
        PRINT_REQUEST_SOURCE_TYPES.MMF,
      ].includes(quoteRecord.source_type) &&
      quoteRecord.design_id
    ) {
      const modelPath = getManagedLocalDesignAbsolutePath(
        quoteRecord.file_url,
        "design",
      );

      if (!modelPath || !fs.existsSync(modelPath)) {
        throw new ApiError(
          410,
          "Linked local design file is no longer available. Please calculate a new quote.",
        );
      }
    }

    const quoteSnapshot = parseJsonSafely(quoteRecord.quote_snapshot);
    const designSnapshot = parseJsonSafely(quoteRecord.design_snapshot);

    const printRequest = await createPrintRequest(
      {
        referenceNumber: generateReferenceNumber(),
        clientId,
        sourceType: quoteRecord.source_type,
        designId: quoteRecord.design_id,
        designRequestId: quoteRecord.design_request_id,
        fileUrl: quoteRecord.file_url,
        fileOriginalName: quoteRecord.file_original_name,
        fileMimeType: quoteRecord.file_mime_type,
        fileSize: quoteRecord.file_size,
        designSnapshot,
        quoteToken,
        quoteSnapshot: {
          quoteRecordId: quoteRecord.id,
          sourceType: quoteRecord.source_type,
          material: quoteRecord.material,
          printQuality: quoteRecord.print_quality,
          infill: Number(quoteRecord.infill),
          quantity: Number(quoteRecord.quantity),
          estimatedCost: Number(quoteRecord.estimated_cost),
          quote: quoteSnapshot,
          pricingConfigSnapshot: parseJsonSafely(
            quoteRecord.pricing_config_snapshot,
          ),
          materialSnapshot: parseJsonSafely(quoteRecord.material_snapshot),
          createdAt: quoteRecord.created_at,
          expiresAt: quoteRecord.expires_at,
        },
        material: quoteRecord.material,
        printQuality: quoteRecord.print_quality,
        infill: Number(quoteRecord.infill),
        quantity: Number(quoteRecord.quantity),
        notes: normalizeOptionalText(body.notes),
        estimatedCost: quoteRecord.estimated_cost,
        confirmedCost: null,
        paymentSlipUrl: null,
        receiptUrl: null,
        receiptOriginalName: null,
        receiptMimeType: null,
        receiptSize: null,
        receiptUploadedAt: null,
        termsAcceptedAt: new Date(),
        termsVersion: PRINT_REQUEST_TERMS_VERSION,
        status: PRINT_REQUEST_STATUSES.PENDING_REVIEW,
        rejectionReason: null,
      },
      connection,
    );

    const wasMarkedUsed = await markQuoteRecordUsed(quoteRecord.id, connection);

    if (!wasMarkedUsed) {
      throw new ApiError(400, "Quote token has already been used");
    }

    await createPrintRequestStatusHistory(
      {
        printRequestId: printRequest.id,
        status: PRINT_REQUEST_STATUSES.PENDING_REVIEW,
        changedBy: clientId,
        changedByRole: user?.isAdmin ? "admin" : "client",
        note: "Print request submitted from quote",
      },
      connection,
    );

    await connection.commit();

    const statusHistory = await getPrintRequestStatusHistoryByRequestId(
      printRequest.id,
    );

    return {
      printRequest,
      statusHistory,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listClientPrintRequests({ clientId, query = {} }) {
  const { page, limit } = normalizePagination(query.page, query.limit);

  return getPaginatedPrintRequestsByOwner(clientId, {
    page,
    limit,
    status: normalizeOptionalText(query.status),
  });
}

async function getPrintRequestDetailForUser({ user, requestId }) {
  const printRequest = user?.isAdmin
    ? await getPrintRequestById(requestId)
    : await getPrintRequestByIdForOwner(requestId, user.id);

  if (!printRequest) {
    throw new ApiError(404, "Print request not found");
  }

  const statusHistory = await getPrintRequestStatusHistoryByRequestId(
    printRequest.id,
  );

  return {
    printRequest,
    statusHistory,
  };
}

async function listAdminPrintRequests({ query = {} }) {
  const { page, limit } = normalizePagination(query.page, query.limit);

  return getPaginatedAllPrintRequests({
    page,
    limit,
    status: normalizeOptionalText(query.status),
    sourceType: normalizeOptionalText(query.sourceType),
    archived: parseArchivedQuery(query.archived),
  });
}

async function archiveAdminPrintRequest({ requestId, adminId }) {
  const existingPrintRequest = await getPrintRequestById(requestId);

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (existingPrintRequest.archived_at) {
    throw new ApiError(400, "Print request is already archived");
  }

  if (existingPrintRequest.status !== PRINT_REQUEST_STATUSES.REJECTED) {
    throw new ApiError(400, "Only rejected print requests can be archived");
  }

  const archivedPrintRequest = await archivePrintRequestById(
    requestId,
    adminId,
  );

  if (!archivedPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  const statusHistory = await getPrintRequestStatusHistoryByRequestId(
    archivedPrintRequest.id,
  );

  return {
    printRequest: archivedPrintRequest,
    statusHistory,
  };
}

async function deleteAdminPrintRequest({ requestId }) {
  const existingPrintRequest = await getPrintRequestById(requestId);

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (!existingPrintRequest.archived_at) {
    throw new ApiError(400, "Only archived print requests can be deleted");
  }

  if (existingPrintRequest.status !== PRINT_REQUEST_STATUSES.REJECTED) {
    throw new ApiError(400, "Only rejected print requests can be deleted");
  }

  const deleted = await deletePrintRequestById(requestId);

  if (!deleted) {
    throw new ApiError(404, "Print request not found");
  }

  await Promise.all([
    existingPrintRequest.source_type === PRINT_REQUEST_SOURCE_TYPES.UPLOAD
      ? removeManagedPrintRequestModelFile(existingPrintRequest.file_url)
      : Promise.resolve(false),
    removeManagedPrintRequestPaymentSlipFile(
      existingPrintRequest.payment_slip_url,
    ),
  ]);

  return { deleted: true };
}

async function updateAdminPrintRequestStatus({ requestId, adminId, body }) {
  const existingPrintRequest = await getPrintRequestById(requestId);

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (existingPrintRequest.archived_at) {
    throw new ApiError(400, "Archived print requests cannot be updated");
  }

  const nextStatus = String(body.status).trim();

  assertValidStatusTransition(existingPrintRequest.status, nextStatus);

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

  const parsedConfirmedCost = normalizeOptionalMoney(
    body.confirmedCost,
    "Confirmed cost",
  );

  const nextConfirmedCost =
    parsedConfirmedCost !== undefined
      ? parsedConfirmedCost
      : existingPrintRequest.confirmed_cost;

  if (nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_SLIP_ISSUED && nextConfirmedCost == null) {
    throw new ApiError(
      400,
      "Confirmed cost must be provided when issuing a payment slip.",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedPrintRequest = await updatePrintRequestStatusById(
      requestId,
      {
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        confirmedCost: nextConfirmedCost,
        paymentSlipUrl: existingPrintRequest.payment_slip_url,
      },
      connection,
    );

    await createPrintRequestStatusHistory(
      {
        printRequestId: requestId,
        status: nextStatus,
        changedBy: adminId,
        changedByRole: "admin",
        note:
          normalizeOptionalText(body.note) ||
          `Status updated from ${existingPrintRequest.status} to ${nextStatus}`,
      },
      connection,
    );

    await connection.commit();

    const statusHistory = await getPrintRequestStatusHistoryByRequestId(
      updatedPrintRequest.id,
    );

    await sendPrintRequestStatusEmail({
      printRequest: updatedPrintRequest,
      note:
        normalizeOptionalText(body.note) ||
        normalizeOptionalText(body.rejectionReason) ||
        null,
    });

    return {
      printRequest: updatedPrintRequest,
      statusHistory,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function undoAdminPrintRequestStatus({ requestId, adminId }) {
  const existingPrintRequest = await getPrintRequestById(requestId);

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (existingPrintRequest.archived_at) {
    throw new ApiError(400, "Archived print requests cannot be updated");
  }

  const statusHistory = await getPrintRequestStatusHistoryByRequestId(requestId);

  if (statusHistory.length < 2) {
    throw new ApiError(400, "Cannot undo: No previous status found.");
  }

  // getPrintRequestStatusHistoryByRequestId returns history ordered by created_at ASC
  // So the last entry is the current one, and the second to last is the one we want to revert to.
  const currentEntry = statusHistory[statusHistory.length - 1];
  const previousEntry = statusHistory[statusHistory.length - 2];

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedPrintRequest = await updatePrintRequestStatusById(
      requestId,
      {
        status: previousEntry.status,
        rejectionReason: null,
        confirmedCost: existingPrintRequest.confirmed_cost,
        paymentSlipUrl: existingPrintRequest.payment_slip_url,
      },
      connection,
    );

    await createPrintRequestStatusHistory(
      {
        printRequestId: requestId,
        status: previousEntry.status,
        changedBy: adminId,
        changedByRole: "admin",
        note: `Status change undone: Reverted from ${currentEntry.status} to ${previousEntry.status}`,
      },
      connection,
    );

    await connection.commit();

    const newStatusHistory = await getPrintRequestStatusHistoryByRequestId(
      updatedPrintRequest.id,
    );

    return {
      printRequest: updatedPrintRequest,
      statusHistory: newStatusHistory,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export {
  submitPrintRequest,
  listClientPrintRequests,
  getPrintRequestDetailForUser,
  listAdminPrintRequests,
  updateAdminPrintRequestStatus,
  archiveAdminPrintRequest,
  deleteAdminPrintRequest,
  undoAdminPrintRequestStatus,
};
