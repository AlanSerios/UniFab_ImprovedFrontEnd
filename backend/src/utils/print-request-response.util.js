import { PRINT_REQUEST_STATUS_TRANSITIONS } from "../constants/print-request.constants.js";
import {
  buildInlineManagedFileDownloadUrl,
  buildManagedFileDownloadUrl,
} from "./managed-file-response.util.js";

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

function getAllowedTransitionsForStatus(status) {
  return PRINT_REQUEST_STATUS_TRANSITIONS[status] || [];
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
    fileUrl: buildInlineManagedFileDownloadUrl(
      printRequest.file_object_id,
      printRequest.file_url,
    ),
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
    paymentSlipUrl: buildManagedFileDownloadUrl(
      printRequest.payment_slip_file_object_id,
      printRequest.payment_slip_url,
    ),
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
    fileUrl: buildInlineManagedFileDownloadUrl(
      item.file_object_id,
      item.file_url,
    ),
    fileOriginalName: item.file_original_name,
    fileMimeType: item.file_mime_type,
    fileSize: item.file_size,
    thumbnailFileObjectId: item.thumbnail_file_object_id,
    thumbnailUrl: buildInlineManagedFileDownloadUrl(
      item.thumbnail_file_object_id,
      item.thumbnail_url,
    ),
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

export {
  normalizePrintRequest,
  normalizePrintRequestEvent,
  normalizePrintRequestItem,
  normalizeRequestDraft,
  normalizeStatusHistory,
};
