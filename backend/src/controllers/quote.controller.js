import fs from "fs";
import path from "path";
import { getCurrentPricingConfig } from "../models/pricing-config.model.js";
import {
  getMaterialByKey,
  getActiveMaterialColors,
  getActiveMaterialColorById,
  listMaterialsForAdmin,
} from "../models/materials.model.js";
import { listSlicerProfilesForAdmin } from "../models/slicer-profile.model.js";
import { listRecentSlicerProfileValidationEvents } from "../models/slicer-profile-validation-event.model.js";
import {
  createQuoteRecord,
  getReusableUploadQuoteRecordByToken,
  getValidQuoteRecordByToken,
} from "../models/quote-record.model.js";
import {
  createQuoteAsset,
  updateQuoteAssetExpiry,
} from "../models/quote-asset.model.js";
import {
  createQuoteAttempt,
  listQuoteAttempts,
} from "../models/quote-attempt.model.js";
import {
  getLocalDesignById,
  getLocalDesignFileForQuote,
} from "../models/local-design.model.js";
import { getDesignOverrideByMmfObjectId } from "../models/design-overrides.model.js";
import { getMmfPrintReadyFileForQuote } from "../models/mmf-print-ready-file.model.js";
import { getObjectById } from "../services/myminifactory.service.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { runSliceEstimate } from "../services/slicer.service.js";
import { calculateQuoteEstimate } from "../utils/quote-calculator.util.js";
import {
  QUOTE_MODEL_FILES_ROOT,
  buildQuoteModelPublicPath,
  getManagedQuoteModelAbsolutePath,
  removeManagedQuoteModelFile,
} from "../utils/quote-storage.util.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";
import { getManagedMmfPrintReadyFileAbsolutePath } from "../utils/mmf-print-ready-storage.util.js";
import { cleanupExpiredUnusedQuotes } from "../services/quote-cleanup.service.js";
import { generateStoredQuoteSnapshot } from "../utils/model-snapshot.util.js";
import {
  applyUploadQuoteTokenDownloadUrls,
  buildInlineDownloadUrlWithQuoteToken,
  buildLocalDesignSnapshot,
  buildMmfObjectSnapshot,
  normalizeQuoteRecord,
} from "../utils/quote-response.util.js";
import { buildQuoteReadinessPayload } from "../utils/quote-readiness-response.util.js";
import {
  attachManagedFileReference,
  registerManagedFile,
  registerManagedPublicPath,
} from "../services/file-storage.service.js";

const QUOTE_TTL_HOURS = Number(process.env.QUOTE_TTL_HOURS || 168);

function buildQuoteExpiresAt() {
  const normalizedHours =
    Number.isFinite(QUOTE_TTL_HOURS) && QUOTE_TTL_HOURS > 0
      ? QUOTE_TTL_HOURS
      : 168;

  return new Date(Date.now() + normalizedHours * 60 * 60 * 1000);
}

async function recordQuoteAttemptSafely(payload) {
  try {
    await createQuoteAttempt(payload);
  } catch (error) {
    console.error(`Failed to record quote attempt: ${error.message}`);
  }
}

function buildQuoteAttemptPayload({
  req,
  sourceType,
  sourceIdentifier = null,
  fileOriginalName = null,
  status,
  quoteRecordId = null,
  error = null,
}) {
  const statusCode = error?.statusCode || error?.status || null;

  return {
    sourceType,
    sourceIdentifier,
    userId: req.user?.id || null,
    material: req.body?.material || null,
    materialColorId:
      req.body?.materialColorId === undefined || req.body?.materialColorId === ""
        ? null
        : Number(req.body.materialColorId),
    materialColorName: null,
    materialColorHex: null,
    printQuality: req.body?.quality || null,
    infill:
      req.body?.infill === undefined || req.body?.infill === ""
        ? null
        : Number(req.body.infill),
    quantity:
      req.body?.quantity === undefined || req.body?.quantity === ""
        ? null
        : Number(req.body.quantity),
    fileOriginalName,
    status,
    errorStatusCode: statusCode,
    errorMessage: error?.message || null,
    quoteRecordId,
  };
}

