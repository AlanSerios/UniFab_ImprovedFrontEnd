import {
  deleteQuoteRecordById,
  getExpiredUnusedQuoteRecords,
} from "../models/quote-record.model.js";
import {
  deleteUnusedQuoteRecordsForAsset,
  getExpiredUnusedQuoteAssets,
  markQuoteAssetExpired,
} from "../models/quote-asset.model.js";
import { deleteOldQuoteAttempts } from "../models/quote-attempt.model.js";
import {
  removeManagedPrintRequestModelFile,
  removeManagedPrintRequestThumbnailFile,
} from "../utils/print-request-storage.util.js";
import {
  removeManagedQuoteModelFile,
  removeManagedQuoteThumbnailFile,
} from "../utils/quote-storage.util.js";
import {
  countActiveFileReferences,
  markFileReferencesInactive,
} from "../models/file-registry.model.js";
import { markFileObjectDeleted } from "./file-storage.service.js";

async function cleanupExpiredUnusedQuotes({
  limit = 100,
  graceHours = Number(process.env.QUOTE_CLEANUP_GRACE_HOURS || 0),
} = {}) {
  const quoteRecords = await getExpiredUnusedQuoteRecords({ limit, graceHours });
  const quoteAssets = await getExpiredUnusedQuoteAssets({ limit, graceHours });
  const result = {
    checked: quoteRecords.length + quoteAssets.length,
    expiredQuoteAssets: 0,
    deletedQuoteRecords: 0,
    deletedQuoteAttempts: 0,
    deletedModelFiles: 0,
    deletedThumbnailFiles: 0,
    missingModelFiles: 0,
    failed: [],
  };

  result.deletedQuoteAttempts = await deleteOldQuoteAttempts({
    retentionDays: Number(process.env.QUOTE_ATTEMPT_RETENTION_DAYS || 30),
  });

  for (const quoteAsset of quoteAssets) {
    try {
      await markFileReferencesInactive({
        referenceType: "quote_asset",
        referenceId: quoteAsset.id,
        status: "expired",
        reason: "Expired unused quote asset cleanup.",
      });

      if (quoteAsset.sourceType === "upload" && quoteAsset.fileUrl) {
        let removedFile = false;

        if (
          quoteAsset.fileObjectId &&
          (await countActiveFileReferences(quoteAsset.fileObjectId)) === 0
        ) {
          await markFileObjectDeleted({
            fileObjectId: quoteAsset.fileObjectId,
            reason: "Expired unused quote asset model deleted after retention.",
            deletePhysical: true,
          });
          removedFile = true;
        }

        if (removedFile) {
          result.deletedModelFiles += 1;
        } else {
          result.missingModelFiles += 1;
        }
      }

      if (quoteAsset.thumbnailUrl) {
        let removedThumbnail = false;

        if (
          quoteAsset.thumbnailFileObjectId &&
          (await countActiveFileReferences(quoteAsset.thumbnailFileObjectId)) === 0
        ) {
          await markFileObjectDeleted({
            fileObjectId: quoteAsset.thumbnailFileObjectId,
            reason:
              "Expired unused quote asset thumbnail deleted after retention.",
            deletePhysical: true,
          });
          removedThumbnail = true;
        }

        if (removedThumbnail) {
          result.deletedThumbnailFiles += 1;
        }
      }

      result.deletedQuoteRecords += await deleteUnusedQuoteRecordsForAsset(
        quoteAsset.id,
      );

      if (await markQuoteAssetExpired(quoteAsset.id)) {
        result.expiredQuoteAssets += 1;
      }
    } catch (error) {
      result.failed.push({
        quoteAssetId: quoteAsset.id,
        message: error.message || "Cleanup failed",
      });
    }
  }

  for (const quoteRecord of quoteRecords) {
    try {
      await markFileReferencesInactive({
        referenceType: "quote_record",
        referenceId: quoteRecord.id,
        status: "expired",
        reason: "Expired unused quote cleanup.",
      });

      if (quoteRecord.source_type === "upload" && quoteRecord.file_url) {
        let removedFile = false;

        if (
          quoteRecord.file_object_id &&
          (await countActiveFileReferences(quoteRecord.file_object_id)) === 0
        ) {
          await markFileObjectDeleted({
            fileObjectId: quoteRecord.file_object_id,
            reason: "Expired unused quote model deleted after retention.",
            deletePhysical: true,
          });
          removedFile = true;
        } else if (!quoteRecord.file_object_id) {
          removedFile =
            (await removeManagedQuoteModelFile(quoteRecord.file_url)) ||
            (await removeManagedPrintRequestModelFile(quoteRecord.file_url));
        }

        if (removedFile) {
          result.deletedModelFiles += 1;
        } else {
          result.missingModelFiles += 1;
        }
      }

      if (quoteRecord.thumbnail_url) {
        let removedThumbnail = false;

        if (
          quoteRecord.thumbnail_file_object_id &&
          (await countActiveFileReferences(
            quoteRecord.thumbnail_file_object_id,
          )) === 0
        ) {
          await markFileObjectDeleted({
            fileObjectId: quoteRecord.thumbnail_file_object_id,
            reason: "Expired unused quote thumbnail deleted after retention.",
            deletePhysical: true,
          });
          removedThumbnail = true;
        } else if (!quoteRecord.thumbnail_file_object_id) {
          removedThumbnail =
            (await removeManagedQuoteThumbnailFile(quoteRecord.thumbnail_url)) ||
            (await removeManagedPrintRequestThumbnailFile(
              quoteRecord.thumbnail_url,
            ));
        }

        if (removedThumbnail) {
          result.deletedThumbnailFiles += 1;
        }
      }

      const deletedQuoteRecord = await deleteQuoteRecordById(quoteRecord.id);

      if (deletedQuoteRecord) {
        result.deletedQuoteRecords += 1;
      }
    } catch (error) {
      result.failed.push({
        quoteRecordId: quoteRecord.id,
        message: error.message || "Cleanup failed",
      });
    }
  }

  return result;
}

function startExpiredQuoteCleanupJob({
  intervalMinutes = Number(process.env.QUOTE_CLEANUP_INTERVAL_MINUTES || 30),
  limit = Number(process.env.QUOTE_CLEANUP_LIMIT || 100),
} = {}) {
  const normalizedIntervalMinutes = Number(intervalMinutes);

  if (
    !Number.isFinite(normalizedIntervalMinutes) ||
    normalizedIntervalMinutes <= 0
  ) {
    return null;
  }

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;

  let isRunning = false;

  const runCleanup = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      const result = await cleanupExpiredUnusedQuotes({
        limit: normalizedLimit,
      });

      if (
        result.deletedQuoteRecords > 0 ||
        result.deletedModelFiles > 0 ||
        result.failed.length > 0
      ) {
        console.log("Expired quote cleanup result:", result);
      }
    } catch (error) {
      console.error("Expired quote cleanup failed:", error);
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

export { cleanupExpiredUnusedQuotes, startExpiredQuoteCleanupJob };
