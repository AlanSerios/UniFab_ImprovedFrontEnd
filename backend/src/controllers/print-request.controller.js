import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  submitPrintRequest as submitPrintRequestService,
  listClientPrintRequests,
  getPrintRequestDetailForUser,
  listAdminPrintRequests,
  updateAdminPrintRequestStatus,
  archiveAdminPrintRequest,
  deleteAdminPrintRequest,
  undoAdminPrintRequestStatus,
} from "../services/print-request.service.js";

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
    designRequestId: printRequest.design_request_id,
    fileUrl: printRequest.file_url,
    fileOriginalName: printRequest.file_original_name,
    fileMimeType: printRequest.file_mime_type,
    fileSize: printRequest.file_size,
    designSnapshot: parseJsonSafely(printRequest.design_snapshot),
    quoteToken: printRequest.quote_token,
    quoteSnapshot: parseJsonSafely(printRequest.quote_snapshot),
    material: printRequest.material,
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
    paymentSlipUrl: printRequest.payment_slip_url,
    termsAcceptedAt: printRequest.terms_accepted_at,
    termsVersion: printRequest.terms_version,
    status: printRequest.status,
    rejectionReason: printRequest.rejection_reason,
    archivedAt: printRequest.archived_at,
    archivedBy: printRequest.archived_by,
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
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
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
        pagination: {
          page: result.page,
          limit: result.limit,
          totalCount: result.totalCount,
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
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
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
        statusHistory: result.statusHistory.map(normalizeStatusHistory),
      },
      "Print request status updated successfully",
    ),
  );
});

const undoPrintRequestStatus = asyncHandler(async (req, res) => {
  const result = await undoAdminPrintRequestStatus({
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
      "Last status change undone successfully",
    ),
  );
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
  submitPrintRequest,
  listMyPrintRequests,
  getMyPrintRequestDetail,
  listAllPrintRequests,
  updatePrintRequestStatus,
  undoPrintRequestStatus,
  archivePrintRequest,
  deletePrintRequest,
};
