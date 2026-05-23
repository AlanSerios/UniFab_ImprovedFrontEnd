import fs from "fs";
import pool from "../db/db.js";
import {
  countActiveFileReferences,
  createFileEvent,
  getFileObjectAccessContext,
  markFileObjectStorageStatus,
} from "../models/file-registry.model.js";
import { getAbsolutePathForStorageKey } from "./file-storage.service.js";

const DEFAULT_CLEANUP_LIMIT = 250;
const MAX_CLEANUP_LIMIT = 5000;
const DEFAULT_RETENTION_DAYS = {
  quote: 7,
  design: 180,
  request: 365,
};

const CLEANUP_STORAGE_STATUSES = [
  "present",
  "delete_pending",
  "delete_failed",
  "missing",
];
const PROTECTED_REFERENCE_TYPES = new Set(["slicer_profile"]);
const PROTECTED_FILE_ROLES = new Set(["payment_slip", "slicer_profile"]);
const DESIGN_REFERENCE_TYPES = new Set([
  "local_design",
  "local_design_file",
  "local_design_image",
  "local_design_moderation_render",
  "mmf_print_ready_file",
]);
const REQUEST_REFERENCE_TYPES = new Set(["print_request", "print_request_item"]);
const ALLOWED_REFERENCE_FILTERS = new Set([
  "quote_record",
  "quote_asset",
  "local_design",
  "local_design_file",
  "local_design_image",
  "local_design_moderation_render",
  "mmf_print_ready_file",
  "print_request",
  "print_request_item",
]);

function clampPositiveInteger(value, fallback, { min = 1, max = MAX_CLEANUP_LIMIT } = {}) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeFileObject(row) {
  if (!row) return null;

  return {
    id: row.id,
    storageProvider: row.storage_provider,
    storageKey: row.storage_key,
    publicPath: row.public_path,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    extension: row.extension,
    fileSize: Number(row.file_size || 0),
    checksumSha256: row.checksum_sha256,
    visibility: row.visibility,
    storageStatus: row.storage_status,
    createdBy: row.created_by,
    createdByName: [row.created_by_first_name, row.created_by_last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    createdByEmail: row.created_by_email,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deleteReason: row.delete_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeReferenceCount: Number(row.active_reference_count || 0),
    referenceCount: Number(row.reference_count || 0),
    referenceTypes: row.reference_types ? String(row.reference_types).split(",") : [],
    fileRoles: row.file_roles ? String(row.file_roles).split(",") : [],
    downloadUrl: `/api/v1/files/${row.id}/download?download=1`,
  };
}

function normalizeReference(row) {
  if (!row) return null;

  return {
    id: row.id,
    fileObjectId: row.file_object_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    referenceColumn: row.reference_column,
    fileRole: row.file_role,
    ownerUserId: row.owner_user_id,
    ownerName: [row.owner_first_name, row.owner_last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    ownerEmail: row.owner_email,
    visibility: row.visibility,
    status: row.status,
    metadata: row.metadata,
    attachedAt: row.attached_at,
    detachedAt: row.detached_at,
    detachReason: row.detach_reason,
  };
}

function normalizeEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    fileObjectId: row.file_object_id,
    fileReferenceId: row.file_reference_id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorName: [row.actor_first_name, row.actor_last_name]
      .filter(Boolean)
      .join(" ")
      .trim(),
    actorEmail: row.actor_email,
    summary: row.summary,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;

  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(row.created_at).toISOString(),
      id: Number(row.id),
    }),
  ).toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const id = Number(parsed.id);
    const createdAt = new Date(parsed.createdAt);

    if (!Number.isInteger(id) || id < 1 || Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt, id };
  } catch {
    return null;
  }
}

