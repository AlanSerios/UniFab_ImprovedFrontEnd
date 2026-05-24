import { API_BASE_URL } from "../api/client";
import { formatMoney } from "./display-format";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const STATUS_LABELS = {
  pending_review: "Pending Review",
  design_in_progress: "Design in Progress",
  approved: "Approved",
  payment_slip_issued: "Payment Slip Issued",
  payment_verified: "Payment Verified",
  printing: "Printing",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const EMPTY_STATUS_FORM = {
  status: "",
  note: "",
  rejectionReason: "",
  confirmedCost: "",
  itemCosts: {},
  receiptReferenceNumber: "",
  receiptVerificationNote: "",
};

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getSnapshotCurrency(printRequest) {
  return (
    printRequest?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    printRequest?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

export { formatMoney };

export function getPathExtension(value) {
  if (!value) return null;

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}

export function eventLabel(event) {
  if (event.eventType === "correction") {
    return `Correction: ${STATUS_LABELS[event.fromStatus] || event.fromStatus} to ${
      STATUS_LABELS[event.toStatus] || event.toStatus
    }`;
  }

  return `${STATUS_LABELS[event.fromStatus] || event.fromStatus || "Created"} to ${
    STATUS_LABELS[event.toStatus] || event.toStatus
  }`;
}

export function extractPrintRequestDetailPayload(data) {
  return {
    printRequest:
      data.data?.printRequest || data.printRequest || data.request || data,
    statusHistory: data.data?.statusHistory || data.statusHistory || [],
    events: data.data?.events || data.events || [],
    items: data.data?.items || data.items || [],
  };
}

export function buildInitialStatusForm(printRequest) {
  return {
    ...EMPTY_STATUS_FORM,
    confirmedCost: printRequest?.confirmedCost || printRequest?.estimatedCost || "",
  };
}

export function buildResetStatusForm(printRequest) {
  return {
    ...EMPTY_STATUS_FORM,
    confirmedCost: printRequest?.confirmedCost || "",
  };
}

export function buildStatusUpdatePayload({ statusForm, items }) {
  const payload = {
    status: statusForm.status,
    note: statusForm.note,
  };

  if (statusForm.status === "rejected") {
    payload.rejectionReason = statusForm.rejectionReason;
  }

  if (statusForm.confirmedCost !== "") {
    payload.confirmedCost = statusForm.confirmedCost;
  }

  if (statusForm.status === "payment_slip_issued" && items.length > 0) {
    payload.items = items.map((item) => ({
      itemId: item.id,
      confirmedCost:
        statusForm.itemCosts[item.id] ??
        item.confirmedCost ??
        item.estimatedCost,
    }));
  }

  if (statusForm.status === "payment_verified") {
    payload.receiptReferenceNumber = statusForm.receiptReferenceNumber;
    payload.receiptVerificationNote = statusForm.receiptVerificationNote;
  }

  return payload;
}
