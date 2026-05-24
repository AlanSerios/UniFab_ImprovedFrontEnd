import { ApiError } from "./api-error.js";

export function parseReferenceTypes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function requireCleanupReason(body = {}) {
  const reason = String(body.reason || "").trim();

  if (!reason) {
    throw new ApiError(400, "Cleanup reason is required");
  }

  return reason;
}

export function buildFileRegistryCleanupOptions(req, { dryRun }) {
  const options = {
    dryRun,
    actorId: req.user?.id || null,
    limit: req.body?.limit,
    retentionPolicy: req.body?.retentionPolicy,
    referenceTypes: parseReferenceTypes(req.body?.referenceTypes),
  };

  if (!dryRun) {
    options.reason = requireCleanupReason(req.body);
  }

  return options;
}

export function buildDesignFileCleanupOptions(req, { dryRun }) {
  const options = {
    dryRun,
    actorId: req.user?.id || null,
    limit: req.body?.limit,
    retentionDays: req.body?.retentionDays,
    mmfRetentionDays: req.body?.mmfRetentionDays,
  };

  if (!dryRun) {
    options.reason = requireCleanupReason(req.body);
  }

  return options;
}

export function buildDatabaseRetentionCleanupOptions(req, { dryRun }) {
  if (!dryRun) {
    requireCleanupReason(req.body);
  }

  return {
    dryRun,
    limit: req.body?.limit,
    fileAccessEventRetentionDays: req.body?.fileAccessEventRetentionDays,
    moderationRetentionDays: req.body?.moderationRetentionDays,
    designAuditRetentionDays: req.body?.designAuditRetentionDays,
    printRequestEventRetentionDays: req.body?.printRequestEventRetentionDays,
  };
}
