import fs from "fs";
import { createHash } from "crypto";
import {
  createLocalDesignFile,
  createLocalDesignImage,
  createLocalDesignModelSnapshotRender,
  getLocalDesignFileByChecksum,
  getLocalDesignImageByChecksum,
  getLocalDesignImageByUrl,
} from "../models/local-design.model.js";
import {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
} from "../middlewares/local-design-upload.middleware.js";
import {
  getManagedLocalDesignAbsolutePath,
  removeManagedLocalDesignFile,
} from "../utils/local-design-storage.util.js";
import {
  attachManagedFileReference,
  registerManagedPublicPath,
} from "./file-storage.service.js";
import { generateStoredLocalDesignSnapshot } from "../utils/model-snapshot.util.js";

function getUploadedFiles(req, ...fieldNames) {
  const uploadedFiles = [];

  for (const fieldName of fieldNames) {
    const files = req.files?.[fieldName];

    if (Array.isArray(files) && files.length > 0) {
      uploadedFiles.push(...files);
    }
  }

  return uploadedFiles;
}

function buildStoredLocalDesignPath(file, fileType) {
  if (!file?.filename) {
    return null;
  }

  if (fileType === "design") {
    return `/storage/local-designs/files/${file.filename}`;
  }

  if (fileType === "thumbnail") {
    return `/storage/local-designs/thumbnails/${file.filename}`;
  }

  return null;
}

function getUploadExtension(file) {
  const name = file?.originalname || file?.filename || "";
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : null;
}

async function getUploadedFileChecksum(file) {
  if (!file?.path) {
    return null;
  }

  try {
    const fileBuffer = await fs.promises.readFile(file.path);
    return createHash("sha256").update(fileBuffer).digest("hex");
  } catch {
    return null;
  }
}

async function buildLocalDesignFilePayload({
  localDesignId,
  file,
  sortOrder,
  isPrimary,
  isPrintReady = false,
  actorId = null,
  connection = null,
  generatedSnapshotPaths = null,
}) {
  const fileUrl = buildStoredLocalDesignPath(file, "design");
  const modelPath = getManagedLocalDesignAbsolutePath(fileUrl, "design");
  const modelSnapshotUrl =
    modelPath && fs.existsSync(modelPath)
      ? await generateStoredLocalDesignSnapshot(modelPath)
      : null;

  if (modelSnapshotUrl && Array.isArray(generatedSnapshotPaths)) {
    generatedSnapshotPaths.push(modelSnapshotUrl);
  }

  const checksumSha256 = await getUploadedFileChecksum(file);
  const fileObject = modelPath
    ? await registerManagedPublicPath({
        publicPath: fileUrl,
        originalFileName: file.originalname || file.filename || null,
        mimeType: file.mimetype || null,
        visibility: "private",
        createdBy: actorId,
        connection,
      })
    : null;
  const modelSnapshotFileObject = modelSnapshotUrl
    ? await registerManagedPublicPath({
        publicPath: modelSnapshotUrl,
        originalFileName: `${file.originalname || file.filename || "model"}-snapshot.png`,
        mimeType: "image/png",
        visibility: "public",
        createdBy: actorId,
        connection,
      })
    : null;

  return {
    localDesignId,
    fileUrl: fileObject?.publicPath || fileUrl,
    uploadedFileUrl: fileUrl,
    fileObjectId: fileObject?.id || null,
    modelSnapshotUrl: modelSnapshotFileObject?.publicPath || modelSnapshotUrl,
    modelSnapshotFileObjectId: modelSnapshotFileObject?.id || null,
    originalFileName: file.originalname || file.filename || null,
    extension: getUploadExtension(file),
    fileSize: fileObject?.fileSize || file.size || null,
    checksumSha256: fileObject?.checksumSha256 || checksumSha256,
    sortOrder,
    isPrimary,
    isPrintReady,
  };
}

