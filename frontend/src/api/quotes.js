import { apiRequest } from "./client";

export function calculateUploadQuote(formData) {
  return apiRequest("/quotes/calculate", {
    method: "POST",
    body: formData,
  });
}

export function recalculateUploadQuote(quoteToken, payload) {
  return apiRequest(`/quotes/${quoteToken}/recalculate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getQuoteByToken(quoteToken) {
  return apiRequest(`/quotes/${quoteToken}`);
}

export function calculateLocalDesignQuote(designId, payload) {
  return apiRequest(`/quotes/local-designs/${designId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function calculateMmfDesignQuote(objectId, payload) {
  return apiRequest(`/quotes/mmf/${objectId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cleanupExpiredQuotes(limit = 100) {
  return apiRequest(`/quotes/expired?limit=${encodeURIComponent(limit)}`, {
    method: "DELETE",
  });
}

export function getQuoteReadiness() {
  return apiRequest("/quotes/admin/readiness");
}

export function getQuoteDiagnostics({ limit = 50, offset = 0, status } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (status) {
    params.set("status", status);
  }

  return apiRequest(`/quotes/admin/diagnostics?${params.toString()}`);
}
