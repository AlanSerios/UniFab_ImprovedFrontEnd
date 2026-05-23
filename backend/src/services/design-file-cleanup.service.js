import fs from "fs";
import pool from "../db/db.js";
import {
  countActiveFileReferences,
  createFileEvent,
  markFileObjectStorageStatus,
} from "../models/file-registry.model.js";
import { getAbsolutePathForStorageKey } from "./file-storage.service.js";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 5000;
const DESIGN_REFERENCE_TYPES = [
  "local_design_file",
  "local_design_image",
  "mmf_print_ready_file",
];

function parsePositiveInteger(value, fallback, { max = MAX_LIMIT } = {}) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeRetentionDays(value, fallback) {
  return parsePositiveInteger(value, fallback, { max: 3650 });
}

function serializeJson(value) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

async function createCleanupRun({
  jobType = "manual",
  dryRun,
  actorId,
  retentionDays,
  mmfRetentionDays,
}) {
  const [result] = await pool.query(
    `
      INSERT INTO design_storage_cleanup_runs (
        job_type,
        dry_run,
        actor_id,
        retention_days,
        mmf_retention_days,
        retention_cutoff,
        mmf_retention_cutoff,
        status
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        DATE_SUB(NOW(), INTERVAL ? DAY),
        DATE_SUB(NOW(), INTERVAL ? DAY),
        'running'
      )
    `,
    [
      jobType,
      dryRun,
      actorId,
      retentionDays,
      mmfRetentionDays,
      retentionDays,
      mmfRetentionDays,
    ],
  );

  return result.insertId;
}

async function finishCleanupRun(runId, status, summary) {
  await pool.query(
    `
      UPDATE design_storage_cleanup_runs
      SET
        status = ?,
        candidate_count = ?,
        deleted_count = ?,
        skipped_count = ?,
        missing_count = ?,
        failed_count = ?,
        error_message = ?,
        finished_at = NOW()
      WHERE id = ?
    `,
    [
      status,
      summary.candidateCount,
      summary.deletedCount,
      summary.skippedCount,
      summary.missingCount,
      summary.failedCount,
      summary.errorMessage || null,
      runId,
    ],
  );
}

