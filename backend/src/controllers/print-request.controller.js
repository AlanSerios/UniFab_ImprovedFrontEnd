import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createRequestDraft as createRequestDraftService,
  previewRequestDraft as previewRequestDraftService,
  previewPrintRequestSubmission as previewPrintRequestSubmissionService,
  submitRequestDraft as submitRequestDraftService,
  submitPrintRequest as submitPrintRequestService,
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
} from "../services/print-request.service.js";
import { buildDownloadUrl } from "../services/file-storage.service.js";
import {
  buildContentDisposition,
  sanitizeDownloadFileName,
} from "../utils/content-disposition.util.js";

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

function normalizePrintRequest(printRequest) {
  if (!printRequest) {
    return null;
  }

  return {
    id: printRequest.id,
    referenceNumber: printRequest.reference_number,
    clientId: printRequest.client_id,
    sourceType: printRequest.source_type,
    designId: printRequest.design_id,
    fileObjectId: printRequest.file_object_id,
    fileUrl: printRequest.file_object_id
      ? buildDownloadUrl(printRequest.file_object_id, { inline: true })
      : printRequest.file_url,
    fileOriginalName: printRequest.file_original_name,
    fileMimeType: printRequest.file_mime_type,
    fileSize: printRequest.file_size,
    requestorName: printRequest.requestor_name,
    contactNumber: printRequest.contact_number,
    collegeDepartment: printRequest.college_department,
    purpose: printRequest.purpose,
    designSnapshot: parseJsonSafely(printRequest.design_snapshot),
    quoteToken: printRequest.quote_token,
    quoteSnapshot: parseJsonSafely(printRequest.quote_snapshot),
    material: printRequest.material,
    materialColorId: printRequest.material_color_id,
    materialColorName: printRequest.material_color_name,
    materialColorHex: printRequest.material_color_hex,
    printQuality: printRequest.print_quality,
    infill: Number(printRequest.infill),
    quantity: Number(printRequest.quantity),
    notes: printRequest.notes,
    estimatedCost:
      printRequest.estimated_cost === null
        ? null
        : Number(printRequest.estimated_cost),
    confirmedCost:
      printRequest.confirmed_cost === null
        ? null
        : Number(printRequest.confirmed_cost),
    paymentSlipFileObjectId: printRequest.payment_slip_file_object_id,
    paymentSlipUrl: printRequest.payment_slip_file_object_id
      ? buildDownloadUrl(printRequest.payment_slip_file_object_id)
      : printRequest.payment_slip_url,
    paymentSlipGeneratedAt: printRequest.payment_slip_generated_at,
    paymentSlipGeneratedBy: printRequest.payment_slip_generated_by,
    receiptReferenceNumber: printRequest.receipt_reference_number,
    receiptVerifiedAt: printRequest.receipt_verified_at,
    receiptVerifiedBy: printRequest.receipt_verified_by,
    receiptVerificationNote: printRequest.receipt_verification_note,
    termsAcceptedAt: printRequest.terms_accepted_at,
    termsVersion: printRequest.terms_version,
    status: printRequest.status,
    availableTransitions: getAllowedTransitionsForStatus(printRequest.status),
    rejectionReason: printRequest.rejection_reason,
    archivedAt: printRequest.archived_at,
    archivedBy: printRequest.archived_by,
    clientFirstName: printRequest.client_first_name,
    clientLastName: printRequest.client_last_name,
    clientName: [printRequest.client_first_name, printRequest.client_last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    clientEmail: printRequest.client_email,
    itemCount: Number(printRequest.item_count || 0),
    createdAt: printRequest.created_at,
    updatedAt: printRequest.updated_at,
  };
}

function normalizeStatusHistory(historyItem) {
  if (!historyItem) {
    return null;
  }

  return {
    id: historyItem.id,
    printRequestId: historyItem.print_request_id,
    status: historyItem.status,
    changedBy: historyItem.changed_by,
    changedByRole: historyItem.changed_by_role,
    note: historyItem.note,
    createdAt: historyItem.created_at,
  };
}

function normalizePrintRequestItem(item) {
  if (!item) {
    return null;
  }

  return {
    id: item.id,
    printRequestId: item.print_request_id,
    sourceType: item.source_type,
    designId: item.design_id,
    fileObjectId: item.file_object_id,
    fileUrl: item.file_object_id
      ? buildDownloadUrl(item.file_object_id, { inline: true })
      : item.file_url,
    fileOriginalName: item.file_original_name,
    fileMimeType: item.file_mime_type,
    fileSize: item.file_size,
    thumbnailFileObjectId: item.thumbnail_file_object_id,
    thumbnailUrl: item.thumbnail_file_object_id
      ? buildDownloadUrl(item.thumbnail_file_object_id, { inline: true })
      : item.thumbnail_url,
    designSnapshot: parseJsonSafely(item.design_snapshot),
    quoteToken: item.quote_token,
    quoteSnapshot: parseJsonSafely(item.quote_snapshot),
    pricingConfigSnapshot: parseJsonSafely(item.pricing_config_snapshot),
    materialSnapshot: parseJsonSafely(item.material_snapshot),
    material: item.material,
    materialColorId: item.material_color_id,
    materialColorName: item.material_color_name,
    materialColorHex: item.material_color_hex,
    printQuality: item.print_quality,
    infill: Number(item.infill),
    quantity: Number(item.quantity),
    estimatedCost:
      item.estimated_cost === null ? null : Number(item.estimated_cost),
    confirmedCost:
      item.confirmed_cost === null ? null : Number(item.confirmed_cost),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function normalizePrintRequestEvent(eventItem) {
  if (!eventItem) {
    return null;
  }

  return {
    id: eventItem.id,
    printRequestId: eventItem.print_request_id,
    eventType: eventItem.event_type,
    fromStatus: eventItem.from_status,
    toStatus: eventItem.to_status,
    previousStateSnapshot: parseJsonSafely(eventItem.previous_state_snapshot),
    nextStateSnapshot: parseJsonSafely(eventItem.next_state_snapshot),
    changedBy: eventItem.changed_by,
    changedByRole: eventItem.changed_by_role,
    note: eventItem.note,
    revertedAt: eventItem.reverted_at,
    revertedBy: eventItem.reverted_by,
    revertedByEventId: eventItem.reverted_by_event_id,
    createdAt: eventItem.created_at,
  };
}

function wantsAttachmentDownload(req) {
  const value = String(req.query.download || "").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function normalizeRequestDraft(draft) {
  if (!draft) {
    return null;
  }

  return {
    id: draft.id,
    draftToken: draft.draft_token,
    source: draft.source,
    status: draft.status,
    cartItemIds: draft.cart_item_ids,
    expiresAt: draft.expires_at,
    submittedPrintRequestId: draft.submitted_print_request_id,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

const createRequestDraft = asyncHandler(async (req, res) => {
  const draft = await createRequestDraftService({
    clientId: req.user.id,
    body: req.body,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        draft: normalizeRequestDraft(draft),
      },
      "Request draft created successfully",
    ),
  );
});

const previewRequestDraft = asyncHandler(async (req, res) => {
  const preview = await previewRequestDraftService({
    clientId: req.user.id,
    draftToken: req.params.draftToken,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        preview,
      },
      "Request draft preview fetched successfully",
    ),
  );
});

const submitRequestDraft = asyncHandler(async (req, res) => {
  const result = await submitRequestDraftService({
    clientId: req.user.id,
    user: req.user,
    draftToken: req.params.draftToken,
    body: req.body,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Print request submitted successfully",
    ),
  );
});

const submitPrintRequest = asyncHandler(async (req, res) => {
  const result = await submitPrintRequestService({
    clientId: req.user.id,
    user: req.user,
    body: req.body,
    file: req.file,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Print request submitted successfully",
    ),
  );
});

const listMyPrintRequests = asyncHandler(async (req, res) => {
  const result = await listClientPrintRequests({
    clientId: req.user.id,
    query: req.query,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequests: result.rows.map(normalizePrintRequest),
        counts: {
          byStatus: Object.fromEntries(
            (result.statusCounts || []).map((item) => [
              item.status,
              Number(item.count || 0),
            ]),
          ),
        },
        pagination: {
          page: result.page,
          limit: result.limit,
          totalCount: result.totalCount,
          nextCursor: result.nextCursor,
        },
        filters: {
          archived: req.query.archived || "",
          search: req.query.search || "",
          sourceType: req.query.sourceType || "",
          status: req.query.status || "",
        },
      },
      "Print requests fetched successfully",
    ),
  );
});

const getMyPrintRequestDetail = asyncHandler(async (req, res) => {
  const result = await getPrintRequestDetailForUser({
    user: req.user,
    requestId: req.params.requestId,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Print request fetched successfully",
    ),
  );
});

const listAllPrintRequests = asyncHandler(async (req, res) => {
  const result = await listAdminPrintRequests({
    query: req.query,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequests: result.rows.map(normalizePrintRequest),
        pagination: {
          page: result.page,
          limit: result.limit,
          totalCount: result.totalCount,
          nextCursor: result.nextCursor,
        },
      },
      "Print requests fetched successfully",
    ),
  );
});

const updatePrintRequestStatus = asyncHandler(async (req, res) => {
  const result = await updateAdminPrintRequestStatus({
    requestId: req.params.requestId,
    adminId: req.user.id,
    body: req.body,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Print request status updated successfully",
    ),
  );
});

const undoPrintRequestStatus = asyncHandler(async (req, res) => {
  const result = await undoAdminPrintRequestStatus({
    requestId: req.params.requestId,
    adminId: req.user.id,
    body: req.body,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Last status change corrected successfully",
    ),
  );
});

const previewPrintRequestSubmission = asyncHandler(async (req, res) => {
  const preview = await previewPrintRequestSubmissionService({
    clientId: req.user.id,
    body: req.body,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        preview,
      },
      "Print request submission preview fetched successfully",
    ),
  );
});

const cancelPrintRequest = asyncHandler(async (req, res) => {
  const result = await cancelClientPrintRequest({
    requestId: req.params.requestId,
    clientId: req.user.id,
    body: req.body,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        items: (result.items || []).map(normalizePrintRequestItem),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
        events: (result.events || []).map(normalizePrintRequestEvent),
      },
      "Print request cancelled successfully",
    ),
  );
});