async function persistUploadedLocalDesignAssets({
  localDesignId,
  designFiles,
  thumbnailImages,
  connection,
  primaryFileIndex = 0,
  primaryImageIndex = 0,
  fileSortOffset = 0,
  imageSortOffset = 0,
  isPrintReady = false,
  actorId = null,
  generatedSnapshotPaths = null,
}) {
  const seenFileChecksums = new Set();
  let persistedFileIndex = 0;
  const persistedFiles = [];
  const persistedImages = [];
  const duplicateDesignPaths = [];
  const duplicateThumbnailPaths = [];

  for (const [index, file] of designFiles.entries()) {
    const checksumSha256 = await getUploadedFileChecksum(file);

    if (checksumSha256) {
      const uploadedFileUrl = buildStoredLocalDesignPath(file, "design");

      if (seenFileChecksums.has(checksumSha256)) {
        duplicateDesignPaths.push(uploadedFileUrl);
        continue;
      }

      const existingFile = await getLocalDesignFileByChecksum(
        {
          localDesignId,
          checksumSha256,
        },
        connection,
      );

      if (existingFile) {
        seenFileChecksums.add(checksumSha256);
        duplicateDesignPaths.push(uploadedFileUrl);
        continue;
      }

      seenFileChecksums.add(checksumSha256);
    }

    const filePayload = await buildLocalDesignFilePayload({
      localDesignId,
      file,
      sortOrder: fileSortOffset + persistedFileIndex,
      isPrimary: index === primaryFileIndex,
      isPrintReady: index === primaryFileIndex && isPrintReady,
      actorId,
      connection,
      generatedSnapshotPaths,
    });

    const fileRecord = await createLocalDesignFile(filePayload, connection);
    persistedFiles.push(fileRecord);
    persistedFileIndex += 1;
    if (fileRecord?.fileObjectId) {
      await attachManagedFileReference({
        fileObjectId: fileRecord.fileObjectId,
        referenceType: "local_design_file",
        referenceId: fileRecord.id,
        referenceColumn: "file_object_id",
        fileRole: "model",
        ownerUserId: actorId,
        visibility: "private",
        actorId,
        connection,
      });
    }
    if (fileRecord?.modelSnapshotFileObjectId) {
      await attachManagedFileReference({
        fileObjectId: fileRecord.modelSnapshotFileObjectId,
        referenceType: "local_design_file",
        referenceId: fileRecord.id,
        referenceColumn: "model_snapshot_file_object_id",
        fileRole: "thumbnail",
        ownerUserId: actorId,
        visibility: "public",
        actorId,
        connection,
      });
    }

    if (fileRecord?.modelSnapshotUrl) {
      await createLocalDesignModelSnapshotRender(
        {
          localDesignId,
          angleLabel: `file-${fileRecord.id}`,
          imageUrl: fileRecord.modelSnapshotUrl,
          fileObjectId: fileRecord.modelSnapshotFileObjectId || null,
        },
        connection,
      );
    }
  }

  const seenImageUrls = new Set();
  const seenImageChecksums = new Set();
  let persistedImageIndex = 0;

  for (const [index, file] of thumbnailImages.entries()) {
    const imageUrl = buildStoredLocalDesignPath(file, "thumbnail");
    const checksumSha256 = await getUploadedFileChecksum(file);

    if (!imageUrl || seenImageUrls.has(imageUrl)) {
      if (imageUrl) duplicateThumbnailPaths.push(imageUrl);
      continue;
    }

    if (checksumSha256) {
      if (seenImageChecksums.has(checksumSha256)) {
        duplicateThumbnailPaths.push(imageUrl);
        continue;
      }

      const existingImageByChecksum = await getLocalDesignImageByChecksum(
        {
          localDesignId,
          checksumSha256,
        },
        connection,
      );

      if (existingImageByChecksum) {
        seenImageChecksums.add(checksumSha256);
        duplicateThumbnailPaths.push(imageUrl);
        continue;
      }

      seenImageChecksums.add(checksumSha256);
    }

    const imagePath = getManagedLocalDesignAbsolutePath(imageUrl, "thumbnail");
    const imageFileObject = imagePath
      ? await registerManagedPublicPath({
          publicPath: imageUrl,
          originalFileName: file.originalname || file.filename || null,
          mimeType: file.mimetype || null,
          visibility: "public",
          createdBy: actorId,
          connection,
        })
      : null;
    const resolvedImageUrl = imageFileObject?.publicPath || imageUrl;
    const resolvedImageChecksum =
      imageFileObject?.checksumSha256 || checksumSha256;

    const existingImage = await getLocalDesignImageByUrl(
      {
        localDesignId,
        imageUrl: resolvedImageUrl,
      },
      connection,
    );

    if (existingImage) {
      seenImageUrls.add(resolvedImageUrl);
      duplicateThumbnailPaths.push(imageUrl);
      continue;
    }

    seenImageUrls.add(resolvedImageUrl);

    const imageRecord = await createLocalDesignImage(
      {
        localDesignId,
        imageUrl: resolvedImageUrl,
        fileObjectId: imageFileObject?.id || null,
        originalFileName: file.originalname || file.filename || null,
        checksumSha256: resolvedImageChecksum,
        sortOrder: imageSortOffset + persistedImageIndex,
        isPrimary: index === primaryImageIndex,
      },
      connection,
    );
    if (imageRecord?.fileObjectId) {
      await attachManagedFileReference({
        fileObjectId: imageRecord.fileObjectId,
        referenceType: "local_design_image",
        referenceId: imageRecord.id,
        referenceColumn: "file_object_id",
        fileRole: "thumbnail",
        ownerUserId: actorId,
        visibility: "public",
        actorId,
        connection,
      });
    }
    persistedImages.push(imageRecord);

    persistedImageIndex += 1;
  }

  return {
    files: persistedFiles,
    images: persistedImages,
    duplicateDesignPaths,
    duplicateThumbnailPaths,
  };
}

async function cleanupNewUploadedLocalDesignAssets(req) {
  const uploadedDesignFiles = getUploadedFiles(
    req,
    LOCAL_DESIGN_FILE_UPLOAD_FIELD,
    LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  );
  const uploadedThumbnailImages = getUploadedFiles(
    req,
    LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
    LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  );

  for (const uploadedDesignFile of uploadedDesignFiles) {
    const uploadedDesignPath = buildStoredLocalDesignPath(
      uploadedDesignFile,
      "design",
    );
    await removeManagedLocalDesignFile(uploadedDesignPath, "design");
  }

  for (const uploadedThumbnailImage of uploadedThumbnailImages) {
    const uploadedThumbnailPath = buildStoredLocalDesignPath(
      uploadedThumbnailImage,
      "thumbnail",
    );
    await removeManagedLocalDesignFile(uploadedThumbnailPath, "thumbnail");
  }
}

async function cleanupManagedLocalDesignPublicPaths(publicPaths, assetType) {
  for (const publicPath of publicPaths.filter(Boolean)) {
    try {
      await removeManagedLocalDesignFile(publicPath, assetType);
    } catch {
      // Best-effort cleanup; the DB transaction has already decided ownership.
    }
  }
}

export {
  buildStoredLocalDesignPath,
  cleanupManagedLocalDesignPublicPaths,
  cleanupNewUploadedLocalDesignAssets,
  getUploadedFiles,
  persistUploadedLocalDesignAssets,
};
