import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createRequestDraft as createRequestDraftService,
  previewRequestDraft as previewRequestDraftService,
  submitRequestDraft as submitRequestDraftService,
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
} from "../services/print-request.service.js";
import {
  buildContentDisposition,
  sanitizeDownloadFileName,
} from "../utils/content-disposition.util.js";
import {
  normalizePrintRequest,
  normalizePrintRequestEvent,
  normalizePrintRequestItem,
  normalizeRequestDraft,
  normalizeStatusHistory,
} from "../utils/print-request-response.util.js";

function wantsAttachmentDownload(req) {
  const value = String(req.query.download || "").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function deprecatedDraftOnlySubmission(_req, res) {
  return res.status(410).json({
    success: false,
    message:
      "Direct print request submission is retired. Create a request draft with POST /api/v1/requests/drafts, preview it with GET /api/v1/requests/drafts/:draftToken/preview, then submit it with POST /api/v1/requests/drafts/:draftToken/submit.",
    errors: [],
  });
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
  submitRequestDraft,
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
  deprecatedDraftOnlySubmission,
};
