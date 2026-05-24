import { formatMoney } from "./display-format";

export function extractPrintRequests(data) {
  return data.data?.printRequests || data.printRequests || [];
}

export function getRequestReference(request) {
  return request.referenceNumber || `#${request.id}`;
}

export function getRequestFileName(request) {
  return request.fileOriginalName || "Model file";
}

export function getRequestItemCount(request) {
  return request.itemCount || 1;
}

export function getRequestMaterialLabel(request) {
  return [request.material, request.materialColorName].filter(Boolean).join(" / ");
}

export function getRequestCurrency(request) {
  return (
    request?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    request?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

export function formatRequestCost(request) {
  return formatMoney(request.estimatedCost, getRequestCurrency(request));
}
