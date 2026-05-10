import fs from "fs";
import path from "path";
import { getCurrentPricingConfig } from "../models/pricing-config.model.js";
import { getMaterialByKey } from "../models/materials.model.js";
import {
  createQuoteRecord,
  getValidQuoteRecordByToken,
} from "../models/quote-record.model.js";
import { getLocalDesignById } from "../models/local-design.model.js";
import { getDesignOverrideByMmfObjectId } from "../models/design-overrides.model.js";
import {
  getDesignRequestById,
  getDesignRequestByIdForOwner,
} from "../models/design-requests.model.js";
import { getObjectById } from "../services/myminifactory.service.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { runSliceEstimate } from "../services/slicer.service.js";
import { calculateQuoteEstimate } from "../utils/quote-calculator.util.js";
import {
  PRINT_REQUEST_MODEL_FILES_ROOT,
  buildPrintRequestModelPublicPath,
  removeManagedPrintRequestModelFile,
} from "../utils/print-request-storage.util.js";
import { getManagedLocalDesignAbsolutePath } from "../utils/local-design-storage.util.js";
import { cleanupExpiredUnusedQuotes } from "../services/quote-cleanup.service.js";

const QUOTE_TTL_MINUTES = 60;

function parseJsonSafely(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeQuoteRecord(quoteRecord) {
  if (!quoteRecord) {
    return null;
  }

  return {
    id: quoteRecord.id,
    sourceType: quoteRecord.source_type,
    designId: quoteRecord.design_id,
    designRequestId: quoteRecord.design_request_id,
    fileUrl: quoteRecord.file_url,
    fileOriginalName: quoteRecord.file_original_name,
    fileMimeType: quoteRecord.file_mime_type,
    fileSize: quoteRecord.file_size,
    material: quoteRecord.material,
    printQuality: quoteRecord.print_quality,
    infill: Number(quoteRecord.infill),
    quantity: Number(quoteRecord.quantity),
    estimatedCost:
      quoteRecord.estimated_cost === null
        ? null
        : Number(quoteRecord.estimated_cost),
    designSnapshot: parseJsonSafely(quoteRecord.design_snapshot),
    quoteSnapshot: parseJsonSafely(quoteRecord.quote_snapshot),
    pricingConfigSnapshot: parseJsonSafely(quoteRecord.pricing_config_snapshot),
    materialSnapshot: parseJsonSafely(quoteRecord.material_snapshot),
    expiresAt: quoteRecord.expires_at,
    createdAt: quoteRecord.created_at,
  };
}

function buildLocalDesignSnapshot(localDesign) {
  return {
    source: "local",
    id: localDesign.id,
    title: localDesign.title,
    description: localDesign.description,
    thumbnailUrl: localDesign.thumbnail_url,
    fileUrl: localDesign.file_url,
    material: localDesign.material,
    dimensions: localDesign.dimensions,
    licenseType: localDesign.license_type,
    capturedAt: new Date().toISOString(),
  };
}

function buildDesignRequestSnapshot(designRequest) {
  return {
    source: "design_request",
    id: designRequest.id,
    title: designRequest.title,
    description: designRequest.description,
    preferredMaterial: designRequest.preferred_material,
    dimensions: designRequest.dimensions,
    quantity: designRequest.quantity,
    referenceFiles: parseJsonSafely(designRequest.reference_files) || [],
    resultDesignId: designRequest.result_design_id,
    status: designRequest.status,
    capturedAt: new Date().toISOString(),
  };
}

function buildMmfObjectSnapshot(mmfObject, override, linkedLocalDesign) {
  return {
    source: "myminifactory",
    id: mmfObject.id,
    name: mmfObject.name,
    url: mmfObject.url,
    description: mmfObject.description,
    dimensions: mmfObject.dimensions,
    materialQuantity: mmfObject.materialQuantity,
    license: mmfObject.license,
    designer: mmfObject.designer,
    tags: mmfObject.tags || [],
    categories: mmfObject.categories || [],
    override: {
      id: override.id,
      isPrintReady: Boolean(override.is_print_ready),
      clientNote: override.client_note,
      linkedLocalDesignId: override.linked_local_design_id,
    },
    linkedLocalDesign: buildLocalDesignSnapshot(linkedLocalDesign),
    capturedAt: new Date().toISOString(),
  };
}

const calculateQuote = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Model file is required");
  }

  const modelPath = req.file.path;
  const fileUrl = buildPrintRequestModelPublicPath(req.file);
  const permanentModelPath = path.join(
    PRINT_REQUEST_MODEL_FILES_ROOT,
    req.file.filename,
  );
  const { material, quality, infill, quantity } = req.body;

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

    await fs.promises.mkdir(PRINT_REQUEST_MODEL_FILES_ROOT, {
      recursive: true,
    });
    await fs.promises.rename(modelPath, permanentModelPath);

    const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
    const { quoteToken, quoteRecord } = await createQuoteRecord({
      sourceType: "upload",
      fileUrl,
      fileOriginalName: req.file.originalname,
      fileMimeType: req.file.mimetype,
      fileSize: req.file.size,
      material: materialRow.material_key,
      printQuality: quality,
      infill: normalizedInfill,
      quantity: normalizedQuantity,
      estimatedCost: result.totalPrice,
      quoteSnapshot: {
        ...result,
        sourceType: "upload",
        file: {
          url: fileUrl,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        },
      },
      pricingConfigSnapshot: pricingConfig,
      materialSnapshot: materialRow,
      expiresAt,
    });

    shouldRemoveUploadedModel = false;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          ...result,
          quoteToken,
          quoteExpiresAt: quoteRecord.expires_at,
        },
        "Quote calculated successfully",
      ),
    );
  } finally {
    if (shouldRemoveUploadedModel && fileUrl) {
      await removeManagedPrintRequestModelFile(fileUrl);
      await fs.promises.rm(modelPath, { force: true });
    }
  }
});