async function recordCleanupResult({ runId, candidate, result, reason }) {
  await pool.query(
    `
      INSERT INTO design_storage_cleanup_results (
        cleanup_run_id,
        asset_kind,
        asset_id,
        local_design_id,
        public_path,
        file_size,
        result,
        reason,
        reference_summary
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runId,
      candidate.assetKind,
      candidate.assetId,
      candidate.localDesignId,
      candidate.publicPath,
      candidate.fileSize,
      result,
      reason,
      serializeJson(candidate.referenceSummary),
    ],
  );
}

async function getDesignCleanupCandidates({ limit, retentionDays, mmfRetentionDays }) {
  const [rows] = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          'local_model' AS asset_kind,
          ldf.id AS asset_id,
          ldf.local_design_id,
          fo.id AS file_object_id,
          fo.storage_key,
          fo.public_path,
          fo.file_size,
          'model' AS file_role,
          fr.status AS reference_status,
          fr.detached_at AS reference_detached_at,
          COALESCE(fr.detached_at, ldf.removed_at, ld.deleted_at, fo.created_at) AS eligible_at
        FROM local_design_files ldf
        INNER JOIN local_designs ld ON ld.id = ldf.local_design_id
        INNER JOIN file_references fr
          ON fr.reference_type = 'local_design_file'
          AND fr.reference_id = ldf.id
          AND fr.status <> 'active'
        INNER JOIN file_objects fo ON fo.id = fr.file_object_id
        WHERE fo.storage_status IN ('present', 'delete_failed', 'missing')
          AND (
            ldf.status IN ('removed', 'replaced')
            OR ld.deleted_at IS NOT NULL
          )
          AND COALESCE(fr.detached_at, ldf.removed_at, ld.deleted_at, fo.created_at)
            <= DATE_SUB(NOW(), INTERVAL ? DAY)

        UNION ALL

        SELECT
          'local_image' AS asset_kind,
          ldi.id AS asset_id,
          ldi.local_design_id,
          fo.id AS file_object_id,
          fo.storage_key,
          fo.public_path,
          fo.file_size,
          'thumbnail' AS file_role,
          fr.status AS reference_status,
          fr.detached_at AS reference_detached_at,
          COALESCE(fr.detached_at, ldi.removed_at, ld.deleted_at, fo.created_at) AS eligible_at
        FROM local_design_images ldi
        INNER JOIN local_designs ld ON ld.id = ldi.local_design_id
        INNER JOIN file_references fr
          ON fr.reference_type = 'local_design_image'
          AND fr.reference_id = ldi.id
          AND fr.status <> 'active'
        INNER JOIN file_objects fo ON fo.id = fr.file_object_id
        WHERE fo.storage_status IN ('present', 'delete_failed', 'missing')
          AND (
            ldi.status IN ('removed', 'replaced')
            OR ld.deleted_at IS NOT NULL
          )
          AND COALESCE(fr.detached_at, ldi.removed_at, ld.deleted_at, fo.created_at)
            <= DATE_SUB(NOW(), INTERVAL ? DAY)

        UNION ALL

        SELECT
          'mmf_cached_file' AS asset_kind,
          mprf.id AS asset_id,
          NULL AS local_design_id,
          fo.id AS file_object_id,
          fo.storage_key,
          fo.public_path,
          fo.file_size,
          fr.file_role,
          fr.status AS reference_status,
          fr.detached_at AS reference_detached_at,
          COALESCE(fr.detached_at, mprf.updated_at, fo.created_at) AS eligible_at
        FROM mmf_print_ready_files mprf
        INNER JOIN file_references fr
          ON fr.reference_type = 'mmf_print_ready_file'
          AND fr.reference_id = mprf.id
          AND fr.status <> 'active'
        INNER JOIN file_objects fo ON fo.id = fr.file_object_id
        WHERE fo.storage_status IN ('present', 'delete_failed', 'missing')
          AND mprf.status IN ('archived', 'removed', 'failed')
          AND COALESCE(fr.detached_at, mprf.updated_at, fo.created_at)
            <= DATE_SUB(NOW(), INTERVAL ? DAY)
      ) candidates
      WHERE NOT EXISTS (
        SELECT 1
        FROM file_references active_ref
        WHERE active_ref.file_object_id = candidates.file_object_id
          AND active_ref.status = 'active'
      )
      ORDER BY eligible_at ASC, file_object_id ASC
      LIMIT ?
    `,
    [retentionDays, retentionDays, mmfRetentionDays, limit],
  );

  const seen = new Set();

  return rows
    .filter((row) => {
      if (seen.has(row.file_object_id)) return false;
      seen.add(row.file_object_id);
      return true;
    })
    .map((row) => ({
      assetKind: row.asset_kind,
      assetId: Number(row.asset_id),
      localDesignId: row.local_design_id ? Number(row.local_design_id) : null,
      fileObjectId: Number(row.file_object_id),
      storageKey: row.storage_key,
      publicPath: row.public_path,
      fileSize: Number(row.file_size || 0),
      referenceSummary: {
        type: DESIGN_REFERENCE_TYPES.find((type) =>
          String(row.storage_key || "").includes(type),
        ),
        role: row.file_role,
        status: row.reference_status,
        detachedAt: row.reference_detached_at,
      },
    }));
}