async function resolveMaterialColor({ materialRow, materialColorId }) {
  const colors = await getActiveMaterialColors(materialRow.id);

  if (colors.length === 0) {
    return null;
  }

  const normalizedColorId = Number(materialColorId);

  if (!Number.isInteger(normalizedColorId) || normalizedColorId < 1) {
    throw new ApiError(400, "Material color is required for this material");
  }

  const color = await getActiveMaterialColorById(
    materialRow.id,
    normalizedColorId,
  );

  if (!color) {
    throw new ApiError(400, "Selected material color is unavailable");
  }

  return {
    id: color.id,
    name: color.color_name,
    hexCode: color.hex_code,
  };
}

const calculateQuote = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Model file is required");
  }

  const modelPath = req.file.path;
  const fileUrl = buildQuoteModelPublicPath(req.file);
  const permanentModelPath = path.join(
    QUOTE_MODEL_FILES_ROOT,
    req.file.filename,
  );
  const { material, materialColorId, quality, infill, quantity } = req.body;

  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);
  let shouldRemoveUploadedModel = true;

  try {
    const materialRow = await getMaterialByKey(material);

    if (!materialRow) {
      throw new ApiError(
        400,
        `Material is not configured or inactive: ${material}`,
      );
    }

    const materialColor = await resolveMaterialColor({
      materialRow,
      materialColorId,
    });

    const pricingConfig = await getCurrentPricingConfig();

    if (!pricingConfig) {
      throw new ApiError(500, "Pricing config not found");
    }

    const slicerResult = await runSliceEstimate({
      modelPath,
      material: materialRow.material_key,
      quality,
      infill: normalizedInfill,
      quantity: normalizedQuantity,
    });

    const result = calculateQuoteEstimate({
      slicerResult,
      pricingConfig,
      materialCostPerGram: materialRow.material_cost_per_gram,
      quantity: normalizedQuantity,
    });

    await fs.promises.mkdir(QUOTE_MODEL_FILES_ROOT, {
      recursive: true,
    });
    await fs.promises.rename(modelPath, permanentModelPath);
    const thumbnailUrl = await generateStoredQuoteSnapshot(permanentModelPath);
    const modelFileObject = await registerManagedFile({
      absolutePath: permanentModelPath,
      publicPath: fileUrl,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      visibility: "private",
      createdBy: req.user?.id || null,
      dedupe: false,
    });
    const thumbnailFileObject = thumbnailUrl
      ? await registerManagedPublicPath({
          publicPath: thumbnailUrl,
          originalFileName: `${req.file.originalname || req.file.filename}-snapshot.png`,
          mimeType: "image/png",
          visibility: "private",
          createdBy: req.user?.id || null,
          dedupe: false,
        })
      : null;

    const expiresAt = buildQuoteExpiresAt();
    const quoteAsset = await createQuoteAsset({
      ownerUserId: req.user?.id || null,
      sourceType: "upload",
      fileObjectId: modelFileObject?.id || null,
      fileOriginalName: req.file.originalname,
      fileMimeType: req.file.mimetype,
      fileSize: modelFileObject?.fileSize || req.file.size,
      thumbnailFileObjectId: thumbnailFileObject?.id || null,
      expiresAt,
    });
    const { quoteToken, quoteRecord } = await createQuoteRecord({
      quoteAssetId: quoteAsset?.id || null,
      ownerUserId: req.user?.id || null,
      sourceType: "upload",
      fileUrl: modelFileObject?.publicPath || fileUrl,
      fileObjectId: modelFileObject?.id || null,
      fileOriginalName: req.file.originalname,
      fileMimeType: req.file.mimetype,
      fileSize: modelFileObject?.fileSize || req.file.size,
      thumbnailUrl: thumbnailFileObject?.publicPath || thumbnailUrl,
      thumbnailFileObjectId: thumbnailFileObject?.id || null,
      material: materialRow.material_key,
      materialColorId: materialColor?.id ?? null,
      materialColorName: materialColor?.name ?? null,
      materialColorHex: materialColor?.hexCode ?? null,
      printQuality: quality,
      infill: normalizedInfill,
      quantity: normalizedQuantity,
      estimatedCost: result.totalPrice,
      quoteSnapshot: {
        ...result,
        sourceType: "upload",
        materialColor,
        file: {
          url: modelFileObject?.publicPath || fileUrl,
          fileObjectId: modelFileObject?.id || null,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: modelFileObject?.fileSize || req.file.size,
          thumbnailUrl: thumbnailFileObject?.publicPath || thumbnailUrl,
          thumbnailFileObjectId: thumbnailFileObject?.id || null,
        },
      },
      pricingConfigSnapshot: pricingConfig,
      materialSnapshot: materialRow,
      expiresAt,
    });
    await Promise.all([
      modelFileObject?.id
        ? attachManagedFileReference({
            fileObjectId: modelFileObject.id,
            referenceType: "quote_asset",
            referenceId: quoteAsset.id,
            referenceColumn: "file_object_id",
            fileRole: "model",
            ownerUserId: req.user?.id || null,
            visibility: "private",
            actorId: req.user?.id || null,
          })
        : Promise.resolve(null),
      thumbnailFileObject?.id
        ? attachManagedFileReference({
            fileObjectId: thumbnailFileObject.id,
            referenceType: "quote_asset",
            referenceId: quoteAsset.id,
            referenceColumn: "thumbnail_file_object_id",
            fileRole: "thumbnail",
            ownerUserId: req.user?.id || null,
            visibility: "private",
            actorId: req.user?.id || null,
          })
        : Promise.resolve(null),
    ]);

    shouldRemoveUploadedModel = false;
    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "upload",
        fileOriginalName: req.file.originalname,
        status: "success",
        quoteRecordId: quoteRecord.id,
      }),
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          quoteToken,
          quoteExpiresAt: quoteRecord.expires_at,
          fileObjectId: modelFileObject?.id || null,
          thumbnailFileObjectId: thumbnailFileObject?.id || null,
          thumbnailUrl: thumbnailFileObject?.id
            ? buildInlineDownloadUrlWithQuoteToken(
                thumbnailFileObject.id,
                quoteToken,
              )
            : thumbnailUrl,
        },
        "Quote calculated successfully",
      ),
    );
  } catch (error) {
    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "upload",
        fileOriginalName: req.file?.originalname || null,
        status: "failed",
        error,
      }),
    );

    throw error;
  } finally {
    if (shouldRemoveUploadedModel && fileUrl) {
      await removeManagedQuoteModelFile(fileUrl);
      await fs.promises.rm(modelPath, { force: true });
    }
  }
});

