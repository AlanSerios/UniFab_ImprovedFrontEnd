import fs from "fs";
import path from "path";
import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import {
  PRINT_REQUEST_SOURCE_TYPES,
  PRINT_REQUEST_STATUSES,
  PRINT_REQUEST_STATUS_TRANSITIONS,
  PRINT_REQUEST_STATUS_LABELS,
} from "../constants/print-request.constants.js";
import {
  createPrintRequest,
  createPrintRequestEvent,
  createPrintRequestStatusHistory,
  getPrintRequestById,
  getPrintRequestByIdForOwner,
  getPrintRequestEventsByRequestId,
  getPrintRequestStatusHistoryByRequestId,
  getLatestReversiblePrintRequestEvent,
  getPaginatedPrintRequestsByOwner,
  getPaginatedAllPrintRequests,
  markPrintRequestEventReverted,
  restorePrintRequestStateById,
  updatePrintRequestStatusById,
  archivePrintRequestById,
  deletePrintRequestById,
} from "../models/print-request.model.js";
import {
  createPrintRequestItem,
  getPrintRequestItemForRequest,
  getPrintRequestItemsByRequestId,
  updatePrintRequestItemConfirmedCosts,
} from "../models/print-request-item.model.js";
import {
  buildPrintRequestModelPublicPath,
  buildPrintRequestThumbnailPublicPath,
  PRINT_REQUEST_MODEL_FILES_ROOT,
  getManagedPrintRequestModelAbsolutePath,
  getManagedPrintRequestPaymentSlipAbsolutePath,
  PRINT_REQUEST_THUMBNAILS_ROOT,
  removeManagedPrintRequestModelFile,
  removeManagedPrintRequestPaymentSlipFile,
} from "../utils/print-request-storage.util.js";
import { generatePaymentSlipArtifact } from "../utils/payment-slip.util.js";
import {
  attachManagedFileReference,
  getAbsolutePathForStorageKey,
  markFileObjectDeleted,
  registerManagedPublicPath,
} from "./file-storage.service.js";
import {
  createFileEvent,
  getFileObjectById,
  markFileReferencesInactive,
  updateFileObjectStorageLocation,
} from "../models/file-registry.model.js";
import {
  getManagedQuoteModelAbsolutePath,
  getManagedQuoteThumbnailAbsolutePath,
} from "../utils/quote-storage.util.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";
import { getManagedMmfPrintReadyFileAbsolutePath } from "../utils/mmf-print-ready-storage.util.js";
import { STORAGE_ROOT } from "../utils/storage-root.util.js";
import { findUserById } from "../models/user.model.js";
import { printRequestStatusMailgenContent, sendEmail } from "../utils/mail.js";
import { markQuoteRecordUsed } from "../models/quote-record.model.js";
import { markQuoteAssetUsed } from "../models/quote-asset.model.js";
import { markCartItemsSubmittedForUser } from "../models/cart-item.model.js";
import { markRequestDraftSubmitted } from "../models/request-draft.model.js";
import {
  createRequestDraft,
  getActiveCartQuoteRecords,
  getValidRequestDraftForUser,
  previewRequestDraft,
  validateQuoteRecordForSubmission,
} from "./request-draft-workflow.service.js";
import {
  buildPrintRequestCreatePayload,
  buildPrintRequestItemPayload,
  getSubmissionQuoteTotals,
} from "../utils/print-request-submission.util.js";
import {
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
} from "../utils/print-request-status.util.js";

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

