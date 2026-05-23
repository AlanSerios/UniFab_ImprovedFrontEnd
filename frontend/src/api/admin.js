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

export function getAdminDashboardMetrics() {
  return apiRequest("/admin/dashboard");
}

export function getAdminUsers(params = {}) {
  return apiRequest(`/admin/users${buildQueryString(params)}`);
}

export function updateAdminUser(userId, payload) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getAdminAuditEvents(params = {}) {
  return apiRequest(`/admin/audit${buildQueryString(params)}`);
}

export function getAdminContent() {
  return apiRequest("/admin/content");
}

export function updateAdminContent(contentKey, payload) {
  return apiRequest(`/admin/content/${contentKey}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