function normalizeRetentionPolicy(policy = {}) {
  return {
    quoteDays: clampPositiveInteger(
      policy.quoteDays ?? policy.quoteRetentionDays,
      DEFAULT_RETENTION_DAYS.quote,
      { max: 3650 },
    ),
    designDays: clampPositiveInteger(
      policy.designDays ?? policy.designRetentionDays,
      DEFAULT_RETENTION_DAYS.design,
      { max: 3650 },
    ),
    requestDays: clampPositiveInteger(
      policy.requestDays ?? policy.requestRetentionDays,
      DEFAULT_RETENTION_DAYS.request,
      { max: 3650 },
    ),
  };
}

function normalizeReferenceTypes(referenceTypes) {
  if (!Array.isArray(referenceTypes) || referenceTypes.length === 0) {
    return [];
  }

  return referenceTypes
    .map((value) => String(value || "").trim())
    .filter((value) => ALLOWED_REFERENCE_FILTERS.has(value));
}

function buildCutoff(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isBeforeCutoff(value, cutoff) {
  if (!value) return false;
  return new Date(value).getTime() <= cutoff.getTime();
}

function getReferenceAgeDate(reference, fileObject) {
  return reference.detached_at || reference.attached_at || fileObject.createdAt;
}

async function getFileRegistrySummary() {
  const [
    [statusRows],
    [visibilityRows],
    [referenceRows],
    [totalsRows],
    [domainRows],
  ] = await Promise.all([
    pool.query(
      `
        SELECT storage_status, COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS bytes
        FROM file_objects
        GROUP BY storage_status
        ORDER BY storage_status
      `,
    ),
    pool.query(
      `
        SELECT visibility, COUNT(*) AS count, COALESCE(SUM(file_size), 0) AS bytes
        FROM file_objects
        GROUP BY visibility
        ORDER BY visibility
      `,
    ),
    pool.query(
      `
        SELECT status, COUNT(*) AS count
        FROM file_references
        GROUP BY status
        ORDER BY status
      `,
    ),
    pool.query(
      `
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(file_size), 0) AS total_bytes,
          SUM(storage_status = 'present') AS present_count,
          SUM(storage_status = 'delete_pending') AS delete_pending_count,
          SUM(storage_status = 'missing') AS missing_count,
          SUM(storage_status = 'deleted') AS deleted_count,
          SUM(visibility = 'private') AS private_count,
          SUM(visibility = 'public') AS public_count
        FROM file_objects
      `,
    ),
    pool.query(
      `
        SELECT reference_type, status, COUNT(*) AS count
        FROM file_references
        GROUP BY reference_type, status
        ORDER BY reference_type, status
      `,
    ),
  ]);

  const totals = totalsRows[0] || {};

  return {
    totals: {
      totalCount: Number(totals.total_count || 0),
      totalBytes: Number(totals.total_bytes || 0),
      presentCount: Number(totals.present_count || 0),
      deletePendingCount: Number(totals.delete_pending_count || 0),
      missingCount: Number(totals.missing_count || 0),
      deletedCount: Number(totals.deleted_count || 0),
      privateCount: Number(totals.private_count || 0),
      publicCount: Number(totals.public_count || 0),
    },
    byStorageStatus: statusRows.map((row) => ({
      storageStatus: row.storage_status,
      count: Number(row.count || 0),
      bytes: Number(row.bytes || 0),
    })),
    byVisibility: visibilityRows.map((row) => ({
      visibility: row.visibility,
      count: Number(row.count || 0),
      bytes: Number(row.bytes || 0),
    })),
    byReferenceStatus: referenceRows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0),
    })),
    byReferenceType: domainRows.map((row) => ({
      referenceType: row.reference_type,
      status: row.status,
      count: Number(row.count || 0),
    })),
  };
}

