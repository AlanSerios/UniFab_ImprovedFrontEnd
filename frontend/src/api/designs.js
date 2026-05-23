import { apiRequest } from "./client";

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

export function searchDesignLibrary(params = {}) {
  return apiRequest(`/designs${buildQueryString(params)}`);
}

export function getDesignTaxonomy() {
  return apiRequest("/designs/taxonomy");
}

export function getAdminDesignTaxonomy() {
  return apiRequest("/designs/admin/taxonomy");
}

export function createAdminDesignCategory(payload) {
  return apiRequest("/designs/admin/taxonomy/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminDesignCategory(categoryId, payload) {
  return apiRequest(`/designs/admin/taxonomy/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminDesignTag(payload) {
  return apiRequest("/designs/admin/taxonomy/tags", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminDesignTag(tagId, payload) {
  return apiRequest(`/designs/admin/taxonomy/tags/${tagId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getLocalDesignById(designId) {
  return apiRequest(`/designs/local/${designId}`);
}

export function getMmfDesignByObjectId(objectId) {
  return apiRequest(`/designs/mmf/${objectId}`);
}

export function getAdminLocalDesigns(params = {}) {
  return apiRequest(`/designs/admin/local${buildQueryString(params)}`);
}

export function getAdminLabDesigns(params = {}) {
  return getAdminLocalDesigns({ ...params, sourceKind: "lab" });
}

export function getAdminLocalDesignById(designId) {
  return apiRequest(`/designs/admin/local/${designId}`);
}

export function updateAdminLocalDesignCuration(designId, payload) {
  return apiRequest(`/designs/admin/local/${designId}/library-curation`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminLocalDesign(formData) {
  return apiRequest("/designs/local", {
    method: "POST",
    body: formData,
  });
}

export function updateAdminLocalDesign(designId, formData) {
  return apiRequest(`/designs/local/${designId}`, {
    method: "PATCH",
    body: formData,
  });
}

export function deactivateAdminLocalDesign(designId) {
  return apiRequest(`/designs/local/${designId}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export function archiveAdminLocalDesign(designId) {
  return apiRequest(`/designs/admin/local/${designId}/archive`, {
    method: "PATCH",
  });
}

export function deleteAdminLocalDesign(designId) {
  return apiRequest(`/designs/admin/local/${designId}`, {
    method: "DELETE",
  });
}

export function getAdminDesignOverrides(params = {}) {
  return apiRequest(`/designs/admin/overrides${buildQueryString(params)}`);
}

export function createAdminDesignOverride(payload) {
  return apiRequest("/designs/admin/overrides", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminDesignOverride(overrideId, payload) {
  return apiRequest(`/designs/admin/overrides/${overrideId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminDesignOverride(overrideId) {
  return apiRequest(`/designs/admin/overrides/${overrideId}`, {
    method: "DELETE",
  });
}

export function getAdminMmfOAuthStatus() {
  return apiRequest("/designs/admin/mmf/oauth/status");
}

export function startAdminMmfOAuth() {
  return apiRequest("/designs/admin/mmf/oauth/start");
}

export function disconnectAdminMmfOAuth() {
  return apiRequest("/designs/admin/mmf/oauth/disconnect", {
    method: "POST",
  });
}

export function inspectAdminMmfFiles(objectId) {
  return apiRequest(`/designs/admin/mmf/${objectId}/files`);
}

export function removeAdminMmfPrintReadyFile(objectId) {
  return apiRequest(`/designs/admin/mmf/${objectId}/print-ready-file`, {
    method: "DELETE",
  });
}

export function getMyDesigns(params = {}) {
  return apiRequest(`/designs/my${buildQueryString(params)}`);
}

export function getSavedDesigns() {
  return apiRequest("/designs/saved");
}

export function saveDesign(designId) {
  return apiRequest(`/designs/${designId}/save`, {
    method: "POST",
  });
}

export function unsaveDesign(designId) {
  return apiRequest(`/designs/${designId}/save`, {
    method: "DELETE",
  });
}

export function createMyDesignDraft(formData) {
  return apiRequest("/designs/my", {
    method: "POST",
    body: formData,
  });
}

export function updateMyDesign(designId, formData) {
  return apiRequest(`/designs/my/${designId}`, {
    method: "PATCH",
    body: formData,
  });
}

export function deleteMyDesign(designId, payload = {}) {
  return apiRequest(`/designs/my/${designId}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export function publishMyDesign(designId) {
  return apiRequest(`/designs/my/${designId}/publish`, {
    method: "PATCH",
  });
}

export function moderateAdminLocalDesign(designId, payload) {
  return apiRequest(`/designs/admin/local/${designId}/moderate`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function recheckAdminLocalDesign(designId) {
  return apiRequest(`/designs/admin/local/${designId}/recheck`, {
    method: "PATCH",
  });
}

export function updateAdminLocalDesignPrintReady(designId, payload) {
  return apiRequest(`/designs/admin/local/${designId}/print-ready`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
