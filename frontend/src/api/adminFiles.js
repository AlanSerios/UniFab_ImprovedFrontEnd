import { apiRequest } from "./client";

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

export function getAdminFileRegistrySummary() {
  return apiRequest("/admin/files/summary");
}

export function getAdminFileObjects(params = {}) {
  return apiRequest(`/admin/files/objects${buildQueryString(params)}`);
}

export function getAdminFileObjectDetail(fileObjectId) {
  return apiRequest(`/admin/files/objects/${fileObjectId}`);
}

export function dryRunAdminFileRegistryCleanup(payload = {}) {
  return apiRequest("/admin/files/cleanup/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runAdminFileRegistryCleanup(payload = {}) {
  return apiRequest("/admin/files/cleanup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function dryRunAdminDesignFileCleanup(payload = {}) {
  return apiRequest("/admin/files/design-cleanup/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runAdminDesignFileCleanup(payload = {}) {
  return apiRequest("/admin/files/design-cleanup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function dryRunAdminRetentionCleanup(payload = {}) {
  return apiRequest("/admin/files/retention-cleanup/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runAdminRetentionCleanup(payload = {}) {
  return apiRequest("/admin/files/retention-cleanup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
