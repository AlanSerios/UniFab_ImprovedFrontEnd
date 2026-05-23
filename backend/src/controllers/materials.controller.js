import fs from "fs";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  getMaterialByKeyForAdmin,
  listActiveMaterialsForQuote,
  listMaterialsForAdmin,
  createMaterial as createMaterialRecord,
  updateMaterialByKey,
  deactivateMaterialByKey,
} from "../models/materials.model.js";
import { listSlicerProfilesForAdmin } from "../models/slicer-profile.model.js";
import { registerSlicerProfileVersion } from "../services/material-profile.service.js";

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeMaterialKey(value, fieldName = "Material key") {
  if (!hasText(value)) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  return String(value).trim().toUpperCase();
}

function normalizeDisplayName(value, fallbackValue) {
  if (!hasText(value)) {
    return fallbackValue;
  }

  return String(value).trim();
}

function parseRequiredNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new ApiError(400, `${fieldName} is required`);
  }

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    throw new ApiError(400, `${fieldName} must be a valid non-negative number`);
  }

  return parsedValue;
}

function parseOptionalNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedValue = Number(value);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    throw new ApiError(400, `${fieldName} must be a valid non-negative number`);
  }

  return parsedValue;
}

function parseOptionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalizedValue)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalizedValue)) {
    return false;
  }

  throw new ApiError(400, `${fieldName} must be a valid boolean value`);
}

function parseColorOptions(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normalizeColorOption).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsedValue = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        return parsedValue.map(normalizeColorOption).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => normalizeColorOptionFromText(item))
        .filter(Boolean);
    }
  }

  return [];
}

function normalizeColorOption(item) {
  if (!item) {
    return null;
  }

  if (typeof item === "string") {
    return normalizeColorOptionFromText(item);
  }

  const name = String(item.name || item.colorName || "").trim();
  const hexCode = normalizeHexCode(item.hexCode);

  return name ? { name, hexCode } : null;
}

function normalizeColorOptionFromText(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const hexMatch = text.match(/#[0-9a-fA-F]{6}/);
  const name = text.replace(/#[0-9a-fA-F]{6}/, "").trim();

  return {
    name: name || text,
    hexCode: normalizeHexCode(hexMatch?.[0]),
  };
}

function normalizeHexCode(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function normalizePublicMaterial(material) {
  if (!material) {
    return null;
  }

  return {
    materialKey: material.material_key,
    displayName: material.display_name,
    readyQualities: material.ready_qualities || [],
    colors: material.colors || [],
  };
}

const listActiveMaterials = asyncHandler(async (req, res) => {
  const materials = (await listActiveMaterialsForQuote()).map(
    normalizePublicMaterial,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { materials },
        "Active materials fetched successfully",
      ),
    );
});

const listMaterials = asyncHandler(async (req, res) => {
  const materials = await listMaterialsForAdmin();

  return res
    .status(200)
    .json(
      new ApiResponse(200, { materials }, "Materials fetched successfully"),
    );
});

const listSlicerProfiles = asyncHandler(async (req, res) => {
  const profiles = await listSlicerProfilesForAdmin();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { profiles },
        "Slicer profiles fetched successfully",
      ),
    );
});

const createMaterial = asyncHandler(async (req, res) => {
  const materialKey = normalizeMaterialKey(req.body.materialKey);
  const existingMaterial = await getMaterialByKeyForAdmin(materialKey);

  if (existingMaterial) {
    throw new ApiError(409, `Material already exists: ${materialKey}`);
  }

  const displayName = normalizeDisplayName(req.body.displayName, materialKey);
  const materialCostPerGram = parseRequiredNonNegativeNumber(
    req.body.materialCostPerGram,
    "Material cost per gram",
  );
  const isActive =
    parseOptionalBoolean(req.body.isActiveMaterial, "isActiveMaterial") ?? true;

  const material = await createMaterialRecord({
    materialKey,
    displayName,
    materialCostPerGram,
    isActive,
    colorOptions: parseColorOptions(req.body.colorOptions),
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { material }, "Material created successfully"));
});

const updateMaterial = asyncHandler(async (req, res) => {
  const materialKey = normalizeMaterialKey(
    req.params.materialKey,
    "Material key",
  );
  const existingMaterial = await getMaterialByKeyForAdmin(materialKey);

  if (!existingMaterial) {
    throw new ApiError(404, `Material not found: ${materialKey}`);
  }

  const displayName = hasText(req.body.displayName)
    ? normalizeDisplayName(req.body.displayName, materialKey)
    : existingMaterial.display_name;

  const materialCostPerGram =
    parseOptionalNonNegativeNumber(
      req.body.materialCostPerGram,
      "Material cost per gram",
    ) ?? Number(existingMaterial.material_cost_per_gram);

  const isActive =
    parseOptionalBoolean(req.body.isActiveMaterial, "isActiveMaterial") ??
    Boolean(existingMaterial.is_active);

  const material = await updateMaterialByKey(materialKey, {
    displayName,
    materialCostPerGram,
    isActive,
    colorOptions: parseColorOptions(req.body.colorOptions),
  });

  if (!material) {
    throw new ApiError(404, `Material not found: ${materialKey}`);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { material }, "Material updated successfully"));
});

const deactivateMaterial = asyncHandler(async (req, res) => {
  const materialKey = normalizeMaterialKey(
    req.params.materialKey,
    "Material key",
  );

  const material = await deactivateMaterialByKey(materialKey);

  if (!material) {
    throw new ApiError(404, `Material not found: ${materialKey}`);
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { material }, "Material deactivated successfully"),
    );
});

const uploadSlicerProfileVersion = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Profile file is required");
  }

  const tempFilePath = req.file.path;

  try {
    const result = await registerSlicerProfileVersion({
      materialKey: req.params.materialKey,
      quality: req.body.quality,
      printerName: req.body.printerName,
      nozzle: req.body.nozzle,
      supportRule: req.body.supportRule,
      orientationRule: req.body.orientationRule,
      tempFilePath,
      originalFileName: req.file.originalname,
      uploadedBy: req.user.id,
    });

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          result,
          "Slicer profile version registered successfully",
        ),
      );
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.rm(tempFilePath, { force: true });
    }
  }
});

export {
  listActiveMaterials,
  listMaterials,
  listSlicerProfiles,
  createMaterial,
  updateMaterial,
  deactivateMaterial,
  uploadSlicerProfileVersion,
};
