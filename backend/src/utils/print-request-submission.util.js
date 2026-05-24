import {
  PRINT_REQUEST_STATUSES,
  PRINT_REQUEST_TERMS_VERSION,
} from "../constants/print-request.constants.js";

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

function getSubmissionQuoteTotals(quoteRecords) {
  return {
    estimatedTotal: quoteRecords.reduce(
      (sum, item) => sum + Number(item.quoteRecord.estimated_cost || 0),
      0,
    ),
    quantityTotal: quoteRecords.reduce(
      (sum, item) => sum + Number(item.quoteRecord.quantity || 0),
      0,
    ),
  };
}

function buildAggregateQuoteSnapshot({ quoteRecords, estimatedTotal }) {
  const firstQuote = quoteRecords[0].quoteRecord;

  return {
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
}

function buildPrintRequestCreatePayload({
  quoteRecords,
  referenceNumber,
  clientId,
  requestorName,
  contactNumber,
  collegeDepartment,
  purpose,
  notes,
  estimatedTotal,
  quantityTotal,
  termsAcceptedAt,
}) {
  const firstQuote = quoteRecords[0].quoteRecord;

  return {
    referenceNumber,
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
    quoteSnapshot: buildAggregateQuoteSnapshot({
      quoteRecords,
      estimatedTotal,
    }),
    material: firstQuote.material,
    materialColorId: firstQuote.material_color_id,
    materialColorName: firstQuote.material_color_name,
    materialColorHex: firstQuote.material_color_hex,
    printQuality: firstQuote.print_quality,
    infill: Number(firstQuote.infill),
    quantity: quantityTotal,
    notes,
    estimatedCost: estimatedTotal,
    confirmedCost: null,
    paymentSlipUrl: null,
    receiptUrl: null,
    receiptOriginalName: null,
    receiptMimeType: null,
    receiptSize: null,
    receiptUploadedAt: null,
    termsAcceptedAt,
    termsVersion: PRINT_REQUEST_TERMS_VERSION,
    status: PRINT_REQUEST_STATUSES.PENDING_REVIEW,
    rejectionReason: null,
  };
}

function buildPrintRequestItemPayload({ printRequestId, quoteRecord }) {
  return {
    printRequestId,
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
  };
}

export {
  buildAggregateQuoteSnapshot,
  buildPrintRequestCreatePayload,
  buildPrintRequestItemPayload,
  getSubmissionQuoteTotals,
};
