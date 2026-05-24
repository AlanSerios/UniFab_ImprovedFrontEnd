import { assetUrl } from "./model-preview";
import { formatDateTime, formatMoney } from "./display-format";

export const PRINT_REQUEST_STEPS = [
  { id: "pending_review", name: "Submitted" },
  { id: "payment_slip_issued", name: "Awaiting Payment" },
  { id: "payment_verified", name: "Payment Verified" },
  { id: "printing", name: "Printing" },
  { id: "completed", name: "Completed" },
  { id: "cancelled", name: "Cancelled" },
];

export function extractPrintRequestDetail(data) {
  return {
    printRequest:
      data.data?.printRequest || data.printRequest || data.request || data,
    statusHistory: data.data?.statusHistory || data.statusHistory || [],
    items: data.data?.items || data.items || [],
  };
}

export function extractCancelledPrintRequest(data) {
  return {
    printRequest: data.data?.printRequest || data.printRequest,
    statusHistory: data.data?.statusHistory || data.statusHistory || [],
    items: data.data?.items || data.items || [],
  };
}

export function getSnapshotCurrency(printRequest) {
  return (
    printRequest?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    printRequest?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

export { formatDateTime, formatMoney };

export function getPrintRequestStepperStatus(status) {
  if (status === "rejected" || status === "cancelled") return status;
  if (status === "approved") return "pending_review";
  return status;
}

export function getPaymentSlipUrl(printRequest) {
  return assetUrl(printRequest?.paymentSlipUrl);
}

export function buildRequestItemPreviewSource(item) {
  return {
    ...item,
    snapshotUrl: item.thumbnailUrl,
    fileName:
      item.fileOriginalName ||
      item.originalFileName ||
      item.designSnapshot?.title ||
      "Model item",
  };
}

export function getRequestItemTitle(item) {
  return item.fileOriginalName || item.designSnapshot?.title || "Model item";
}

export function canClientCancelPrintRequest(status) {
  return ["pending_review", "design_in_progress"].includes(status);
}

export function hasVerifiedPayment(status) {
  return ["payment_verified", "printing", "completed"].includes(status);
}
