import { ApiError } from "./api-error.js";

export function parseAdminJsonMetadata(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseOptionalBooleanField(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;

  throw new ApiError(400, `${fieldName} must be a valid boolean`);
}

export function buildPagination({ page, limit, totalCount }) {
  return {
    page,
    limit,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / limit), 1),
  };
}

export function normalizeAdminUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    email: row.email,
    userType: row.user_type,
    isAdmin: Boolean(row.is_admin),
    isEmailVerified: Boolean(row.is_email_verified),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeAdminAuditEvent(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorName: [row.actor_first_name, row.actor_last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: parseAdminJsonMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

export function normalizeSiteContent(row) {
  return {
    id: row.id,
    contentKey: row.content_key,
    title: row.title,
    body: row.body,
    metadata: parseAdminJsonMetadata(row.metadata),
    updatedBy: row.updated_by,
    updatedByEmail: row.updated_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
