import { apiRequest } from "./client";

export function getHealthcheck() {
  return apiRequest("/healthcheck");
}

export function getDatabaseHealthMetrics() {
  return apiRequest("/healthcheck/database");
}