function parseArchivedQuery(value) {
  return ["true", "1", "yes"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function requireText(value, fieldName) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  return normalized;
}

function snapshotRequestState(printRequest) {
  return {
    status: printRequest.status,
    rejectionReason: printRequest.rejection_reason,
    confirmedCost:
      printRequest.confirmed_cost === null
        ? null
        : Number(printRequest.confirmed_cost),
    paymentSlipUrl: printRequest.payment_slip_url,
    paymentSlipFileObjectId: printRequest.payment_slip_file_object_id,
    paymentSlipGeneratedAt: printRequest.payment_slip_generated_at,
    paymentSlipGeneratedBy: printRequest.payment_slip_generated_by,
    receiptReferenceNumber: printRequest.receipt_reference_number,
    receiptVerifiedAt: printRequest.receipt_verified_at,
    receiptVerifiedBy: printRequest.receipt_verified_by,
    receiptVerificationNote: printRequest.receipt_verification_note,
  };
}

function isQuoteUploadStoragePath(publicPath) {
  return String(publicPath || "").startsWith("/storage/quotes/");
}

async function promoteQuoteFileObject({
  fileObjectId,
  currentPublicPath,
  getCurrentAbsolutePath,
  destinationRoot,
  buildDestinationPublicPath,
  actorId,
  connection,
}) {
  if (!fileObjectId || !isQuoteUploadStoragePath(currentPublicPath)) {
    return {
      fileObjectId,
      fileUrl: currentPublicPath,
    };
  }

  const sourcePath = getCurrentAbsolutePath(currentPublicPath);

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new ApiError(
      410,
      "A quoted upload file is no longer available. Please calculate a new quote.",
    );
  }

  await fs.promises.mkdir(destinationRoot, { recursive: true });

  const fileName = path.basename(sourcePath);
  const destinationPath = path.join(destinationRoot, fileName);
  const destinationPublicPath = buildDestinationPublicPath({ filename: fileName });
  const destinationStorageKey = path
    .relative(STORAGE_ROOT, destinationPath)
    .replace(/\\/g, "/");

  if (path.resolve(sourcePath) !== path.resolve(destinationPath)) {
    await fs.promises.rename(sourcePath, destinationPath);
  }

  await updateFileObjectStorageLocation(
    {
      fileObjectId,
      storageKey: destinationStorageKey,
      publicPath: destinationPublicPath,
    },
    connection,
  );

  await createFileEvent(
    {
      fileObjectId,
      eventType: "promoted_to_print_request",
      actorId,
      summary: "Promoted uploaded quote file to durable print request storage.",
      metadata: {
        fromPublicPath: currentPublicPath,
        toPublicPath: destinationPublicPath,
        toStorageKey: destinationStorageKey,
      },
    },
    connection,
  );

  return {
    fileObjectId,
    fileUrl: destinationPublicPath,
  };
}

async function promoteUploadedQuoteFilesForSubmission({
  quoteRecord,
  actorId,
  connection,
}) {
  if (quoteRecord.source_type !== PRINT_REQUEST_SOURCE_TYPES.UPLOAD) {
    return quoteRecord;
  }

  const promotedModel = await promoteQuoteFileObject({
    fileObjectId: quoteRecord.file_object_id,
    currentPublicPath: quoteRecord.file_url,
    getCurrentAbsolutePath: getManagedQuoteModelAbsolutePath,
    destinationRoot: PRINT_REQUEST_MODEL_FILES_ROOT,
    buildDestinationPublicPath: ({ filename }) =>
      buildPrintRequestModelPublicPath({ filename }),
    actorId,
    connection,
  });
  const promotedThumbnail = await promoteQuoteFileObject({
    fileObjectId: quoteRecord.thumbnail_file_object_id,
    currentPublicPath: quoteRecord.thumbnail_url,
    getCurrentAbsolutePath: getManagedQuoteThumbnailAbsolutePath,
    destinationRoot: PRINT_REQUEST_THUMBNAILS_ROOT,
    buildDestinationPublicPath: ({ filename }) =>
      buildPrintRequestThumbnailPublicPath(filename),
    actorId,
    connection,
  });

  quoteRecord.file_url = promotedModel.fileUrl;
  quoteRecord.thumbnail_url = promotedThumbnail.fileUrl;

  return quoteRecord;
}

function getAllowedTransitionsForStatus(status) {
  return PRINT_REQUEST_STATUS_TRANSITIONS[status] || [];
}