const getQuoteByToken = asyncHandler(async (req, res) => {
  const quoteRecord = await getValidQuoteRecordByToken(req.params.quoteToken);

  if (!quoteRecord) {
    throw new ApiError(404, "Quote not found or expired");
  }

  const normalizedQuote = normalizeQuoteRecord(quoteRecord);

  applyUploadQuoteTokenDownloadUrls(normalizedQuote, req.params.quoteToken);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        quote: normalizedQuote,
      },
      "Quote fetched successfully",
    ),
  );
});

const recalculateUploadQuote = asyncHandler(async (req, res) => {
  const sourceQuoteRecord = await getReusableUploadQuoteRecordByToken(
    req.params.quoteToken,
  );

  if (!sourceQuoteRecord) {
    throw new ApiError(404, "Upload quote not found, expired, or unavailable");
  }

  const modelPath = getManagedQuoteModelAbsolutePath(sourceQuoteRecord.file_url);

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Uploaded quote model file is no longer available");
  }

  const { material, materialColorId, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  try {
    const materialRow = await getMaterialByKey(material);

    if (!materialRow) {
      throw new ApiError(
        400,
        `Material is not configured or inactive: ${material}`,
      );
    }

    const materialColor = await resolveMaterialColor({
      materialRow,
      materialColorId,
    });

    const pricingConfig = await getCurrentPricingConfig();

    if (!pricingConfig) {
      throw new ApiError(500, "Pricing config not found");
    }

    const slicerResult = await runSliceEstimate({
      modelPath,
      material: materialRow.material_key,
      quality,
      infill: normalizedInfill,
      quantity: normalizedQuantity,
    });

    const result = calculateQuoteEstimate({
      slicerResult,
      pricingConfig,
      materialCostPerGram: materialRow.material_cost_per_gram,
      quantity: normalizedQuantity,
    });

    const expiresAt = buildQuoteExpiresAt();
    const quoteOwnerId = req.user?.id ?? sourceQuoteRecord.owner_user_id ?? null;
    let quoteAssetId = sourceQuoteRecord.quote_asset_id || null;

    if (quoteAssetId) {
      await updateQuoteAssetExpiry(quoteAssetId, expiresAt);
    } else {
      const quoteAsset = await createQuoteAsset({
        ownerUserId: quoteOwnerId,
        sourceType: "upload",
        fileObjectId: sourceQuoteRecord.file_object_id,
        fileOriginalName: sourceQuoteRecord.file_original_name,
        fileMimeType: sourceQuoteRecord.file_mime_type,
        fileSize: sourceQuoteRecord.file_size,
        thumbnailFileObjectId: sourceQuoteRecord.thumbnail_file_object_id,
        expiresAt,
      });
      quoteAssetId = quoteAsset?.id || null;

      await Promise.all([
        sourceQuoteRecord.file_object_id && quoteAssetId
          ? attachManagedFileReference({
              fileObjectId: sourceQuoteRecord.file_object_id,
              referenceType: "quote_asset",
              referenceId: quoteAssetId,
              referenceColumn: "file_object_id",
              fileRole: "model",
              ownerUserId: quoteOwnerId,
              visibility: "private",
              actorId: req.user?.id || null,
            })
          : Promise.resolve(null),
        sourceQuoteRecord.thumbnail_file_object_id && quoteAssetId
          ? attachManagedFileReference({
              fileObjectId: sourceQuoteRecord.thumbnail_file_object_id,
              referenceType: "quote_asset",
              referenceId: quoteAssetId,
              referenceColumn: "thumbnail_file_object_id",
              fileRole: "thumbnail",
              ownerUserId: quoteOwnerId,
              visibility: "private",
              actorId: req.user?.id || null,
            })
          : Promise.resolve(null),
      ]);
    }

    const { quoteToken, quoteRecord } = await createQuoteRecord({
      quoteAssetId,
      ownerUserId: quoteOwnerId,
      sourceType: "upload",
      fileUrl: sourceQuoteRecord.file_url,
      fileObjectId: sourceQuoteRecord.file_object_id,
      fileOriginalName: sourceQuoteRecord.file_original_name,
      fileMimeType: sourceQuoteRecord.file_mime_type,
      fileSize: sourceQuoteRecord.file_size,
      thumbnailUrl: sourceQuoteRecord.thumbnail_url,
      thumbnailFileObjectId: sourceQuoteRecord.thumbnail_file_object_id,
      material: materialRow.material_key,
      materialColorId: materialColor?.id ?? null,
      materialColorName: materialColor?.name ?? null,
      materialColorHex: materialColor?.hexCode ?? null,
      printQuality: quality,
      infill: normalizedInfill,
      quantity: normalizedQuantity,
      estimatedCost: result.totalPrice,
      quoteSnapshot: {
        ...result,
        sourceType: "upload",
        materialColor,
        reusedFromQuoteRecordId: sourceQuoteRecord.id,
        file: {
          url: sourceQuoteRecord.file_url,
          fileObjectId: sourceQuoteRecord.file_object_id,
          originalName: sourceQuoteRecord.file_original_name,
          mimeType: sourceQuoteRecord.file_mime_type,
          size: sourceQuoteRecord.file_size,
          thumbnailUrl: sourceQuoteRecord.thumbnail_url,
          thumbnailFileObjectId: sourceQuoteRecord.thumbnail_file_object_id,
        },
      },
      pricingConfigSnapshot: pricingConfig,
      materialSnapshot: materialRow,
      expiresAt,
    });

    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "upload",
        fileOriginalName: sourceQuoteRecord.file_original_name,
        status: "success",
        quoteRecordId: quoteRecord.id,
      }),
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          quoteToken,
          quoteExpiresAt: quoteRecord.expires_at,
          fileObjectId: sourceQuoteRecord.file_object_id,
          thumbnailFileObjectId: sourceQuoteRecord.thumbnail_file_object_id,
          thumbnailUrl: sourceQuoteRecord.thumbnail_file_object_id
            ? buildInlineDownloadUrlWithQuoteToken(
                sourceQuoteRecord.thumbnail_file_object_id,
                quoteToken,
              )
            : sourceQuoteRecord.thumbnail_url,
        },
        "Quote recalculated successfully",
      ),
    );
  } catch (error) {
    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "upload",
        fileOriginalName: sourceQuoteRecord.file_original_name,
        status: "failed",
        error,
      }),
    );

    throw error;
  }
});

