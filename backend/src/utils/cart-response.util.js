import { buildInlineManagedFileDownloadUrl } from "./managed-file-response.util.js";

function parseJsonSafely(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isExpired(quoteRecord) {
  return quoteRecord.expires_at
    ? new Date(quoteRecord.expires_at).getTime() <= Date.now()
    : false;
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

function buildCartPreviewItem(cartItem) {
  const quoteRecord = cartItem.quoteRecord;
  const thumbnailUrl = buildInlineManagedFileDownloadUrl(
    quoteRecord.thumbnail_file_object_id,
    quoteRecord.thumbnail_url,
  );
  const fileUrl = buildInlineManagedFileDownloadUrl(
    quoteRecord.file_object_id,
    quoteRecord.file_url,
  );

  return {
    id: cartItem.id,
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
    addedAt: cartItem.created_at,
    isExpired: isExpired(quoteRecord),
    isSubmitted: Boolean(quoteRecord.used_at),
    designSnapshot: parseJsonSafely(quoteRecord.design_snapshot),
    quoteSnapshot: parseJsonSafely(quoteRecord.quote_snapshot),
  };
}

function summarizeCart(items) {
  const estimatedTotal = items.reduce(
    (sum, item) => sum + Number(item.estimatedCost || 0),
    0,
  );

  return {
    items,
    itemCount: items.length,
    estimatedTotal,
    currency: items[0]?.currency || "PHP",
  };
}

export { buildCartPreviewItem, summarizeCart };