function parseEventSnapshot(eventSnapshot) {
  return parseJsonSafely(eventSnapshot);
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

async function submitPrintRequest({ clientId, user, body, file, draft = null }) {
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

  const requestorName = requireText(
    body.requestorName ||
      [user.firstName || user.first_name, user.lastName || user.last_name]
        .filter(Boolean)
        .join(" "),
    "Requestor name",
  );
  const contactNumber = requireText(body.contactNumber, "Contact number");
  const collegeDepartment = requireText(
    body.collegeDepartment,
    "College/department",
  );
  const purpose = requireText(body.purpose, "Purpose/use case");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const quoteRecords = await getActiveCartQuoteRecords({
      clientId,
      cartItemIds: body.cartItemIds,
      connection,
    });

    for (const { quoteRecord } of quoteRecords) {
      if (
        quoteRecord.used_at ||
        (quoteRecord.expires_at &&
          new Date(quoteRecord.expires_at).getTime() <= Date.now())
      ) {
        throw new ApiError(400, "One or more quote tokens are invalid or expired");
      }

      await validateQuoteRecordForSubmission(quoteRecord);
    }

    for (const { quoteRecord } of quoteRecords) {
      await promoteUploadedQuoteFilesForSubmission({
        quoteRecord,
        actorId: clientId,
        connection,
      });
    }

    const firstQuote = quoteRecords[0].quoteRecord;
    const { estimatedTotal, quantityTotal } =
      getSubmissionQuoteTotals(quoteRecords);

    const printRequest = await createPrintRequest(
      buildPrintRequestCreatePayload({
        referenceNumber: generateReferenceNumber(),
        clientId,
        quoteRecords,
        requestorName,
        contactNumber,
        collegeDepartment,
        purpose,
        notes: normalizeOptionalText(body.notes),
        estimatedTotal,
        quantityTotal,
        termsAcceptedAt: new Date(),
      }),
      connection,
    );
    if (firstQuote.file_object_id) {
      await attachManagedFileReference({
        fileObjectId: firstQuote.file_object_id,
        referenceType: "print_request",
        referenceId: printRequest.id,
        referenceColumn: "file_object_id",
        fileRole: "model",
        ownerUserId: clientId,
        visibility: "private",
        actorId: clientId,
        connection,
      });
    }

    for (const { quoteRecord } of quoteRecords) {
      const requestItem = await createPrintRequestItem(
        buildPrintRequestItemPayload({
          printRequestId: printRequest.id,
          quoteRecord,
        }),
        connection,
      );
      await Promise.all([
        quoteRecord.file_object_id
          ? attachManagedFileReference({
              fileObjectId: quoteRecord.file_object_id,
              referenceType: "print_request_item",
              referenceId: requestItem.id,
              referenceColumn: "file_object_id",
              fileRole: "model",
              ownerUserId: clientId,
              visibility: "private",
              actorId: clientId,
              connection,
            })
          : Promise.resolve(null),
        quoteRecord.thumbnail_file_object_id
          ? attachManagedFileReference({
              fileObjectId: quoteRecord.thumbnail_file_object_id,
              referenceType: "print_request_item",
              referenceId: requestItem.id,
              referenceColumn: "thumbnail_file_object_id",
              fileRole: "thumbnail",
              ownerUserId: clientId,
              visibility: "private",
              actorId: clientId,
              connection,
            })
          : Promise.resolve(null),
      ]);

      const wasMarkedUsed = await markQuoteRecordUsed(quoteRecord.id, connection);

      if (!wasMarkedUsed) {
        throw new ApiError(400, "A quote token has already been used");
      }

      if (quoteRecord.quote_asset_id) {
        await markQuoteAssetUsed(quoteRecord.quote_asset_id, connection);
      }
    }

    await markCartItemsSubmittedForUser(
      {
        userId: clientId,
        quoteRecordIds: quoteRecords.map(({ quoteRecord }) => quoteRecord.id),
      },
      connection,
    );

    if (draft) {
      const wasDraftSubmitted = await markRequestDraftSubmitted(
        {
          draftId: draft.id,
          printRequestId: printRequest.id,
        },
        connection,
      );

      if (!wasDraftSubmitted) {
        throw new ApiError(409, "Request draft is no longer available");
      }
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

    await createPrintRequestEvent(
      {
        printRequestId: printRequest.id,
        eventType: "transition",
        fromStatus: null,
        toStatus: PRINT_REQUEST_STATUSES.PENDING_REVIEW,
        previousStateSnapshot: null,
        nextStateSnapshot: snapshotRequestState(printRequest),
        changedBy: clientId,
        changedByRole: user?.isAdmin ? "admin" : "client",
        note: "Print request submitted from quote",
      },
      connection,
    );

    await connection.commit();

    const [statusHistory, events, items] = await Promise.all([
      getPrintRequestStatusHistoryByRequestId(printRequest.id),
      getPrintRequestEventsByRequestId(printRequest.id),
      getPrintRequestItemsByRequestId(printRequest.id),
    ]);

    return {
      printRequest,
      statusHistory,
      events,
      items,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function submitRequestDraft({ clientId, user, draftToken, body = {} }) {
  const draft = await getValidRequestDraftForUser({ clientId, draftToken });

  return submitPrintRequest({
    clientId,
    user,
    body: {
      ...body,
      cartItemIds: draft.cart_item_ids,
    },
    draft,
  });
}

async function listClientPrintRequests({ clientId, query = {} }) {
  const { page, limit } = normalizePagination(query.page, query.limit);

  return getPaginatedPrintRequestsByOwner(clientId, {
    page,
    limit,
    status: normalizeOptionalText(query.status),
    cursor: normalizeOptionalText(query.cursor),
  });
}

async function getPrintRequestDetailForUser({ user, requestId }) {
  const printRequest = user?.isAdmin
    ? await getPrintRequestById(requestId)
    : await getPrintRequestByIdForOwner(requestId, user.id);

  if (!printRequest) {
    throw new ApiError(404, "Print request not found");
  }

  const [statusHistory, events, items] = await Promise.all([
    getPrintRequestStatusHistoryByRequestId(printRequest.id),
    getPrintRequestEventsByRequestId(printRequest.id),
    getPrintRequestItemsByRequestId(printRequest.id),
  ]);

  return {
    printRequest,
    statusHistory,
    events,
    items,
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
    search: normalizeOptionalText(query.search),
    cursor: normalizeOptionalText(query.cursor),
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

  if (
    ![
      PRINT_REQUEST_STATUSES.REJECTED,
      PRINT_REQUEST_STATUSES.CANCELLED,
    ].includes(existingPrintRequest.status)
  ) {
    throw new ApiError(400, "Only rejected or cancelled print requests can be archived");
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

  if (
    ![
      PRINT_REQUEST_STATUSES.REJECTED,
      PRINT_REQUEST_STATUSES.CANCELLED,
    ].includes(existingPrintRequest.status)
  ) {
    throw new ApiError(400, "Only rejected or cancelled print requests can be deleted");
  }

  const existingItems = await getPrintRequestItemsByRequestId(requestId);
  const connection = await pool.getConnection();
  let deleted = false;

  try {
    await connection.beginTransaction();

    for (const item of existingItems) {
      await markFileReferencesInactive(
        {
          referenceType: "print_request_item",
          referenceId: item.id,
          status: "deleted",
          reason: "Print request was permanently deleted by admin.",
        },
        connection,
      );
    }

    await markFileReferencesInactive(
      {
        referenceType: "print_request",
        referenceId: requestId,
        status: "deleted",
        reason: "Print request was permanently deleted by admin.",
      },
      connection,
    );

    deleted = await deletePrintRequestById(requestId, connection);

    if (!deleted) {
      throw new ApiError(404, "Print request not found");
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { deleted: true };
}

async function cancelClientPrintRequest({ requestId, clientId, body }) {
  const existingPrintRequest = await getPrintRequestByIdForOwner(
    requestId,
    clientId,
  );

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (existingPrintRequest.archived_at) {
    throw new ApiError(400, "Archived print requests cannot be cancelled");
  }

  if (
    ![
      PRINT_REQUEST_STATUSES.PENDING_REVIEW,
      PRINT_REQUEST_STATUSES.DESIGN_IN_PROGRESS,
    ].includes(existingPrintRequest.status)
  ) {
    throw new ApiError(
      400,
      "Print request can only be cancelled before admin approval",
    );
  }

  const cancellationReason = requireText(
    body.cancellationReason,
    "Cancellation reason",
  );
  const previousStateSnapshot = snapshotRequestState(existingPrintRequest);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedPrintRequest = await updatePrintRequestStatusById(
      requestId,
      {
        status: PRINT_REQUEST_STATUSES.CANCELLED,
        rejectionReason: existingPrintRequest.rejection_reason,
        confirmedCost: existingPrintRequest.confirmed_cost,
        paymentSlipUrl: existingPrintRequest.payment_slip_url,
        paymentSlipFileObjectId:
          existingPrintRequest.payment_slip_file_object_id,
        paymentSlipGeneratedAt: existingPrintRequest.payment_slip_generated_at,
        paymentSlipGeneratedBy: existingPrintRequest.payment_slip_generated_by,
        receiptReferenceNumber: existingPrintRequest.receipt_reference_number,
        receiptVerifiedAt: existingPrintRequest.receipt_verified_at,
        receiptVerifiedBy: existingPrintRequest.receipt_verified_by,
        receiptVerificationNote: existingPrintRequest.receipt_verification_note,
      },
      connection,
    );

    await createPrintRequestStatusHistory(
      {
        printRequestId: requestId,
        status: PRINT_REQUEST_STATUSES.CANCELLED,
        changedBy: clientId,
        changedByRole: "client",
        note: `Cancelled by client: ${cancellationReason}`,
      },
      connection,
    );

    await createPrintRequestEvent(
      {
        printRequestId: requestId,
        eventType: "transition",
        fromStatus: existingPrintRequest.status,
        toStatus: PRINT_REQUEST_STATUSES.CANCELLED,
        previousStateSnapshot,
        nextStateSnapshot: snapshotRequestState(updatedPrintRequest),
        changedBy: clientId,
        changedByRole: "client",
        note: cancellationReason,
      },
      connection,
    );

    await connection.commit();

    const [statusHistory, events, items] = await Promise.all([
      getPrintRequestStatusHistoryByRequestId(updatedPrintRequest.id),
      getPrintRequestEventsByRequestId(updatedPrintRequest.id),
      getPrintRequestItemsByRequestId(updatedPrintRequest.id),
    ]);

    return {
      printRequest: updatedPrintRequest,
      statusHistory,
      events,
      items,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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

  const nextRejectionReason = resolveRejectionReason({
    nextStatus,
    body,
    existingPrintRequest,
  });
  const itemCosts = parseItemConfirmedCosts(body.items);
  const resolvedConfirmedCost = resolveNextConfirmedCost({ body, itemCosts });
  const nextConfirmedCost =
    resolvedConfirmedCost !== undefined
      ? resolvedConfirmedCost
      : existingPrintRequest.confirmed_cost;
  assertPaymentSlipConfirmedCost({ nextStatus, nextConfirmedCost });
  const { receiptReferenceNumber, receiptVerificationNote } =
    resolveReceiptVerificationFields({
      nextStatus,
      body,
      existingPrintRequest,
    });
  const paymentSlip = buildInitialPaymentSlipState(existingPrintRequest);

  if (nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_SLIP_ISSUED) {
    const existingItems = await getPrintRequestItemsByRequestId(requestId);
    const paymentSlipItems =
      itemCosts.length > 0
        ? existingItems.map((item) => {
            const override = itemCosts.find(
              (candidate) => candidate.itemId === Number(item.id),
            );
            return {
              ...item,
              confirmed_cost:
                override?.confirmedCost ?? item.confirmed_cost ?? item.estimated_cost,
            };
          })
        : existingItems.map((item) => ({
            ...item,
            confirmed_cost: item.confirmed_cost ?? item.estimated_cost,
          }));

    paymentSlip.url = await generatePaymentSlipArtifact({
      printRequest: {
        ...existingPrintRequest,
        confirmed_cost: nextConfirmedCost,
      },
      items: paymentSlipItems,
      adminId,
    });
    const paymentSlipPath =
      getManagedPrintRequestPaymentSlipAbsolutePath(paymentSlip.url);
    const paymentSlipFileObject = paymentSlipPath
      ? await registerManagedPublicPath({
          publicPath: paymentSlip.url,
          originalFileName: path.basename(paymentSlipPath),
          mimeType: "application/pdf",
          visibility: "private",
          createdBy: adminId,
          dedupe: false,
        })
      : null;
    paymentSlip.fileObjectId = paymentSlipFileObject?.id || null;
    paymentSlip.generatedAt = new Date();
    paymentSlip.generatedBy = adminId;
  }

  const previousStateSnapshot = snapshotRequestState(existingPrintRequest);
  const transitionNote = buildStatusHistoryNote({
    note: body.note,
    fallback: `Status updated from ${existingPrintRequest.status} to ${nextStatus}`,
  });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedPrintRequest = await updatePrintRequestStatusById(
      requestId,
      buildStatusUpdatePayload({
        nextStatus,
        adminId,
        existingPrintRequest,
        nextRejectionReason,
        nextConfirmedCost,
        paymentSlip,
        receiptReferenceNumber,
        receiptVerificationNote,
      }),
      connection,
    );
    if (paymentSlip.fileObjectId) {
      await attachManagedFileReference({
        fileObjectId: paymentSlip.fileObjectId,
        referenceType: "print_request",
        referenceId: updatedPrintRequest.id,
        referenceColumn: "payment_slip_file_object_id",
        fileRole: "payment_slip",
        ownerUserId: existingPrintRequest.client_id,
        visibility: "private",
        actorId: adminId,
        connection,
      });
    }

    if (itemCosts.length > 0) {
      await updatePrintRequestItemConfirmedCosts(
        requestId,
        itemCosts,
        connection,
      );
    } else if (nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_SLIP_ISSUED) {
      const existingItems = await getPrintRequestItemsByRequestId(
        requestId,
        connection,
      );
      await updatePrintRequestItemConfirmedCosts(
        requestId,
        existingItems.map((item) => ({
          itemId: item.id,
          confirmedCost: item.confirmed_cost ?? item.estimated_cost,
        })),
        connection,
      );
    }

    await createPrintRequestStatusHistory(
      {
        printRequestId: requestId,
        status: nextStatus,
        changedBy: adminId,
        changedByRole: "admin",
        note: transitionNote,
      },
      connection,
    );

    await createPrintRequestEvent(
      {
        printRequestId: requestId,
        eventType: "transition",
        fromStatus: existingPrintRequest.status,
        toStatus: nextStatus,
        previousStateSnapshot,
        nextStateSnapshot: snapshotRequestState(updatedPrintRequest),
        changedBy: adminId,
        changedByRole: "admin",
        note: transitionNote,
      },
      connection,
    );

    await connection.commit();

    const [statusHistory, events, items] = await Promise.all([
      getPrintRequestStatusHistoryByRequestId(updatedPrintRequest.id),
      getPrintRequestEventsByRequestId(updatedPrintRequest.id),
      getPrintRequestItemsByRequestId(updatedPrintRequest.id),
    ]);

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
      events,
      items,
    };
  } catch (error) {
    await connection.rollback();
    if (
      paymentSlip.url &&
      paymentSlip.url !== existingPrintRequest.payment_slip_url
    ) {
      if (paymentSlip.fileObjectId) {
        await markFileObjectDeleted({
          fileObjectId: paymentSlip.fileObjectId,
          actorId: adminId,
          reason: "Removed payment slip after failed status transaction.",
          deletePhysical: true,
        });
      } else {
        await removeManagedPrintRequestPaymentSlipFile(paymentSlip.url);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function undoAdminPrintRequestStatus({ requestId, adminId, body = {} }) {
  const existingPrintRequest = await getPrintRequestById(requestId);

  if (!existingPrintRequest) {
    throw new ApiError(404, "Print request not found");
  }

  if (existingPrintRequest.archived_at) {
    throw new ApiError(400, "Archived print requests cannot be updated");
  }

  const correctionReason = normalizeOptionalText(body.correctionReason);

  if (!correctionReason) {
    throw new ApiError(400, "Correction reason is required.");
  }

  const latestTransition = await getLatestReversiblePrintRequestEvent(requestId);

  if (!latestTransition || !latestTransition.from_status) {
    throw new ApiError(400, "No reversible status transition was found.");
  }

  const previousStateSnapshot = parseEventSnapshot(
    latestTransition.previous_state_snapshot,
  );

  if (!previousStateSnapshot?.status) {
    throw new ApiError(
      409,
      "Latest transition cannot be corrected because its previous state snapshot is missing.",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedPrintRequest = await restorePrintRequestStateById(
      requestId,
      previousStateSnapshot,
      connection,
    );

    await createPrintRequestStatusHistory(
      {
        printRequestId: requestId,
        status: updatedPrintRequest.status,
        changedBy: adminId,
        changedByRole: "admin",
        note: `Correction: ${correctionReason}`,
      },
      connection,
    );

    const correctionEvent = await createPrintRequestEvent(
      {
        printRequestId: requestId,
        eventType: "correction",
        fromStatus: existingPrintRequest.status,
        toStatus: updatedPrintRequest.status,
        previousStateSnapshot: snapshotRequestState(existingPrintRequest),
        nextStateSnapshot: snapshotRequestState(updatedPrintRequest),
        changedBy: adminId,
        changedByRole: "admin",
        note: correctionReason,
      },
      connection,
    );

    const markedReverted = await markPrintRequestEventReverted(
      latestTransition.id,
      {
        revertedBy: adminId,
        revertedByEventId: correctionEvent.id,
      },
      connection,
    );

    if (!markedReverted) {
      throw new ApiError(409, "This transition has already been corrected.");
    }

    await connection.commit();

    const [newStatusHistory, events, items] = await Promise.all([
      getPrintRequestStatusHistoryByRequestId(updatedPrintRequest.id),
      getPrintRequestEventsByRequestId(updatedPrintRequest.id),
      getPrintRequestItemsByRequestId(updatedPrintRequest.id),
    ]);

    return {
      printRequest: updatedPrintRequest,
      statusHistory: newStatusHistory,
      events,
      items,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function resolveAdminPrintRequestModel({ requestId }) {
  const printRequest = await getPrintRequestById(requestId);

  if (!printRequest) {
    throw new ApiError(404, "Print request not found");
  }

  const resolvedModel = await resolvePrintRequestModelFile(printRequest);

  if (!resolvedModel?.absolutePath || !fs.existsSync(resolvedModel.absolutePath)) {
    throw new ApiError(404, "Model file is not available for this request");
  }

  const originalName =
    printRequest.file_original_name ||
    resolvedModel.originalFileName ||
    path.basename(resolvedModel.absolutePath);
  const safeFileName = path
    .basename(originalName)
    .replace(/[^\w.\- ()]+/g, "_")
    .slice(0, 180);

  return {
    absolutePath: resolvedModel.absolutePath,
    fileName: safeFileName || path.basename(resolvedModel.absolutePath),
  };
}

async function resolveAdminPrintRequestItemModel({ requestId, itemId }) {
  const printRequest = await getPrintRequestById(requestId);

  if (!printRequest) {
    throw new ApiError(404, "Print request not found");
  }

  const item = await getPrintRequestItemForRequest(requestId, itemId);

  if (!item) {
    throw new ApiError(404, "Print request item not found");
  }

  const resolvedModel = await resolvePrintRequestModelFile(item);

  if (!resolvedModel?.absolutePath || !fs.existsSync(resolvedModel.absolutePath)) {
    throw new ApiError(404, "Model file is not available for this item");
  }

  const originalName =
    item.file_original_name ||
    resolvedModel.originalFileName ||
    path.basename(resolvedModel.absolutePath);
  const safeFileName = path
    .basename(originalName)
    .replace(/[^\w.\- ()]+/g, "_")
    .slice(0, 180);

  return {
    absolutePath: resolvedModel.absolutePath,
    fileName: safeFileName || path.basename(resolvedModel.absolutePath),
  };
}

async function resolvePrintRequestModelFile(record) {
  if (record?.file_object_id) {
    const fileObject = await getFileObjectById(record.file_object_id);

    if (
      fileObject &&
      fileObject.storageStatus === "present" &&
      !fileObject.deletedAt &&
      fileObject.storageKey
    ) {
      return {
        absolutePath: getAbsolutePathForStorageKey(fileObject.storageKey),
        originalFileName: fileObject.originalFileName,
      };
    }
  }

  let absolutePath = null;

  if (record?.source_type === PRINT_REQUEST_SOURCE_TYPES.UPLOAD) {
    absolutePath = getManagedPrintRequestModelAbsolutePath(record.file_url);
  } else if (record?.source_type === PRINT_REQUEST_SOURCE_TYPES.LIBRARY) {
    absolutePath = getManagedLocalDesignAbsolutePath(record.file_url, "design");
  } else if (record?.source_type === PRINT_REQUEST_SOURCE_TYPES.MMF) {
    absolutePath = getManagedMmfPrintReadyFileAbsolutePath(record.file_url);
  }

  return {
    absolutePath,
    originalFileName: null,
  };
}

export {
  createRequestDraft,
  previewRequestDraft,
  submitRequestDraft,
  listClientPrintRequests,
  getPrintRequestDetailForUser,
  listAdminPrintRequests,
  updateAdminPrintRequestStatus,
  archiveAdminPrintRequest,
  deleteAdminPrintRequest,
  cancelClientPrintRequest,
  undoAdminPrintRequestStatus,
  resolveAdminPrintRequestModel,
  resolveAdminPrintRequestItemModel,
  getAllowedTransitionsForStatus,
};