const calculateLocalDesignQuote = asyncHandler(async (req, res) => {
  try {
    const localDesign = await getLocalDesignById(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  const selectedDesignFile = await getLocalDesignFileForQuote({
    localDesignId: localDesign.id,
    designFileId: req.body.designFileId,
  });

  if (!localDesign.is_print_ready || !selectedDesignFile) {
    throw new ApiError(
      400,
      "This design file is visible in the library but is not marked Print Ready for instant quote.",
    );
  }

  if (!selectedDesignFile.fileUrl) {
    throw new ApiError(400, "Local design does not have a printable file");
  }

  const modelPath = getManagedLocalDesignAbsolutePath(
    selectedDesignFile.fileUrl,
    "design",
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Local design file is no longer available");
  }

  const { material, materialColorId, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

  const materialColor = await resolveMaterialColor({
    materialRow,
    materialColorId,
  });

  const pricingConfig = await getCurrentPricingConfig();

  if (!pricingConfig) {
    throw new ApiError(500, "Pricing config not found");
  }

  const slicerResult = await runSliceEstimate({
    modelPath,
    material: materialRow.material_key,
    quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
  });

  const result = calculateQuoteEstimate({
    slicerResult,
    pricingConfig,
    materialCostPerGram: materialRow.material_cost_per_gram,
    quantity: normalizedQuantity,
  });

  const designSnapshot = buildLocalDesignSnapshot(localDesign, selectedDesignFile);
  const expiresAt = buildQuoteExpiresAt();
  const thumbnailUrl =
    selectedDesignFile.modelSnapshotUrl || localDesign.thumbnail_url || null;
  const { quoteToken, quoteRecord } = await createQuoteRecord({
    ownerUserId: req.user?.id || null,
    sourceType: "library",
    designId: localDesign.id,
    fileUrl: selectedDesignFile.fileUrl,
    fileObjectId: selectedDesignFile.fileObjectId || null,
    fileOriginalName: selectedDesignFile.originalFileName || null,
    fileMimeType: null,
    fileSize: null,
    thumbnailUrl,
    thumbnailFileObjectId:
      selectedDesignFile.modelSnapshotFileObjectId || null,
    material: materialRow.material_key,
    materialColorId: materialColor?.id ?? null,
    materialColorName: materialColor?.name ?? null,
    materialColorHex: materialColor?.hexCode ?? null,
    printQuality: quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
    estimatedCost: result.totalPrice,
    designSnapshot,
    quoteSnapshot: {
      ...result,
      sourceType: "library",
      librarySource: "local",
      materialColor,
      design: designSnapshot,
      designFile: selectedDesignFile,
      thumbnailUrl,
    },
    pricingConfigSnapshot: pricingConfig,
    materialSnapshot: materialRow,
    expiresAt,
  });
  await Promise.all([
    selectedDesignFile.fileObjectId
      ? attachManagedFileReference({
          fileObjectId: selectedDesignFile.fileObjectId,
          referenceType: "quote_record",
          referenceId: quoteRecord.id,
          referenceColumn: "file_object_id",
          fileRole: "model",
          ownerUserId: req.user?.id || null,
          visibility: "private",
          actorId: req.user?.id || null,
        })
      : Promise.resolve(null),
    selectedDesignFile.modelSnapshotFileObjectId
      ? attachManagedFileReference({
          fileObjectId: selectedDesignFile.modelSnapshotFileObjectId,
          referenceType: "quote_record",
          referenceId: quoteRecord.id,
          referenceColumn: "thumbnail_file_object_id",
          fileRole: "thumbnail",
          ownerUserId: req.user?.id || null,
          visibility: "private",
          actorId: req.user?.id || null,
        })
      : Promise.resolve(null),
  ]);

    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "library",
        sourceIdentifier: req.params.designId,
        status: "success",
        quoteRecordId: quoteRecord.id,
      }),
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          quoteToken,
          quoteExpiresAt: quoteRecord.expires_at,
          thumbnailUrl,
        },
        "Local design quote calculated successfully",
      ),
    );
  } catch (error) {
    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "library",
        sourceIdentifier: req.params.designId,
        status: "failed",
        error,
      }),
    );

    throw error;
  }
});

