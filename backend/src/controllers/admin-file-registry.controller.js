import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  buildDatabaseRetentionCleanupOptions,
  buildDesignFileCleanupOptions,
  buildFileRegistryCleanupOptions,
} from "../utils/admin-maintenance-request.util.js";
import {
  getFileObjectDetail,
  getFileRegistrySummary,
  listFileObjects,
  runFileRegistryCleanup,
} from "../services/admin-file-registry.service.js";
import { runDesignFileCleanup } from "../services/design-file-cleanup.service.js";
import { cleanupDatabaseRetention } from "../services/db-retention-cleanup.service.js";

const getAdminFileRegistrySummary = asyncHandler(async (_req, res) => {
  const summary = await getFileRegistrySummary();

  return res.status(200).json(
    new ApiResponse(
      200,
      { summary },
      "File registry summary fetched successfully",
    ),
  );
});

const listAdminFileObjects = asyncHandler(async (req, res) => {
  const result = await listFileObjects({
    page: req.query.page,
    limit: req.query.limit,
    storageStatus: req.query.storageStatus,
    visibility: req.query.visibility,
    referenceType: req.query.referenceType,
    ownerUserId: req.query.ownerUserId,
    checksum: req.query.checksum,
    extension: req.query.extension,
    createdFrom: req.query.createdFrom,
    createdTo: req.query.createdTo,
    search: req.query.search,
    cursor: req.query.cursor,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { fileObjects: result.rows, pagination: result },
      "File objects fetched successfully",
    ),
  );
});

const getAdminFileObjectDetail = asyncHandler(async (req, res) => {
  const fileObjectId = Number(req.params.fileObjectId);

  if (!Number.isInteger(fileObjectId) || fileObjectId < 1) {
    throw new ApiError(400, "Invalid file id");
  }

  const detail = await getFileObjectDetail(fileObjectId);

  if (!detail) {
    throw new ApiError(404, "File object not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { detail },
      "File object detail fetched successfully",
    ),
  );
});

const dryRunAdminFileRegistryCleanup = asyncHandler(async (req, res) => {
  const cleanup = await runFileRegistryCleanup(
    buildFileRegistryCleanupOptions(req, { dryRun: true }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { cleanup },
      "File registry cleanup dry run completed",
    ),
  );
});

const runAdminFileRegistryCleanup = asyncHandler(async (req, res) => {
  const cleanup = await runFileRegistryCleanup(
    buildFileRegistryCleanupOptions(req, { dryRun: false }),
  );

  return res.status(200).json(
    new ApiResponse(200, { cleanup }, "File registry cleanup completed"),
  );
});

const dryRunDesignFileCleanup = asyncHandler(async (req, res) => {
  const cleanup = await runDesignFileCleanup(
    buildDesignFileCleanupOptions(req, { dryRun: true }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { cleanup },
      "Design Library file cleanup dry run completed",
    ),
  );
});

const runAdminDesignFileCleanup = asyncHandler(async (req, res) => {
  const cleanup = await runDesignFileCleanup(
    buildDesignFileCleanupOptions(req, { dryRun: false }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { cleanup },
      "Design Library file cleanup completed",
    ),
  );
});

const dryRunDatabaseRetentionCleanup = asyncHandler(async (req, res) => {
  const cleanup = await cleanupDatabaseRetention(
    buildDatabaseRetentionCleanupOptions(req, { dryRun: true }),
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { cleanup },
      "Database retention cleanup dry run completed",
    ),
  );
});

const runDatabaseRetentionCleanup = asyncHandler(async (req, res) => {
  const cleanup = await cleanupDatabaseRetention(
    buildDatabaseRetentionCleanupOptions(req, { dryRun: false }),
  );

  return res.status(200).json(
    new ApiResponse(200, { cleanup }, "Database retention cleanup completed"),
  );
});

export {
  dryRunDatabaseRetentionCleanup,
  dryRunDesignFileCleanup,
  dryRunAdminFileRegistryCleanup,
  getAdminFileObjectDetail,
  getAdminFileRegistrySummary,
  listAdminFileObjects,
  runDatabaseRetentionCleanup,
  runAdminDesignFileCleanup,
  runAdminFileRegistryCleanup,
};
