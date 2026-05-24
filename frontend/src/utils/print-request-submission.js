import { formatMoney } from "./display-format";

export function isExpired(item) {
  return item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
}

export function extractSubmissionPreview(data) {
  return data.data?.preview || data.preview || data;
}

export function extractCreatedPrintRequest(data) {
  return data.data?.printRequest || data.printRequest;
}

export function calculateSubmissionSubtotal({ preview, items }) {
  return (
    preview?.estimatedTotal ??
    items.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)
  );
}

export { formatMoney };

export function buildRequestItemPreviewSource(item) {
  return {
    ...item,
    snapshotUrl: item.thumbnailUrl,
    fileName: item.fileOriginalName || item.originalFileName || item.label,
  };
}

export function getStepStatus({ number, currentStep }) {
  const status =
    number < currentStep
      ? "Completed"
      : number === currentStep
        ? "In progress"
        : "Pending";

  return {
    status,
    className:
      status === "Completed"
        ? "is-completed"
        : status === "In progress"
          ? "is-current"
          : "is-pending",
  };
}