async function runDesignFileCleanup({
  dryRun = true,
  jobType = "manual",
  actorId = null,
  reason = "Design Library file retention cleanup.",
  limit = DEFAULT_LIMIT,
  retentionDays = Number(process.env.DESIGN_FILE_RETENTION_DAYS || 180),
  mmfRetentionDays = Number(process.env.MMF_PRINT_READY_FILE_RETENTION_DAYS || 365),
} = {}) {
  const normalizedLimit = parsePositiveInteger(limit, DEFAULT_LIMIT);
  const normalizedRetentionDays = normalizeRetentionDays(retentionDays, 180);
  const normalizedMmfRetentionDays = normalizeRetentionDays(mmfRetentionDays, 365);
  const runId = await createCleanupRun({
    jobType,
    dryRun,
    actorId,
    retentionDays: normalizedRetentionDays,
    mmfRetentionDays: normalizedMmfRetentionDays,
  });
  const candidates = await getDesignCleanupCandidates({
    limit: normalizedLimit,
    retentionDays: normalizedRetentionDays,
    mmfRetentionDays: normalizedMmfRetentionDays,
  });
  const summary = {
    runId,
    dryRun,
    candidateCount: candidates.length,
    deletedCount: 0,
    skippedCount: 0,
    missingCount: 0,
    failedCount: 0,
    errorMessage: null,
  };

  try {
    for (const candidate of candidates) {
      if (dryRun) {
        await recordCleanupResult({
          runId,
          candidate,
          result: "would_delete",
          reason,
        });
        continue;
      }

      try {
        const activeReferences = await countActiveFileReferences(
          candidate.fileObjectId,
        );

        if (activeReferences > 0) {
          summary.skippedCount += 1;
          await recordCleanupResult({
            runId,
            candidate,
            result: "skipped",
            reason: "Skipped because an active file reference still exists.",
          });
          continue;
        }

        const absolutePath = getAbsolutePathForStorageKey(candidate.storageKey);

        if (!fs.existsSync(absolutePath)) {
          await markFileObjectStorageStatus({
            fileObjectId: candidate.fileObjectId,
            storageStatus: "missing",
            actorId,
            reason: "Design cleanup found a missing physical file.",
          });
          await createFileEvent({
            fileObjectId: candidate.fileObjectId,
            eventType: "design_cleanup_missing",
            actorId,
            summary: "Design cleanup found a missing physical file.",
          });
          summary.missingCount += 1;
          await recordCleanupResult({
            runId,
            candidate,
            result: "missing",
            reason: "Physical file was already missing.",
          });
          continue;
        }

        await fs.promises.rm(absolutePath, { force: true });
        await markFileObjectStorageStatus({
          fileObjectId: candidate.fileObjectId,
          storageStatus: "deleted",
          actorId,
          reason,
        });
        await createFileEvent({
          fileObjectId: candidate.fileObjectId,
          eventType: "design_cleanup_delete",
          actorId,
          summary: reason,
          metadata: candidate.referenceSummary,
        });
        summary.deletedCount += 1;
        await recordCleanupResult({
          runId,
          candidate,
          result: "deleted",
          reason,
        });
      } catch (error) {
        await markFileObjectStorageStatus({
          fileObjectId: candidate.fileObjectId,
          storageStatus: "delete_failed",
          actorId,
          reason: error.message,
        });
        summary.failedCount += 1;
        await recordCleanupResult({
          runId,
          candidate,
          result: "failed",
          reason: error.message,
        });
      }
    }

    await finishCleanupRun(runId, "completed", summary);
    return {
      ...summary,
      retentionDays: normalizedRetentionDays,
      mmfRetentionDays: normalizedMmfRetentionDays,
      candidates,
    };
  } catch (error) {
    summary.errorMessage = error.message;
    await finishCleanupRun(runId, "failed", summary);
    throw error;
  }
}

function startDesignFileCleanupJob({
  intervalMinutes = Number(process.env.DESIGN_FILE_CLEANUP_INTERVAL_MINUTES || 60),
  limit = Number(process.env.DESIGN_FILE_CLEANUP_LIMIT || DEFAULT_LIMIT),
} = {}) {
  const normalizedIntervalMinutes = Number(intervalMinutes);

  if (
    !Number.isFinite(normalizedIntervalMinutes) ||
    normalizedIntervalMinutes <= 0
  ) {
    return null;
  }

  let isRunning = false;

  const runCleanup = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const result = await runDesignFileCleanup({
        dryRun: false,
        jobType: "scheduled",
        limit,
        reason: "Scheduled Design Library file retention cleanup.",
      });

      if (result.deletedCount > 0 || result.failedCount > 0) {
        console.log("Design Library file cleanup result:", result);
      }
    } catch (error) {
      console.error("Design Library file cleanup failed:", error);
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(
    runCleanup,
    normalizedIntervalMinutes * 60 * 1000,
  );

  timer.unref?.();

  return timer;
}

export { runDesignFileCleanup, startDesignFileCleanupJob };
