import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import {
  ensureSlicerProfileStorageDir,
  getSlicerProfileFilePath,
} from "../utils/slicer-profile-path.util.js";
import { runProfileDryRun } from "./slicer.service.js";
import { createSlicerProfileValidationEvent } from "../models/slicer-profile-validation-event.model.js";
import {
  attachManagedFileReference,
  registerManagedFile,
} from "./file-storage.service.js";

const ALLOWED_QUALITIES = new Set(["draft", "standard", "fine"]);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeMaterialKey(materialKey) {
  if (!hasText(materialKey)) {
    throw new ApiError(400, "Material key is required");
  }

  return String(materialKey).trim().toUpperCase();
}

function normalizeQuality(quality) {
  if (!hasText(quality)) {
    throw new ApiError(400, "Quality is required");
  }

  const normalizedQuality = String(quality).trim().toLowerCase();

  if (!ALLOWED_QUALITIES.has(normalizedQuality)) {
    throw new ApiError(400, "Quality must be one of: draft, standard, fine");
  }

  return normalizedQuality;
}

function toSafeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getIniExtension(originalFileName) {
  if (!hasText(originalFileName)) {
    throw new ApiError(400, "Original file name is required");
  }

  const ext = path.extname(originalFileName).toLowerCase();

  if (ext !== ".ini") {
    throw new ApiError(400, "Only .ini files are allowed");
  }

  return ext;
}

function buildStoredProfileFileName({
  materialKey,
  quality,
  versionNumber,
  originalFileName,
}) {
  const ext = getIniExtension(originalFileName);
  const uniqueSuffix = randomUUID().split("-")[0];

  return `${toSafeSlug(materialKey)}-${toSafeSlug(quality)}-v${versionNumber}-${uniqueSuffix}${ext}`;
}

function validateProfileUploadInput({ tempFilePath, uploadedBy }) {
  if (!tempFilePath) {
    throw new ApiError(400, "Profile file is required");
  }

  if (!fs.existsSync(tempFilePath)) {
    throw new ApiError(400, "Uploaded profile file does not exist");
  }

  if (!Number.isInteger(Number(uploadedBy)) || Number(uploadedBy) < 1) {
    throw new ApiError(401, "Valid uploadedBy user id is required");
  }

  ensureSlicerProfileStorageDir();
}

async function createNewActiveProfileVersion({
  connection,
  materialRow,
  quality,
  printerName,
  nozzle,
  supportRule,
  orientationRule,
  tempFilePath,
  originalFileName,
  uploadedBy,
  fileState,
  validationMessage,
}) {
  const normalizedPrinterName = hasText(printerName)
    ? String(printerName).trim()
    : "Creality Ender 3 V3 SE";

  const normalizedNozzle = hasText(nozzle) ? String(nozzle).trim() : "0.4mm";

  const normalizedSupportRule = hasText(supportRule)
    ? String(supportRule).trim()
    : "auto";

  const normalizedOrientationRule = hasText(orientationRule)
    ? String(orientationRule).trim()
    : "original";

  const [versionRows] = await connection.query(
    `
      SELECT version_number
      FROM slicer_profiles
      WHERE material_id = ? AND quality = ?
      ORDER BY version_number DESC
      LIMIT 1
    `,
    [materialRow.id, quality],
  );

  const nextVersion = Number(versionRows[0]?.version_number || 0) + 1;

  const finalFileName = buildStoredProfileFileName({
    materialKey: materialRow.material_key,
    quality,
    versionNumber: nextVersion,
    originalFileName,
  });

  const finalFilePath = getSlicerProfileFilePath(finalFileName);
  fileState.finalFilePath = finalFilePath;

  await fs.promises.rename(tempFilePath, finalFilePath);
  const profileFileObject = await registerManagedFile({
    absolutePath: finalFilePath,
    publicPath: `/storage/slicer-profiles/library/${finalFileName}`,
    originalFileName,
    mimeType: "text/plain",
    visibility: "private",
    createdBy: uploadedBy,
    dedupe: false,
    connection,
  });

  await connection.query(
    `
      UPDATE slicer_profiles
      SET is_active = FALSE
      WHERE material_id = ? AND quality = ? AND is_active = TRUE
    `,
    [materialRow.id, quality],
  );

  const [insertProfileResult] = await connection.query(
    `
      INSERT INTO slicer_profiles (
        material_id,
        quality,
        printer_name,
        nozzle,
        support_rule,
        orientation_rule,
        profile_filename,
        file_object_id,
        version_number,
        is_active,
        validation_status,
        validation_message,
        validated_at,
        uploaded_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'passed', ?, NOW(), ?)
    `,
    [
      materialRow.id,
      quality,
      normalizedPrinterName,
      normalizedNozzle,
      normalizedSupportRule,
      normalizedOrientationRule,
      finalFileName,
      profileFileObject?.id || null,
      nextVersion,
      validationMessage,
      uploadedBy,
    ],
  );
  if (profileFileObject?.id) {
    await attachManagedFileReference({
      fileObjectId: profileFileObject.id,
      referenceType: "slicer_profile",
      referenceId: insertProfileResult.insertId,
      referenceColumn: "file_object_id",
      fileRole: "profile",
      ownerUserId: uploadedBy,
      visibility: "private",
      actorId: uploadedBy,
      connection,
    });
  }

  await connection.query(
    `
      INSERT INTO slicer_profile_validation_events (
        material_id,
        material_key,
        quality,
        profile_original_name,
        profile_filename,
        status,
        message,
        uploaded_by
      )
      VALUES (?, ?, ?, ?, ?, 'passed', ?, ?)
    `,
    [
      materialRow.id,
      materialRow.material_key,
      quality,
      originalFileName,
      finalFileName,
      validationMessage,
      uploadedBy,
    ],
  );

  const [profileRows] = await connection.query(
    `
      SELECT
        id,
        material_id,
        quality,
        printer_name,
        nozzle,
        support_rule,
        orientation_rule,
        profile_filename,
        version_number,
        is_active,
        validation_status,
        validation_message,
        validated_at,
        uploaded_by,
        created_at,
        updated_at
      FROM slicer_profiles
      WHERE id = ?
      LIMIT 1
    `,
    [insertProfileResult.insertId],
  );

  return profileRows[0];
}