async function listFileObjects(filters = {}) {
  const page = clampPositiveInteger(filters.page, 1, { max: 100000 });
  const limit = clampPositiveInteger(filters.limit, 25, { max: 100 });
  const cursor = decodeCursor(filters.cursor);
  const offset = cursor ? 0 : (page - 1) * limit;
  const where = [];
  const params = [];

  if (filters.storageStatus) {
    where.push("fo.storage_status = ?");
    params.push(filters.storageStatus);
  }

  if (filters.visibility) {
    where.push("fo.visibility = ?");
    params.push(filters.visibility);
  }

  if (filters.extension) {
    where.push("fo.extension = ?");
    params.push(filters.extension);
  }

  if (filters.checksum) {
    where.push("fo.checksum_sha256 = ?");
    params.push(filters.checksum);
  }

  if (filters.ownerUserId) {
    where.push(
      "EXISTS (SELECT 1 FROM file_references owner_ref WHERE owner_ref.file_object_id = fo.id AND owner_ref.owner_user_id = ?)",
    );
    params.push(Number(filters.ownerUserId));
  }

  if (filters.referenceType) {
    where.push(
      "EXISTS (SELECT 1 FROM file_references type_ref WHERE type_ref.file_object_id = fo.id AND type_ref.reference_type = ?)",
    );
    params.push(filters.referenceType);
  }

  if (filters.createdFrom) {
    where.push("fo.created_at >= ?");
    params.push(filters.createdFrom);
  }

  if (filters.createdTo) {
    where.push("fo.created_at <= ?");
    params.push(filters.createdTo);
  }

  if (cursor) {
    where.push("(fo.created_at < ? OR (fo.created_at = ? AND fo.id < ?))");
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  const search = String(filters.search || "").trim();

  if (search) {
    where.push(
      "(fo.storage_key LIKE ? OR fo.original_file_name LIKE ? OR fo.public_path LIKE ? OR fo.checksum_sha256 LIKE ?)",
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `
    SELECT COUNT(*) AS total_count
    FROM file_objects fo
    ${whereSql}
  `;
  const dataSql = `
    SELECT
      fo.*,
      creator.first_name AS created_by_first_name,
      creator.last_name AS created_by_last_name,
      creator.email AS created_by_email,
      (SELECT COUNT(*) FROM file_references fr_count WHERE fr_count.file_object_id = fo.id) AS reference_count,
      (SELECT COUNT(*) FROM file_references fr_active WHERE fr_active.file_object_id = fo.id AND fr_active.status = 'active') AS active_reference_count,
      (SELECT GROUP_CONCAT(DISTINCT fr_type.reference_type ORDER BY fr_type.reference_type) FROM file_references fr_type WHERE fr_type.file_object_id = fo.id) AS reference_types,
      (SELECT GROUP_CONCAT(DISTINCT fr_role.file_role ORDER BY fr_role.file_role) FROM file_references fr_role WHERE fr_role.file_object_id = fo.id) AS file_roles
    FROM file_objects fo
    LEFT JOIN users creator ON creator.id = fo.created_by
    ${whereSql}
    ORDER BY fo.created_at DESC, fo.id DESC
    LIMIT ? OFFSET ?
  `;

  const [[countRows], [rows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, limit, offset]),
  ]);

  return {
    rows: rows.map(normalizeFileObject),
    totalCount: Number(countRows[0]?.total_count || 0),
    page,
    limit,
    nextCursor: rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null,
  };
}

async function getFileObjectDetail(fileObjectId) {
  const [fileRows] = await pool.query(
    `
      SELECT
      fo.*,
      creator.first_name AS created_by_first_name,
      creator.last_name AS created_by_last_name,
      creator.email AS created_by_email,
      (SELECT COUNT(*) FROM file_references fr_count WHERE fr_count.file_object_id = fo.id) AS reference_count,
      (SELECT COUNT(*) FROM file_references fr_active WHERE fr_active.file_object_id = fo.id AND fr_active.status = 'active') AS active_reference_count,
      (SELECT GROUP_CONCAT(DISTINCT fr_type.reference_type ORDER BY fr_type.reference_type) FROM file_references fr_type WHERE fr_type.file_object_id = fo.id) AS reference_types,
      (SELECT GROUP_CONCAT(DISTINCT fr_role.file_role ORDER BY fr_role.file_role) FROM file_references fr_role WHERE fr_role.file_object_id = fo.id) AS file_roles
    FROM file_objects fo
    LEFT JOIN users creator ON creator.id = fo.created_by
    WHERE fo.id = ?
    LIMIT 1
  `,
    [fileObjectId],
  );

  const fileObject = normalizeFileObject(fileRows[0]);

  if (!fileObject) return null;

  const [[referenceRows], [eventRows]] = await Promise.all([
    pool.query(
      `
        SELECT
          fr.*,
          owner.first_name AS owner_first_name,
          owner.last_name AS owner_last_name,
          owner.email AS owner_email
        FROM file_references fr
        LEFT JOIN users owner ON owner.id = fr.owner_user_id
        WHERE fr.file_object_id = ?
        ORDER BY fr.status = 'active' DESC, fr.attached_at DESC, fr.id DESC
      `,
      [fileObjectId],
    ),
    pool.query(
      `
        SELECT
          fe.*,
          actor.first_name AS actor_first_name,
          actor.last_name AS actor_last_name,
          actor.email AS actor_email
        FROM file_events fe
        LEFT JOIN users actor ON actor.id = fe.actor_id
        WHERE fe.file_object_id = ?
        ORDER BY fe.created_at DESC, fe.id DESC
        LIMIT 100
      `,
      [fileObjectId],
    ),
  ]);

  let exists = false;
  let absolutePath = null;

  try {
    absolutePath = getAbsolutePathForStorageKey(fileObject.storageKey);
    exists = fs.existsSync(absolutePath);
  } catch {
    exists = false;
  }

  return {
    fileObject,
    physical: {
      exists,
      absolutePath,
    },
    references: referenceRows.map(normalizeReference),
    events: eventRows.map(normalizeEvent),
  };
}

function summarizeReferences(references) {
  const summary = {
    activeCount: 0,
    statuses: {},
    referenceTypes: {},
    fileRoles: {},
  };

  references.forEach((reference) => {
    if (reference.status === "active") summary.activeCount += 1;
    summary.statuses[reference.status] =
      (summary.statuses[reference.status] || 0) + 1;
    summary.referenceTypes[reference.reference_type] =
      (summary.referenceTypes[reference.reference_type] || 0) + 1;
    summary.fileRoles[reference.file_role] =
      (summary.fileRoles[reference.file_role] || 0) + 1;
  });

  return summary;
}

function hasProtectedReference(references) {
  return references.some(
    (reference) =>
      PROTECTED_REFERENCE_TYPES.has(reference.reference_type) ||
      PROTECTED_FILE_ROLES.has(reference.file_role),
  );
}

function getEligibility({ fileObject, references, retentionPolicy }) {
  const activeCount = references.filter(
    (reference) => reference.status === "active",
  ).length;

  if (activeCount > 0) {
    return {
      eligible: false,
      reason: "Skipped because the file still has active references.",
    };
  }

  if (hasProtectedReference(references)) {
    return {
      eligible: false,
      reason: "Skipped because this file type is protected by retention policy.",
    };
  }

  if (fileObject.storageStatus === "deleted") {
    return {
      eligible: false,
      reason: "Skipped because the file object is already marked deleted.",
    };
  }

  const quoteCutoff = buildCutoff(retentionPolicy.quoteDays);
  const designCutoff = buildCutoff(retentionPolicy.designDays);
  const requestCutoff = buildCutoff(retentionPolicy.requestDays);

  if (references.length === 0) {
    return {
      eligible: isBeforeCutoff(fileObject.createdAt, quoteCutoff),
      reason: isBeforeCutoff(fileObject.createdAt, quoteCutoff)
        ? "Unreferenced file object is past the default orphan retention window."
        : "Unreferenced file object is not old enough for cleanup.",
    };
  }

  const hasQuoteReference = references.some(
    (reference) =>
      reference.reference_type === "quote_record" ||
      reference.reference_type === "quote_asset",
  );
  const hasDesignReference = references.some((reference) =>
    DESIGN_REFERENCE_TYPES.has(reference.reference_type),
  );
  const hasRequestReference = references.some((reference) =>
    REQUEST_REFERENCE_TYPES.has(reference.reference_type),
  );

  if (hasQuoteReference) {
    const quoteRefs = references.filter(
      (reference) =>
        reference.reference_type === "quote_record" ||
        reference.reference_type === "quote_asset",
    );
    const oldEnough = quoteRefs.every((reference) =>
      isBeforeCutoff(getReferenceAgeDate(reference, fileObject), quoteCutoff),
    );

    if (oldEnough) {
      return {
        eligible: true,
        reason: "Expired unused quote file is past the retention window.",
      };
    }
  }

  if (hasDesignReference) {
    const designRefs = references.filter((reference) =>
      DESIGN_REFERENCE_TYPES.has(reference.reference_type),
    );
    const oldEnough = designRefs.every((reference) =>
      isBeforeCutoff(getReferenceAgeDate(reference, fileObject), designCutoff),
    );

    if (oldEnough) {
      return {
        eligible: true,
        reason: "Inactive design/library file is past the retention window.",
      };
    }
  }

  if (hasRequestReference) {
    const requestRefs = references.filter((reference) =>
      REQUEST_REFERENCE_TYPES.has(reference.reference_type),
    );
    const oldEnough = requestRefs.every((reference) =>
      isBeforeCutoff(getReferenceAgeDate(reference, fileObject), requestCutoff),
    );

    if (oldEnough) {
      return {
        eligible: true,
        reason: "Inactive request file is past the retention window.",
      };
    }
  }

  return {
    eligible: false,
    reason: "References are not old enough for cleanup under the retention policy.",
  };
}

async function getCleanupCandidates({
  limit = DEFAULT_CLEANUP_LIMIT,
  retentionPolicy = {},
  referenceTypes = [],
} = {}) {
  const normalizedLimit = clampPositiveInteger(limit, DEFAULT_CLEANUP_LIMIT);
  const normalizedRetentionPolicy = normalizeRetentionPolicy(retentionPolicy);
  const normalizedReferenceTypes = normalizeReferenceTypes(referenceTypes);
  const params = [...CLEANUP_STORAGE_STATUSES];
  let referenceFilterSql = "";

  if (normalizedReferenceTypes.length > 0) {
    referenceFilterSql = `
      AND EXISTS (
        SELECT 1
        FROM file_references filter_ref
        WHERE filter_ref.file_object_id = fo.id
          AND filter_ref.reference_type IN (${normalizedReferenceTypes
            .map(() => "?")
            .join(", ")})
      )
    `;
    params.push(...normalizedReferenceTypes);
  }

  const [rows] = await pool.query(
    `
      SELECT fo.*
      FROM file_objects fo
      WHERE fo.storage_status IN (${CLEANUP_STORAGE_STATUSES.map(() => "?").join(
        ", ",
      )})
        AND NOT EXISTS (
          SELECT 1
          FROM file_references active_ref
          WHERE active_ref.file_object_id = fo.id
            AND active_ref.status = 'active'
        )
        ${referenceFilterSql}
      ORDER BY fo.created_at ASC, fo.id ASC
      LIMIT ?
    `,
    [...params, normalizedLimit],
  );

  const candidates = [];
  const skipped = [];

  for (const row of rows) {
    const fileObject = {
      id: row.id,
      storageKey: row.storage_key,
      originalFileName: row.original_file_name,
      fileSize: Number(row.file_size || 0),
      visibility: row.visibility,
      storageStatus: row.storage_status,
      createdAt: row.created_at,
    };
    const context = await getFileObjectAccessContext(row.id);
    const references = context?.references || [];
    const eligibility = getEligibility({
      fileObject,
      references,
      retentionPolicy: normalizedRetentionPolicy,
    });
    const normalized = {
      fileObject,
      references: summarizeReferences(references),
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    };

    if (eligibility.eligible) {
      candidates.push(normalized);
    } else {
      skipped.push(normalized);
    }
  }

  return {
    retentionPolicy: normalizedRetentionPolicy,
    candidates,
    skipped,
    counts: {
      scanned: rows.length,
      eligible: candidates.length,
      skipped: skipped.length,
    },
  };
}

async function runFileRegistryCleanup({
  dryRun = true,
  actorId = null,
  reason = null,
  limit = DEFAULT_CLEANUP_LIMIT,
  retentionPolicy = {},
  referenceTypes = [],
} = {}) {
  const candidateResult = await getCleanupCandidates({
    limit,
    retentionPolicy,
    referenceTypes,
  });
  const result = {
    dryRun,
    retentionPolicy: candidateResult.retentionPolicy,
    candidates: candidateResult.candidates,
    skipped: candidateResult.skipped,
    run: {
      scannedCount: candidateResult.counts.scanned,
      candidateCount: candidateResult.counts.eligible,
      deletedCount: 0,
      skippedCount: candidateResult.counts.skipped,
      missingCount: 0,
      failedCount: 0,
    },
    results: [],
  };

  if (dryRun) {
    return result;
  }

  for (const candidate of candidateResult.candidates) {
    const fileObjectId = candidate.fileObject.id;

    try {
      const activeCount = await countActiveFileReferences(fileObjectId);

      if (activeCount > 0) {
        result.run.skippedCount += 1;
        result.results.push({
          fileObjectId,
          result: "skipped",
          reason: "Skipped because active references appeared before deletion.",
        });
        await createFileEvent({
          fileObjectId,
          eventType: "cleanup_skip",
          actorId,
          summary: "Skipped cleanup because active references appeared before deletion.",
        });
        continue;
      }

      const absolutePath = getAbsolutePathForStorageKey(candidate.fileObject.storageKey);

      if (!fs.existsSync(absolutePath)) {
        await markFileObjectStorageStatus({
          fileObjectId,
          storageStatus: "missing",
          actorId,
          reason: reason || candidate.reason,
        });
        await createFileEvent({
          fileObjectId,
          eventType: "cleanup_missing",
          actorId,
          summary: "Physical file was missing during registry cleanup.",
          metadata: { reason: reason || candidate.reason },
        });
        result.run.missingCount += 1;
        result.results.push({
          fileObjectId,
          result: "missing",
          reason: "Physical file was missing during cleanup.",
        });
        continue;
      }

      await fs.promises.rm(absolutePath, { force: true });
      await markFileObjectStorageStatus({
        fileObjectId,
        storageStatus: "deleted",
        actorId,
        reason: reason || candidate.reason,
      });
      await createFileEvent({
        fileObjectId,
        eventType: "cleanup_delete",
        actorId,
        summary: reason || candidate.reason,
        metadata: candidate.references,
      });
      result.run.deletedCount += 1;
      result.results.push({
        fileObjectId,
        result: "deleted",
        reason: reason || candidate.reason,
      });
    } catch (error) {
      await markFileObjectStorageStatus({
        fileObjectId,
        storageStatus: "delete_failed",
        actorId,
        reason: error.message,
      });
      await createFileEvent({
        fileObjectId,
        eventType: "cleanup_fail",
        actorId,
        summary: error.message,
        metadata: { reason: reason || candidate.reason },
      });
      result.run.failedCount += 1;
      result.results.push({
        fileObjectId,
        result: "failed",
        reason: error.message,
      });
    }
  }

  return result;
}

export {
  getCleanupCandidates,
  getFileObjectDetail,
  getFileRegistrySummary,
  listFileObjects,
  runFileRegistryCleanup,
};