const calculateMmfDesignQuote = asyncHandler(async (req, res) => {
  try {
    const mmfObject = await getObjectById(req.params.objectId);
  const override = await getDesignOverrideByMmfObjectId(req.params.objectId);

  if (!override || override.is_hidden) {
    throw new ApiError(404, "MyMiniFactory design is not available");
  }

  if (!override.is_print_ready) {
    throw new ApiError(
      400,
      "MyMiniFactory design must be approved by the lab before quoting",
    );
  }

  const printReadyFile = await getMmfPrintReadyFileForQuote({
    mmfObjectId: req.params.objectId,
    printReadyFileId: req.body.printReadyFileId,
  });

  if (!printReadyFile || printReadyFile.status !== "cached") {
    throw new ApiError(
      400,
      "MyMiniFactory design is approved but does not have a cached printable file",
    );
  }

  if (!printReadyFile.cached_file_url) {
    throw new ApiError(
      400,
      "Cached MyMiniFactory printable file is missing its storage path",
    );
  }

  const modelPath = getManagedMmfPrintReadyFileAbsolutePath(
    printReadyFile.cached_file_url,
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Cached MyMiniFactory printable file is no longer available");
  }

  const { material, materialColorId, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

  const materialColor = await resolveMaterialColor({
    materialRow,
    materialColorId,
  });

  const pricingConfig = await getCurrentPricingConfig();

  if (!pricingConfig) {
    throw new ApiError(500, "Pricing config not found");
  }

  const slicerResult = await runSliceEstimate({
    modelPath,
    material: materialRow.material_key,
    quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
  });

  const result = calculateQuoteEstimate({
    slicerResult,
    pricingConfig,
    materialCostPerGram: materialRow.material_cost_per_gram,
    quantity: normalizedQuantity,
  });

  const designSnapshot = buildMmfObjectSnapshot(
    mmfObject,
    override,
    printReadyFile,
  );
  const expiresAt = buildQuoteExpiresAt();
  const thumbnailUrl =
    mmfObject.images?.find((image) => image.isPrimary)?.standardUrl ||
    mmfObject.images?.[0]?.standardUrl ||
    mmfObject.images?.[0]?.thumbnailUrl ||
    null;
  const { quoteToken, quoteRecord } = await createQuoteRecord({
    ownerUserId: req.user?.id || null,
    sourceType: "mmf",
    designId: null,
    fileUrl: printReadyFile.cached_file_url,
    fileObjectId: printReadyFile.file_object_id || null,
    fileOriginalName: printReadyFile.original_file_name,
    fileMimeType: null,
    fileSize: printReadyFile.file_size,
    thumbnailUrl,
    thumbnailFileObjectId: printReadyFile.model_snapshot_file_object_id || null,
    material: materialRow.material_key,
    materialColorId: materialColor?.id ?? null,
    materialColorName: materialColor?.name ?? null,
    materialColorHex: materialColor?.hexCode ?? null,
    printQuality: quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
    estimatedCost: result.totalPrice,
    designSnapshot,
    quoteSnapshot: {
      ...result,
      sourceType: "mmf",
      librarySource: "myminifactory",
      materialColor,
      mmfObject: designSnapshot,
      thumbnailUrl,
    },
    pricingConfigSnapshot: pricingConfig,
    materialSnapshot: materialRow,
    expiresAt,
  });
  await Promise.all([
    printReadyFile.file_object_id
      ? attachManagedFileReference({
          fileObjectId: printReadyFile.file_object_id,
          referenceType: "quote_record",
          referenceId: quoteRecord.id,
          referenceColumn: "file_object_id",
          fileRole: "model",
          ownerUserId: req.user?.id || null,
          visibility: "private",
          actorId: req.user?.id || null,
        })
      : Promise.resolve(null),
    printReadyFile.model_snapshot_file_object_id
      ? attachManagedFileReference({
          fileObjectId: printReadyFile.model_snapshot_file_object_id,
          referenceType: "quote_record",
          referenceId: quoteRecord.id,
          referenceColumn: "thumbnail_file_object_id",
          fileRole: "thumbnail",
          ownerUserId: req.user?.id || null,
          visibility: "private",
          actorId: req.user?.id || null,
        })
      : Promise.resolve(null),
  ]);

    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "mmf",
        sourceIdentifier: req.params.objectId,
        status: "success",
        quoteRecordId: quoteRecord.id,
      }),
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          quoteToken,
          quoteExpiresAt: quoteRecord.expires_at,
          thumbnailUrl,
        },
        "MyMiniFactory design quote calculated successfully",
      ),
    );
  } catch (error) {
    await recordQuoteAttemptSafely(
      buildQuoteAttemptPayload({
        req,
        sourceType: "mmf",
        sourceIdentifier: req.params.objectId,
        status: "failed",
        error,
      }),
    );

    throw error;
  }
});

