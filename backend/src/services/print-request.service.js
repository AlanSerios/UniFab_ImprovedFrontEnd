import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
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
  PRINT_REQUEST_PAYMENT_SLIPS_ROOT,
  PRINT_REQUEST_THUMBNAILS_ROOT,
  removeManagedPrintRequestModelFile,
  removeManagedPrintRequestPaymentSlipFile,
} from "../utils/print-request-storage.util.js";
import {
  attachManagedFileReference,
  buildDownloadUrl,
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
import {
  listActiveCartItemsForUser,
  markCartItemsSubmittedForUser,
} from "../models/cart-item.model.js";
import {
  createRequestDraft as createRequestDraftRecord,
  getRequestDraftByTokenForUser,
  markRequestDraftSubmitted,
} from "../models/request-draft.model.js";

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

function getRequestDraftTtlHours() {
  const value = Number(process.env.REQUEST_DRAFT_TTL_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function buildRequestDraftExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + getRequestDraftTtlHours());
  return expiresAt;
}

function generateRequestDraftToken() {
  return randomBytes(32).toString("hex");
}

function getDraftSource(cartItemIds) {
  if (!cartItemIds.length) {
    return "cart";
  }

  return cartItemIds.length === 1 ? "single_quote" : "selected_cart";
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

function getQuotePreviewLabel(quoteRecord) {
  const designSnapshot = parseJsonSafely(quoteRecord.design_snapshot);
  const quoteSnapshot = parseJsonSafely(quoteRecord.quote_snapshot);

  return (
    quoteRecord.file_original_name ||
    designSnapshot?.title ||
    designSnapshot?.name ||
    quoteSnapshot?.file?.originalName ||
    quoteSnapshot?.design?.title ||
    quoteSnapshot?.mmfObject?.name ||
    "Quoted model"
  );
}

function getQuotePreviewCurrency(quoteRecord) {
  const pricingConfigSnapshot = parseJsonSafely(
    quoteRecord.pricing_config_snapshot,
  );
  const quoteSnapshot = parseJsonSafely(quoteRecord.quote_snapshot);

  return pricingConfigSnapshot?.currency || quoteSnapshot?.currency || "PHP";
}

async function validateQuoteRecordForSubmission(quoteRecord) {
  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.UPLOAD) {
    if (!quoteRecord.file_url) {
      throw new ApiError(500, "Quote is missing its uploaded model file");
    }

    const modelPath =
      getManagedQuoteModelAbsolutePath(quoteRecord.file_url) ||
      getManagedPrintRequestModelAbsolutePath(quoteRecord.file_url);

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A quote model file is no longer available. Please calculate a new quote.",
      );
    }
  }

  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.LIBRARY) {
    const modelPath = getManagedLocalDesignAbsolutePath(
      quoteRecord.file_url,
      "design",
    );

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A linked local design file is no longer available. Please calculate a new quote.",
      );
    }
  }

  if (quoteRecord.source_type === PRINT_REQUEST_SOURCE_TYPES.MMF) {
    const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
      quoteRecord.file_url,
    );

    if (!modelPath || !fs.existsSync(modelPath)) {
      throw new ApiError(
        410,
        "A cached MyMiniFactory printable file is no longer available. Please calculate a new quote.",
      );
    }
  }
}

