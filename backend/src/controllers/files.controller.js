import fs from "fs";
import path from "path";
import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getValidQuoteRecordByToken } from "../models/quote-record.model.js";
import {
  createFileEvent,
  getFileObjectAccessContext,
} from "../models/file-registry.model.js";
import { getAbsolutePathForStorageKey } from "../services/file-storage.service.js";
import {
  buildContentDisposition,
  sanitizeDownloadFileName,
} from "../utils/content-disposition.util.js";

async function isApprovedPublicLocalDesign(reference) {
  if (
    ![
      "local_design",
      "local_design_file",
      "local_design_image",
      "local_design_moderation_render",
    ].includes(reference.reference_type)
  ) {
    return false;
  }

  const joinByReference =
    reference.reference_type === "local_design_file"
      ? "INNER JOIN local_design_files asset ON asset.local_design_id = ld.id"
      : reference.reference_type === "local_design_image"
        ? "INNER JOIN local_design_images asset ON asset.local_design_id = ld.id"
        : reference.reference_type === "local_design_moderation_render"
          ? "INNER JOIN local_design_moderation_renders asset ON asset.local_design_id = ld.id"
          : "";
  const where =
    reference.reference_type === "local_design" ? "ld.id = ?" : "asset.id = ?";
  const [rows] = await pool.query(
    `
      SELECT ld.id
      FROM local_designs ld
      ${joinByReference}
      WHERE ${where}
        AND ld.is_active = TRUE
        AND ld.archived_at IS NULL
        AND ld.deleted_at IS NULL
        AND ld.is_library_hidden = FALSE
        AND (
          ld.moderation_status = 'admin_approved'
          OR (
            ld.moderation_status = 'auto_approved'
            AND ld.latest_moderation_run_id IS NOT NULL
            AND ld.moderation_content_hash IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM local_design_moderation_runs ldmr
              WHERE ldmr.id = ld.latest_moderation_run_id
                AND ldmr.local_design_id = ld.id
                AND ldmr.status = 'completed'
                AND ldmr.final_decision = 'auto_approved'
                AND ldmr.content_hash = ld.moderation_content_hash
            )
          )
        )
      LIMIT 1
    `,
    [reference.reference_id],
  );

  return rows.length > 0;
}

function isPublicCatalogPreviewReference(reference) {
  return (
    reference.reference_type === "mmf_print_ready_file" &&
    ["model_snapshot", "thumbnail", "preview"].includes(reference.file_role)
  );
}

async function isOwnedLocalDesign(reference, userId) {
  if (
    !userId ||
    ![
      "local_design",
      "local_design_file",
      "local_design_image",
      "local_design_moderation_render",
    ].includes(reference.reference_type)
  ) {
    return false;
  }

  const [rows] = await pool.query(
    `
      SELECT ld.id
      FROM local_designs ld
      LEFT JOIN local_design_files ldf ON ldf.local_design_id = ld.id
      LEFT JOIN local_design_images ldi ON ldi.local_design_id = ld.id
      LEFT JOIN local_design_moderation_renders ldmr ON ldmr.local_design_id = ld.id
      WHERE ld.uploaded_by = ?
        AND (
          (ld.id = ? AND ? = 'local_design')
          OR (ldf.id = ? AND ? = 'local_design_file')
          OR (ldi.id = ? AND ? = 'local_design_image')
          OR (ldmr.id = ? AND ? = 'local_design_moderation_render')
        )
      LIMIT 1
    `,
    [
      userId,
      reference.reference_id,
      reference.reference_type,
      reference.reference_id,
      reference.reference_type,
      reference.reference_id,
      reference.reference_type,
      reference.reference_id,
      reference.reference_type,
    ],
  );

  return rows.length > 0;
}

async function isOwnedPrintRequest(reference, userId) {
  if (!userId) return false;

  if (reference.reference_type === "print_request") {
    const [rows] = await pool.query(
      "SELECT id FROM print_requests WHERE id = ? AND client_id = ? LIMIT 1",
      [reference.reference_id, userId],
    );
    return rows.length > 0;
  }

  if (reference.reference_type === "print_request_item") {
    const [rows] = await pool.query(
      `
        SELECT pri.id
        FROM print_request_items pri
        INNER JOIN print_requests pr ON pr.id = pri.print_request_id
        WHERE pri.id = ? AND pr.client_id = ?
        LIMIT 1
      `,
      [reference.reference_id, userId],
    );
    return rows.length > 0;
  }

  return false;
}