/**
 * New long-term flow:
 * register a new slicer profile version for an existing active material only.
 */
async function registerSlicerProfileVersion({
  materialKey,
  quality,
  printerName = "Creality Ender 3 V3 SE",
  nozzle = "0.4mm",
  supportRule = "auto",
  orientationRule = "original",
  tempFilePath,
  originalFileName,
  uploadedBy,
}) {
  validateProfileUploadInput({ tempFilePath, uploadedBy });

  const normalizedMaterialKey = normalizeMaterialKey(materialKey);
  const normalizedQuality = normalizeQuality(quality);
  const [preflightMaterialRows] = await pool.query(
    `
      SELECT
        id,
        material_key,
        display_name,
        material_cost_per_gram,
        is_active
      FROM materials
      WHERE material_key = ? AND is_active = TRUE
      LIMIT 1
    `,
    [normalizedMaterialKey],
  );
  const preflightMaterial = preflightMaterialRows[0];

  if (!preflightMaterial) {
    throw new ApiError(
      404,
      `Active material not found for key: ${normalizedMaterialKey}`,
    );
  }

  let validationMessage = "Dry-run validation passed.";

  try {
    const validationResult = await runProfileDryRun({
      configPath: tempFilePath,
      infill: 20,
    });
    const minutes = Math.round(
      Number(validationResult.estimatedPrintTimeMinutes || 0),
    );
    const grams = Number(validationResult.filamentWeightGrams || 0).toFixed(2);
    validationMessage = `Dry-run validation passed using sample cube (${minutes} min, ${grams} g).`;
  } catch (error) {
    try {
      await createSlicerProfileValidationEvent({
        materialId: preflightMaterial.id,
        materialKey: preflightMaterial.material_key,
        quality: normalizedQuality,
        profileOriginalName: originalFileName,
        status: "failed",
        message: error.message || "Dry-run validation failed.",
        uploadedBy,
      });
    } catch (eventError) {
      console.error(
        `Failed to record slicer profile validation event: ${eventError.message}`,
      );
    }

    throw new ApiError(
      error.statusCode || 422,
      `Slicer profile dry-run validation failed: ${error.message}`,
    );
  }

  const connection = await pool.getConnection();
  const fileState = { finalFilePath: null };

  try {
    await connection.beginTransaction();

    const [materialRows] = await connection.query(
      `
        SELECT
          id,
          material_key,
          display_name,
          material_cost_per_gram,
          is_active,
          created_at,
          updated_at
        FROM materials
        WHERE material_key = ? AND is_active = TRUE
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedMaterialKey],
    );

    const materialRow = materialRows[0];

    if (!materialRow) {
      throw new ApiError(
        404,
        `Active material not found for key: ${normalizedMaterialKey}`,
      );
    }

    const slicerProfile = await createNewActiveProfileVersion({
      connection,
      materialRow,
      quality: normalizedQuality,
      printerName,
      nozzle,
      supportRule,
      orientationRule,
      tempFilePath,
      originalFileName,
      uploadedBy,
      fileState,
      validationMessage,
    });

    await connection.commit();

    return {
      material: materialRow,
      slicerProfile,
    };
  } catch (error) {
    await connection.rollback();

    if (fileState.finalFilePath && fs.existsSync(fileState.finalFilePath)) {
      await fs.promises.rm(fileState.finalFilePath, { force: true });
    }

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.rm(tempFilePath, { force: true });
    }

    throw error;
  } finally {
    connection.release();
  }
}

export { registerSlicerProfileVersion };