const streamAdminPrintRequestModel = asyncHandler(async (req, res) => {
  const { absolutePath, fileName } = await resolveAdminPrintRequestModel({
    requestId: req.params.requestId,
  });
  const safeFileName = sanitizeDownloadFileName(fileName);

  if (wantsAttachmentDownload(req)) {
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition("attachment", safeFileName),
    );
    return res.sendFile(absolutePath);
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    buildContentDisposition("inline", safeFileName),
  );

  return res.sendFile(absolutePath);
});

const streamAdminPrintRequestItemModel = asyncHandler(async (req, res) => {
  const { absolutePath, fileName } = await resolveAdminPrintRequestItemModel({
    requestId: req.params.requestId,
    itemId: req.params.itemId,
  });
  const safeFileName = sanitizeDownloadFileName(fileName);

  if (wantsAttachmentDownload(req)) {
    res.setHeader(
      "Content-Disposition",
      buildContentDisposition("attachment", safeFileName),
    );
    return res.sendFile(absolutePath);
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    buildContentDisposition("inline", safeFileName),
  );

  return res.sendFile(absolutePath);
});

const archivePrintRequest = asyncHandler(async (req, res) => {
  const result = await archiveAdminPrintRequest({
    requestId: req.params.requestId,
    adminId: req.user.id,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        printRequest: normalizePrintRequest(result.printRequest),
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
      },
      "Print request archived successfully",
    ),
  );
});

const deletePrintRequest = asyncHandler(async (req, res) => {
  await deleteAdminPrintRequest({
    requestId: req.params.requestId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Print request deleted successfully"));
});

export {
  createRequestDraft,
  previewRequestDraft,
  previewPrintRequestSubmission,
  submitRequestDraft,
  submitPrintRequest,
  listMyPrintRequests,
  getMyPrintRequestDetail,
  listAllPrintRequests,
  updatePrintRequestStatus,
  undoPrintRequestStatus,
  cancelPrintRequest,
  archivePrintRequest,
  deletePrintRequest,
  streamAdminPrintRequestModel,
  streamAdminPrintRequestItemModel,
};
