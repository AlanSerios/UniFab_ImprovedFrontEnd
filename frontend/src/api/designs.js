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

export function getLocalDesignById(designId) {
  return apiRequest(`/designs/local/${designId}`);
}

export function getMmfDesignByObjectId(objectId) {
  return apiRequest(`/designs/mmf/${objectId}`);
}

export function getAdminLocalDesigns(params = {}) {
  return apiRequest(`/designs/admin/local${buildQueryString(params)}`);
}

export function getAdminLocalDesignById(designId) {
  return apiRequest(`/designs/admin/local/${designId}`);
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

export function getAdminDesignOverrides() {
  return apiRequest("/designs/admin/overrides");
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

export function getMyDesigns(params = {}) {
  return apiRequest(`/designs/my${buildQueryString(params)}`);
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

export function updateAdminLocalDesignPrintReady(designId, payload) {
  return apiRequest(`/designs/admin/local/${designId}/print-ready`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