const getQuoteByToken = asyncHandler(async (req, res) => {
  const quoteRecord = await getValidQuoteRecordByToken(req.params.quoteToken);

  if (!quoteRecord) {
    throw new ApiError(404, "Quote not found or expired");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        quote: normalizeQuoteRecord(quoteRecord),
      },
      "Quote fetched successfully",
    ),
  );
});

const calculateLocalDesignQuote = asyncHandler(async (req, res) => {
  const localDesign = await getLocalDesignById(req.params.designId);

  if (!localDesign) {
    throw new ApiError(404, "Local design not found");
  }

  if (!localDesign.is_print_ready) {
    throw new ApiError(
      400,
      "This design is visible in the library but is not marked Print Ready for instant quote.",
    );
  }

  if (!localDesign.file_url) {
    throw new ApiError(400, "Local design does not have a printable file");
  }

  const modelPath = getManagedLocalDesignAbsolutePath(
    localDesign.file_url,
    "design",
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Local design file is no longer available");
  }

  const { material, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

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

  const designSnapshot = buildLocalDesignSnapshot(localDesign);
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
  const { quoteToken, quoteRecord } = await createQuoteRecord({
    sourceType: "library",
    designId: localDesign.id,
    designRequestId: null,
    fileUrl: localDesign.file_url,
    fileOriginalName: null,
    fileMimeType: null,
    fileSize: null,
    material: materialRow.material_key,
    printQuality: quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
    estimatedCost: result.totalPrice,
    designSnapshot,
    quoteSnapshot: {
      ...result,
      sourceType: "library",
      librarySource: "local",
      design: designSnapshot,
    },
    pricingConfigSnapshot: pricingConfig,
    materialSnapshot: materialRow,
    expiresAt,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...result,
        quoteToken,
        quoteExpiresAt: quoteRecord.expires_at,
      },
      "Local design quote calculated successfully",
    ),
  );
});