function buildQuotePreviewItem({ cartItem, quoteRecord }) {
  const thumbnailUrl = quoteRecord.thumbnail_file_object_id
    ? buildDownloadUrl(quoteRecord.thumbnail_file_object_id, { inline: true })
    : quoteRecord.thumbnail_url;
  const fileUrl = quoteRecord.file_object_id
    ? buildDownloadUrl(quoteRecord.file_object_id, { inline: true })
    : quoteRecord.file_url;

  return {
    id: cartItem?.id || null,
    quoteRecordId: quoteRecord.id,
    sourceType: quoteRecord.source_type,
    designId: quoteRecord.design_id,
    label: getQuotePreviewLabel(quoteRecord),
    fileObjectId: quoteRecord.file_object_id,
    fileUrl,
    fileOriginalName: quoteRecord.file_original_name,
    fileSize: quoteRecord.file_size,
    thumbnailUrl,
    material: quoteRecord.material,
    materialColorId: quoteRecord.material_color_id,
    materialColorName: quoteRecord.material_color_name,
    materialColorHex: quoteRecord.material_color_hex,
    printQuality: quoteRecord.print_quality,
    infill: Number(quoteRecord.infill),
    quantity: Number(quoteRecord.quantity),
    estimatedCost: Number(quoteRecord.estimated_cost || 0),
    currency: getQuotePreviewCurrency(quoteRecord),
    expiresAt: quoteRecord.expires_at,
    createdAt: quoteRecord.created_at,
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

function normalizeCartItemIds(cartItemIds) {
  if (!Array.isArray(cartItemIds)) {
    return [];
  }

  return [
    ...new Set(
      cartItemIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

async function getActiveCartQuoteRecords({
  clientId,
  cartItemIds = [],
  connection = null,
}) {
  const selectedCartItemIds = normalizeCartItemIds(cartItemIds);
  const cartItems = await listActiveCartItemsForUser(
    {
      userId: clientId,
      retentionDays: Number(process.env.CART_RETENTION_DAYS || 30),
    },
    connection,
  );

  if (cartItems.length === 0) {
    throw new ApiError(400, "Your cart is empty");
  }

  const selectedCartItems =
    selectedCartItemIds.length > 0
      ? cartItems.filter((cartItem) => selectedCartItemIds.includes(cartItem.id))
      : cartItems;

  if (selectedCartItemIds.length > 0) {
    const selectedIds = new Set(selectedCartItems.map((cartItem) => cartItem.id));

    for (const cartItemId of selectedCartItemIds) {
      if (!selectedIds.has(cartItemId)) {
        throw new ApiError(404, "One or more selected cart items were not found");
      }
    }
  }

  if (selectedCartItems.length === 0) {
    throw new ApiError(400, "No cart items selected for submission");
  }

  return selectedCartItems.map((cartItem) => ({
    cartItem,
    quoteRecord: cartItem.quoteRecord,
  }));
}

async function validateCartQuoteRecordsForSubmission(cartQuoteRecords) {
  const items = [];

  for (const { cartItem, quoteRecord } of cartQuoteRecords) {
    if (
      quoteRecord.used_at ||
      (quoteRecord.expires_at &&
        new Date(quoteRecord.expires_at).getTime() <= Date.now())
    ) {
      throw new ApiError(400, "One or more quote tokens are invalid or expired");
    }

    if (
      quoteRecord.owner_user_id &&
      cartItem?.user_id &&
      Number(quoteRecord.owner_user_id) !== Number(cartItem.user_id)
    ) {
      throw new ApiError(403, "One or more quotes belong to another account");
    }

    await validateQuoteRecordForSubmission(quoteRecord);
    items.push(buildQuotePreviewItem({ cartItem, quoteRecord }));
  }

  return items;
}

function buildSubmissionPreview(items, draft = null) {
  const estimatedTotal = items.reduce(
    (sum, item) => sum + Number(item.estimatedCost || 0),
    0,
  );
  const currency = items[0]?.currency || "PHP";

  return {
    draft: draft
      ? {
          draftToken: draft.draft_token,
          source: draft.source,
          status: draft.status,
          expiresAt: draft.expires_at,
        }
      : null,
    items,
    itemCount: items.length,
    estimatedTotal,
    currency,
  };
}

async function previewPrintRequestSubmission({ clientId, body = {} }) {
  const cartQuoteRecords = await getActiveCartQuoteRecords({
    clientId,
    cartItemIds: body.cartItemIds,
  });
  const items = await validateCartQuoteRecordsForSubmission(cartQuoteRecords);

  return buildSubmissionPreview(items);
}

async function createRequestDraft({ clientId, body = {} }) {
  const selectedCartItemIds = normalizeCartItemIds(body.cartItemIds);
  const cartQuoteRecords = await getActiveCartQuoteRecords({
    clientId,
    cartItemIds: selectedCartItemIds,
  });

  await validateCartQuoteRecordsForSubmission(cartQuoteRecords);

  return createRequestDraftRecord({
    draftToken: generateRequestDraftToken(),
    userId: clientId,
    source: getDraftSource(selectedCartItemIds),
    cartItemIds: cartQuoteRecords.map(({ cartItem }) => cartItem.id),
    expiresAt: buildRequestDraftExpiresAt(),
  });
}

async function getValidRequestDraftForUser({ clientId, draftToken }) {
  const draft = await getRequestDraftByTokenForUser({
    draftToken,
    userId: clientId,
  });

  if (!draft) {
    throw new ApiError(404, "Request draft not found");
  }

  if (draft.status !== "active") {
    throw new ApiError(400, "Request draft is no longer active");
  }

  if (draft.expires_at && new Date(draft.expires_at).getTime() <= Date.now()) {
    throw new ApiError(410, "Request draft has expired");
  }

  return draft;
}

async function previewRequestDraft({ clientId, draftToken }) {
  const draft = await getValidRequestDraftForUser({ clientId, draftToken });
  const cartQuoteRecords = await getActiveCartQuoteRecords({
    clientId,
    cartItemIds: draft.cart_item_ids,
  });
  const items = await validateCartQuoteRecordsForSubmission(cartQuoteRecords);

  return buildSubmissionPreview(items, draft);
}

function formatCurrency(amount, currency = "PHP") {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function buildStatusHistoryNote({ fallback, note }) {
  return normalizeOptionalText(note) || fallback;
}

function getAllowedTransitionsForStatus(status) {
  return PRINT_REQUEST_STATUS_TRANSITIONS[status] || [];
}

function parseEventSnapshot(eventSnapshot) {
  return parseJsonSafely(eventSnapshot);
}

function getSnapshotCurrency(printRequest) {
  const quoteSnapshot = parseJsonSafely(printRequest.quote_snapshot);
  return (
    quoteSnapshot?.pricingConfigSnapshot?.currency ||
    quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

function buildPaymentSlipFileName(printRequest) {
  const reference = String(
    printRequest.reference_number || `request-${printRequest.id}`,
  )
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${reference}-payment-slip.pdf`;
}

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function wrapPdfText(value, maxLength = 76) {
  const words = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function buildPaymentSlipPdfBuffer({ printRequest, items = [], adminId }) {
  const currency = getSnapshotCurrency(printRequest);
  const printableItems =
    items.length > 0
      ? items
      : [
          {
            file_original_name: printRequest.file_original_name,
            material: printRequest.material,
            material_color_name: printRequest.material_color_name,
            print_quality: printRequest.print_quality,
            quantity: printRequest.quantity,
            confirmed_cost: printRequest.confirmed_cost,
            estimated_cost: printRequest.estimated_cost,
          },
        ];
  const amount = printableItems.reduce(
    (sum, item) =>
      sum + Number(item.confirmed_cost ?? item.estimated_cost ?? 0),
    0,
  );
  const generatedAt = new Date().toLocaleString();

  const commands = [];
  let y = 780;

  function text({ value, x = 54, size = 11, leading = 16, font = "F1" }) {
    commands.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(
        value,
      )}) Tj ET`,
    );
    y -= leading;
  }

  function line({ x1 = 54, y1 = y, x2 = 558, y2 = y }) {
    commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  text({ value: "UNIFAB", size: 24, leading: 28, font: "F2" });
  text({
    value: "USTP-CDO FABRICATION LABORATORY",
    size: 10,
    leading: 14,
  });
  text({
    value: "C.M. Recto Avenue, Lapasan, Cagayan de Oro City",
    size: 9,
    leading: 20,
  });
  line({ y1: y, y2: y });
  y -= 28;

  text({ value: "PAYMENT SLIP", size: 18, leading: 24, font: "F2" });
  text({
    value: `Reference No.: ${printRequest.reference_number || `#${printRequest.id}`}`,
    size: 11,
  });
  text({ value: `Generated: ${generatedAt}`, size: 10, leading: 26 });

  text({ value: "REQUEST DETAILS", size: 12, leading: 20, font: "F2" });
  printableItems.forEach((item, index) => {
    const material = [item.material, item.material_color_name]
      .filter(Boolean)
      .join(" / ");
    const itemTotal = formatCurrency(
      item.confirmed_cost ?? item.estimated_cost ?? 0,
      currency,
    );
    const label = `${index + 1}. ${item.file_original_name || "3D Model Printing Service"} | ${material || "-"} | ${item.print_quality || "-"} | Qty ${Number(item.quantity || 1)} | ${itemTotal}`;
    for (const lineValue of wrapPdfText(label, 82)) {
      text({ value: lineValue, size: 9, leading: 13 });
    }
  });
  y -= 14;

  line({ y1: y, y2: y });
  y -= 24;
  text({
    value: `Amount Due: ${formatCurrency(amount, currency)}`,
    size: 18,
    leading: 32,
    font: "F2",
  });

  text({ value: "PAYMENT INSTRUCTIONS", size: 12, leading: 20, font: "F2" });
  [
    "1. Present this PDF payment slip to the University Cashier.",
    "2. Pay the exact amount shown above.",
    "3. Bring the official physical receipt to the FabLab for in-person verification.",
  ].forEach((instruction) => {
    for (const lineValue of wrapPdfText(instruction, 82)) {
      text({ value: lineValue, size: 10 });
    }
  });

  y -= 54;
  commands.push("90 220 m 250 220 l S");
  commands.push("340 220 m 500 220 l S");
  commands.push(
    `BT /F1 9 Tf 1 0 0 1 104 204 Tm (${escapePdfText(
      "Student / Client Signature",
    )}) Tj ET`,
  );
  commands.push(
    `BT /F1 9 Tf 1 0 0 1 378 204 Tm (${escapePdfText(
      "Cashier Verification",
    )}) Tj ET`,
  );
  commands.push(
    `BT /F1 8 Tf 1 0 0 1 54 72 Tm (${escapePdfText(
      `Generated by admin ID ${Number(adminId)} through UniFab.`,
    )}) Tj ET`,
  );

  const content = `q
0.08 0.09 0.12 RG
0.5 w
${commands.join("\n")}
Q`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "utf-8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf-8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf-8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf-8");
}

async function generatePaymentSlipArtifact({ printRequest, items = [], adminId }) {
  await fs.promises.mkdir(PRINT_REQUEST_PAYMENT_SLIPS_ROOT, {
    recursive: true,
  });

  const fileName = buildPaymentSlipFileName(printRequest);
  const filePath = path.join(PRINT_REQUEST_PAYMENT_SLIPS_ROOT, fileName);
  const publicUrl = `/storage/print-requests/payment-slips/${fileName}`;

  await fs.promises.writeFile(
    filePath,
    buildPaymentSlipPdfBuffer({ printRequest, items, adminId }),
  );
  return publicUrl;
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
    const estimatedTotal = quoteRecords.reduce(
      (sum, item) => sum + Number(item.quoteRecord.estimated_cost || 0),
      0,
    );
    const aggregateQuoteSnapshot = {
      sourceType: firstQuote.source_type,
      itemCount: quoteRecords.length,
      estimatedCost: estimatedTotal,
      items: quoteRecords.map(({ quoteRecord }) => ({
        quoteRecordId: quoteRecord.id,
        sourceType: quoteRecord.source_type,
        material: quoteRecord.material,
        materialColorId: quoteRecord.material_color_id,
        materialColorName: quoteRecord.material_color_name,
        materialColorHex: quoteRecord.material_color_hex,
        printQuality: quoteRecord.print_quality,
        infill: Number(quoteRecord.infill),
        quantity: Number(quoteRecord.quantity),
        estimatedCost: Number(quoteRecord.estimated_cost),
        quote: parseJsonSafely(quoteRecord.quote_snapshot),
        pricingConfigSnapshot: parseJsonSafely(
          quoteRecord.pricing_config_snapshot,
        ),
        materialSnapshot: parseJsonSafely(quoteRecord.material_snapshot),
        createdAt: quoteRecord.created_at,
        expiresAt: quoteRecord.expires_at,
      })),
    };

    const printRequest = await createPrintRequest(
      {
        referenceNumber: generateReferenceNumber(),
        clientId,
        sourceType: firstQuote.source_type,
        designId: firstQuote.design_id,
        fileUrl: firstQuote.file_url,
        fileObjectId: firstQuote.file_object_id,
        fileOriginalName: firstQuote.file_original_name,
        fileMimeType: firstQuote.file_mime_type,
        fileSize: firstQuote.file_size,
        requestorName,
        contactNumber,
        collegeDepartment,
        purpose,
        designSnapshot: parseJsonSafely(firstQuote.design_snapshot),
        quoteToken: null,
        quoteSnapshot: aggregateQuoteSnapshot,
        material: firstQuote.material,
        materialColorId: firstQuote.material_color_id,
        materialColorName: firstQuote.material_color_name,
        materialColorHex: firstQuote.material_color_hex,
        printQuality: firstQuote.print_quality,
        infill: Number(firstQuote.infill),
        quantity: quoteRecords.reduce(
          (sum, item) => sum + Number(item.quoteRecord.quantity || 0),
          0,
        ),
        notes: normalizeOptionalText(body.notes),
        estimatedCost: estimatedTotal,
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
        {
          printRequestId: printRequest.id,
          sourceType: quoteRecord.source_type,
          designId: quoteRecord.design_id,
          fileUrl: quoteRecord.file_url,
          fileObjectId: quoteRecord.file_object_id,
          fileOriginalName: quoteRecord.file_original_name,
          fileMimeType: quoteRecord.file_mime_type,
          fileSize: quoteRecord.file_size,
          thumbnailUrl: quoteRecord.thumbnail_url,
          thumbnailFileObjectId: quoteRecord.thumbnail_file_object_id,
          designSnapshot: parseJsonSafely(quoteRecord.design_snapshot),
          quoteToken: null,
          quoteSnapshot: parseJsonSafely(quoteRecord.quote_snapshot),
          pricingConfigSnapshot: parseJsonSafely(
            quoteRecord.pricing_config_snapshot,
          ),
          materialSnapshot: parseJsonSafely(quoteRecord.material_snapshot),
          material: quoteRecord.material,
          materialColorId: quoteRecord.material_color_id,
          materialColorName: quoteRecord.material_color_name,
          materialColorHex: quoteRecord.material_color_hex,
          printQuality: quoteRecord.print_quality,
          infill: Number(quoteRecord.infill),
          quantity: Number(quoteRecord.quantity),
          estimatedCost: quoteRecord.estimated_cost,
          confirmedCost: null,
        },
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
  const itemCosts = Array.isArray(body.items)
    ? body.items.map((item) => ({
        itemId: Number(item.itemId),
        confirmedCost: normalizeOptionalMoney(
          item.confirmedCost,
          "Item confirmed cost",
        ),
      }))
    : [];

  const nextConfirmedCost =
    itemCosts.length > 0
      ? itemCosts.reduce((sum, item) => sum + Number(item.confirmedCost), 0)
      : (parsedConfirmedCost !== undefined
          ? parsedConfirmedCost
          : existingPrintRequest.confirmed_cost);

  if (nextStatus === PRINT_REQUEST_STATUSES.PAYMENT_SLIP_ISSUED && nextConfirmedCost == null) {
    throw new ApiError(
      400,
      "Confirmed cost must be provided when issuing a payment slip.",
    );
  }

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

  let nextPaymentSlipUrl = existingPrintRequest.payment_slip_url;
  let nextPaymentSlipFileObjectId =
    existingPrintRequest.payment_slip_file_object_id;
  let nextPaymentSlipGeneratedAt = existingPrintRequest.payment_slip_generated_at;
  let nextPaymentSlipGeneratedBy = existingPrintRequest.payment_slip_generated_by;

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

    nextPaymentSlipUrl = await generatePaymentSlipArtifact({
      printRequest: {
        ...existingPrintRequest,
        confirmed_cost: nextConfirmedCost,
      },
      items: paymentSlipItems,
      adminId,
    });
    const paymentSlipPath =
      getManagedPrintRequestPaymentSlipAbsolutePath(nextPaymentSlipUrl);
    const paymentSlipFileObject = paymentSlipPath
      ? await registerManagedPublicPath({
          publicPath: nextPaymentSlipUrl,
          originalFileName: path.basename(paymentSlipPath),
          mimeType: "application/pdf",
          visibility: "private",
          createdBy: adminId,
          dedupe: false,
        })
      : null;
    nextPaymentSlipFileObjectId = paymentSlipFileObject?.id || null;
    nextPaymentSlipGeneratedAt = new Date();
    nextPaymentSlipGeneratedBy = adminId;
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
      {
        status: nextStatus,
        rejectionReason: nextRejectionReason,
        confirmedCost: nextConfirmedCost,
        paymentSlipUrl: nextPaymentSlipUrl,
        paymentSlipFileObjectId: nextPaymentSlipFileObjectId,
        paymentSlipGeneratedAt: nextPaymentSlipGeneratedAt,
        paymentSlipGeneratedBy: nextPaymentSlipGeneratedBy,
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
      },
      connection,
    );
    if (nextPaymentSlipFileObjectId) {
      await attachManagedFileReference({
        fileObjectId: nextPaymentSlipFileObjectId,
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
      nextPaymentSlipUrl &&
      nextPaymentSlipUrl !== existingPrintRequest.payment_slip_url
    ) {
      if (nextPaymentSlipFileObjectId) {
        await markFileObjectDeleted({
          fileObjectId: nextPaymentSlipFileObjectId,
          actorId: adminId,
          reason: "Removed payment slip after failed status transaction.",
          deletePhysical: true,
        });
      } else {
        await removeManagedPrintRequestPaymentSlipFile(nextPaymentSlipUrl);
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
  previewPrintRequestSubmission,
  submitRequestDraft,
  submitPrintRequest,
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