async function getReferenceOriginalFileName(reference) {
  if (!reference || reference.status !== "active") {
    return null;
  }

  const modelReferenceTypes = new Set([
    "quote_asset",
    "quote_record",
    "print_request",
    "print_request_item",
    "local_design_file",
    "mmf_print_ready_file",
  ]);

  if (
    modelReferenceTypes.has(reference.reference_type) &&
    reference.file_role !== "model"
  ) {
    return null;
  }

  if (reference.reference_type === "quote_record") {
    const [rows] = await pool.query(
      "SELECT file_original_name FROM quote_records WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.file_original_name || null;
  }

  if (reference.reference_type === "quote_asset") {
    const [rows] = await pool.query(
      "SELECT file_original_name FROM quote_assets WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.file_original_name || null;
  }

  if (reference.reference_type === "print_request") {
    const [rows] = await pool.query(
      "SELECT file_original_name FROM print_requests WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.file_original_name || null;
  }

  if (reference.reference_type === "print_request_item") {
    const [rows] = await pool.query(
      "SELECT file_original_name FROM print_request_items WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.file_original_name || null;
  }

  if (reference.reference_type === "local_design_file") {
    const [rows] = await pool.query(
      "SELECT original_file_name FROM local_design_files WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.original_file_name || null;
  }

  if (reference.reference_type === "local_design_image") {
    const [rows] = await pool.query(
      "SELECT original_file_name FROM local_design_images WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.original_file_name || null;
  }

  if (reference.reference_type === "mmf_print_ready_file") {
    const [rows] = await pool.query(
      "SELECT original_file_name FROM mmf_print_ready_files WHERE id = ? LIMIT 1",
      [reference.reference_id],
    );
    return rows[0]?.original_file_name || null;
  }

  return null;
}

async function resolveDownloadFileName({ fileObject, references }) {
  const activeReferences = references.filter(
    (reference) => reference.status === "active",
  );

  for (const reference of activeReferences) {
    const referenceFileName = await getReferenceOriginalFileName(reference);

    if (referenceFileName) {
      return referenceFileName;
    }
  }

  return fileObject.originalFileName || path.basename(fileObject.storageKey);
}

async function hasValidQuoteToken(reference, fileObject, quoteToken) {
  if (
    !["quote_record", "quote_asset"].includes(reference.reference_type) ||
    !quoteToken
  ) {
    return false;
  }

  const quoteRecord = await getValidQuoteRecordByToken(quoteToken);

  if (!quoteRecord) {
    return false;
  }

  if (reference.reference_type === "quote_asset") {
    return (
      Number(quoteRecord.quote_asset_id) === Number(reference.reference_id) &&
      (Number(quoteRecord.file_object_id) === Number(fileObject.id) ||
        Number(quoteRecord.thumbnail_file_object_id) === Number(fileObject.id))
    );
  }

  return Boolean(
    Number(quoteRecord.id) === Number(reference.reference_id) &&
      (Number(quoteRecord.file_object_id) === Number(fileObject.id) ||
        Number(quoteRecord.thumbnail_file_object_id) === Number(fileObject.id)),
  );
}

async function canAccessFile({ req, fileObject, references }) {
  if (req.user?.isAdmin) {
    return true;
  }

  const activeReferences = references.filter(
    (reference) => reference.status === "active",
  );

  for (const reference of activeReferences) {
    if (
      fileObject.visibility === "public" &&
      ((await isApprovedPublicLocalDesign(reference)) ||
        isPublicCatalogPreviewReference(reference))
    ) {
      return true;
    }

    if (
      await hasValidQuoteToken(reference, fileObject, req.query?.quoteToken)
    ) {
      return true;
    }

    if (Number(reference.owner_user_id) === Number(req.user?.id)) {
      return true;
    }

    if (await isOwnedPrintRequest(reference, req.user?.id)) {
      return true;
    }

    if (await isOwnedLocalDesign(reference, req.user?.id)) {
      return true;
    }

    if (await isApprovedPublicLocalDesign(reference)) {
      return true;
    }
  }

  const retainedOwnerDesignReferences = references.filter(
    (reference) =>
      reference.status === "owner_deleted" &&
      [
        "local_design",
        "local_design_file",
        "local_design_image",
        "local_design_moderation_render",
      ].includes(reference.reference_type),
  );

  for (const reference of retainedOwnerDesignReferences) {
    if (
      Number(reference.owner_user_id) === Number(req.user?.id) ||
      (await isOwnedLocalDesign(reference, req.user?.id))
    ) {
      return true;
    }
  }

  return false;
}

const downloadFile = asyncHandler(async (req, res) => {
  const fileObjectId = Number(req.params.fileObjectId);

  if (!Number.isInteger(fileObjectId) || fileObjectId < 1) {
    throw new ApiError(400, "Invalid file id");
  }

  const context = await getFileObjectAccessContext(fileObjectId);

  if (!context?.fileObject) {
    throw new ApiError(404, "File not found");
  }

  const { fileObject, references } = context;

  if (fileObject.storageStatus !== "present") {
    throw new ApiError(410, "File is no longer available");
  }

  if (!(await canAccessFile({ req, fileObject, references }))) {
    await createFileEvent({
      fileObjectId,
      eventType: "access_denied",
      actorId: req.user?.id || null,
      summary: "File download denied by access policy.",
      metadata: {
        references: references.map((reference) => ({
          id: reference.id,
          type: reference.reference_type,
          role: reference.file_role,
          status: reference.status,
        })),
      },
    });
    throw new ApiError(403, "You do not have permission to access this file");
  }

  const absolutePath = getAbsolutePathForStorageKey(fileObject.storageKey);

  if (!fs.existsSync(absolutePath)) {
    throw new ApiError(410, "File is missing from storage");
  }

  await createFileEvent({
    fileObjectId,
    eventType: "access_granted",
    actorId: req.user?.id || null,
    summary: "File download granted.",
  });

  const fileName = sanitizeDownloadFileName(
    await resolveDownloadFileName({ fileObject, references }),
  );
  const isInline = ["1", "true"].includes(
    String(req.query?.inline || "").toLowerCase(),
  );

  res.setHeader("X-Content-Type-Options", "nosniff");

  if (fileObject.mimeType) {
    res.setHeader("Content-Type", fileObject.mimeType);
  }

  res.setHeader(
    "Content-Disposition",
    buildContentDisposition(isInline ? "inline" : "attachment", fileName),
  );
  return res.sendFile(absolutePath);
});

export { downloadFile };