const calculateDesignRequestQuote = asyncHandler(async (req, res) => {
  const designRequest = req.user?.isAdmin
    ? await getDesignRequestById(req.params.requestId)
    : await getDesignRequestByIdForOwner(req.params.requestId, req.user.id);

  if (!designRequest) {
    throw new ApiError(404, "Design request not found");
  }

  if (designRequest.status !== "completed") {
    throw new ApiError(
      400,
      "Design request must be completed before it can be quoted",
    );
  }

  if (!designRequest.result_design_id) {
    throw new ApiError(
      400,
      "Design request does not have a linked printable result design",
    );
  }

  const localDesign = await getLocalDesignById(designRequest.result_design_id);

  if (!localDesign) {
    throw new ApiError(404, "Linked result design not found or inactive");
  }

  if (!localDesign.file_url) {
    throw new ApiError(
      400,
      "Linked result design does not have a printable file",
    );
  }

  const modelPath = getManagedLocalDesignAbsolutePath(
    localDesign.file_url,
    "design",
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Linked result design file is no longer available");
  }

  const { material, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

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

  const designRequestSnapshot = buildDesignRequestSnapshot(designRequest);
  const localDesignSnapshot = buildLocalDesignSnapshot(localDesign);
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
  const { quoteToken, quoteRecord } = await createQuoteRecord({
    sourceType: "design_request",
    designId: localDesign.id,
    designRequestId: designRequest.id,
    fileUrl: localDesign.file_url,
    fileOriginalName: null,
    fileMimeType: null,
    fileSize: null,
    material: materialRow.material_key,
    printQuality: quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
    estimatedCost: result.totalPrice,
    designSnapshot: {
      designRequest: designRequestSnapshot,
      resultDesign: localDesignSnapshot,
    },
    quoteSnapshot: {
      ...result,
      sourceType: "design_request",
      designRequest: designRequestSnapshot,
      resultDesign: localDesignSnapshot,
    },
    pricingConfigSnapshot: pricingConfig,
    materialSnapshot: materialRow,
    expiresAt,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...result,
        quoteToken,
        quoteExpiresAt: quoteRecord.expires_at,
      },
      "Design request quote calculated successfully",
    ),
  );
});

const calculateMmfDesignQuote = asyncHandler(async (req, res) => {
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

  if (!override.linked_local_design_id) {
    throw new ApiError(
      400,
      "MyMiniFactory design is approved but not linked to a printable local file",
    );
  }

  const linkedLocalDesign = await getLocalDesignById(
    override.linked_local_design_id,
  );

  if (!linkedLocalDesign) {
    throw new ApiError(404, "Linked printable local design not found");
  }

  if (!linkedLocalDesign.file_url) {
    throw new ApiError(
      400,
      "Linked local design does not have a printable file",
    );
  }

  const modelPath = getManagedLocalDesignAbsolutePath(
    linkedLocalDesign.file_url,
    "design",
  );

  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new ApiError(410, "Linked local design file is no longer available");
  }

  const { material, quality, infill, quantity } = req.body;
  const normalizedInfill = Number(infill);
  const normalizedQuantity = Number(quantity);

  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

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
    linkedLocalDesign,
  );
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);
  const { quoteToken, quoteRecord } = await createQuoteRecord({
    sourceType: "mmf",
    designId: linkedLocalDesign.id,
    designRequestId: null,
    fileUrl: linkedLocalDesign.file_url,
    fileOriginalName: null,
    fileMimeType: null,
    fileSize: null,
    material: materialRow.material_key,
    printQuality: quality,
    infill: normalizedInfill,
    quantity: normalizedQuantity,
    estimatedCost: result.totalPrice,
    designSnapshot,
    quoteSnapshot: {
      ...result,
      sourceType: "mmf",
      librarySource: "myminifactory",
      mmfObject: designSnapshot,
    },
    pricingConfigSnapshot: pricingConfig,
    materialSnapshot: materialRow,
    expiresAt,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...result,
        quoteToken,
        quoteExpiresAt: quoteRecord.expires_at,
      },
      "MyMiniFactory design quote calculated successfully",
    ),
  );
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

export {
  calculateQuote,
  calculateLocalDesignQuote,
  calculateDesignRequestQuote,
  calculateMmfDesignQuote,
  getQuoteByToken,
  cleanupExpiredQuotes,
};
