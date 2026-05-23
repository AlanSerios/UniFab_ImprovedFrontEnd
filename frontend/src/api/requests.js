import { apiBlobRequest, apiRequest } from "./client";

export function getMyPrintRequests() {
  return apiRequest("/requests");
}

export function getPrintRequestById(requestId) {
  return apiRequest(`/requests/${requestId}`);
}

export function getAdminPrintRequests(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();

  return apiRequest(`/requests/admin${queryString ? `?${queryString}` : ""}`);
}

export function updateAdminPrintRequestStatus(requestId, payload) {
  return apiRequest(`/requests/admin/${requestId}/status`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function undoAdminPrintRequestStatus(requestId, payload) {
  return apiRequest(`/requests/admin/${requestId}/undo`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitPrintRequestFromCart(payload = {}) {
  return apiRequest("/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function previewPrintRequestSubmission(payload = {}) {
  return apiRequest("/requests/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createRequestDraft(payload = {}) {
  return apiRequest("/requests/drafts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRequestDraftPreview(draftToken) {
  return apiRequest(`/requests/drafts/${draftToken}/preview`);
}

export function submitRequestDraft(draftToken, payload = {}) {
  return apiRequest(`/requests/drafts/${draftToken}/submit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminPrintRequestModel(requestId, options = {}) {
  const searchParams = new URLSearchParams();

  if (options.download) {
    searchParams.set("download", "true");
  }

  const queryString = searchParams.toString();
  return apiBlobRequest(
    `/requests/admin/${requestId}/model${queryString ? `?${queryString}` : ""}`,
  );
}

export async function fetchAdminPrintRequestItemModel(
  requestId,
  itemId,
  options = {},
) {
  const searchParams = new URLSearchParams();

  if (options.download) {
    searchParams.set("download", "true");
  }

  const queryString = searchParams.toString();
  return apiBlobRequest(
    `/requests/admin/${requestId}/items/${itemId}/model${
      queryString ? `?${queryString}` : ""
    }`,
  );
}

export function cancelPrintRequest(requestId, payload) {
  return apiRequest(`/requests/${requestId}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function archiveAdminPrintRequest(requestId) {
  return apiRequest(`/requests/admin/${requestId}/archive`, {
    method: "PATCH",
  });
}

export function deleteAdminPrintRequest(requestId) {
  return apiRequest(`/requests/admin/${requestId}`, {
    method: "DELETE",
  });
}