const cleanupExpiredQuotes = asyncHandler(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10);
  const result = await cleanupExpiredUnusedQuotes({
    limit: Number.isInteger(limit) ? limit : 100,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        cleanup: result,
      },
      "Expired quotes cleaned up successfully",
    ),
  );
});

const getAdminQuoteReadiness = asyncHandler(async (req, res) => {
  const [materials, profiles, pricingConfig, validationEvents] =
    await Promise.all([
      listMaterialsForAdmin(),
      listSlicerProfilesForAdmin(),
      getCurrentPricingConfig(),
      listRecentSlicerProfileValidationEvents({ limit: 20 }),
    ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      buildQuoteReadinessPayload({
        materials,
        profiles,
        pricingConfig,
        validationEvents,
      }),
      "Quote readiness fetched successfully",
    ),
  );
});

const listAdminQuoteDiagnostics = asyncHandler(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10);
  const offset = Number.parseInt(req.query.offset, 10);
  const attempts = await listQuoteAttempts({
    limit: Number.isInteger(limit) ? limit : 50,
    offset: Number.isInteger(offset) ? offset : 0,
    status: req.query.status,
    cursor: req.query.cursor,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        attempts: attempts.rows,
        pagination: {
          limit: attempts.limit,
          offset: attempts.offset,
          nextCursor: attempts.nextCursor,
        },
      },
      "Quote diagnostics fetched successfully",
    ),
  );
});

export {
  calculateQuote,
  recalculateUploadQuote,
  calculateLocalDesignQuote,
  calculateMmfDesignQuote,
  getQuoteByToken,
  cleanupExpiredQuotes,
  getAdminQuoteReadiness,
  listAdminQuoteDiagnostics,
};
