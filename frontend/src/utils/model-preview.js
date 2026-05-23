import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const SUPPORTED_MODEL_EXTENSIONS = new Set([".stl", ".obj", ".3mf"]);
const RAW_MODEL_STORAGE_PATHS = [
  "/storage/local-designs/files/",
  "/storage/mmf-print-ready/files/",
  "/storage/print-requests/models/",
];

export function assetUrl(path) {
  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path) || String(path).startsWith("blob:")) {
    return path;
  }

  return `${API_ORIGIN}${String(path).startsWith("/") ? "" : "/"}${path}`;
}

export function normalizeModelExtension(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const extension = normalized.startsWith(".") ? normalized : `.${normalized}`;
  return SUPPORTED_MODEL_EXTENSIONS.has(extension) ? extension : null;
}

export function getPathExtension(value) {
  if (!value) {
    return null;
  }

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return normalizeModelExtension(match?.[0]);
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function isRawModelStorageUrl(value) {
  if (!value) {
    return false;
  }

  let pathname = String(value);

  try {
    pathname = new URL(value).pathname;
  } catch {
    pathname = String(value).split(/[?#]/)[0];
  }

  return RAW_MODEL_STORAGE_PATHS.some((prefix) => pathname.startsWith(prefix));
}

function buildFileDownloadUrl(fileObjectId) {
  return fileObjectId
    ? `${API_BASE_URL}/files/${encodeURIComponent(fileObjectId)}/download?inline=1`
    : null;
}

export function normalizeModelPreview(source = {}) {
  const file = source.file || null;
  const snapshotSource = firstValue(
    source.snapshotUrl,
    source.modelSnapshotUrl,
    source.thumbnailUrl,
    source.imageUrl,
  );
  const fileObjectId = firstValue(
    source.fileObjectId,
    source.file_object_id,
    source.modelFileObjectId,
    source.file?.fileObjectId,
  );
  const rawModelUrl = firstValue(
    source.modelUrl,
    source.fileUrl,
    source.cachedFileUrl,
    source.url,
    source.file?.url,
    source.file?.fileUrl,
    source.file?.cachedFileUrl,
  );
  const fileName = firstValue(
    source.fileName,
    source.originalFileName,
    source.fileOriginalName,
    source.originalName,
    source.displayFileName,
    source.file?.name,
    source.file?.originalFileName,
    source.file?.originalName,
    rawModelUrl,
  );
  const extension =
    normalizeModelExtension(source.extension) ||
    normalizeModelExtension(source.file?.extension) ||
    getPathExtension(file?.name) ||
    getPathExtension(fileName) ||
    getPathExtension(rawModelUrl);
  const downloadUrl = buildFileDownloadUrl(fileObjectId);
  const modelUrl = downloadUrl || assetUrl(rawModelUrl);
  const snapshotUrl = assetUrl(snapshotSource);
  const isLegacyRawModel = !downloadUrl && isRawModelStorageUrl(rawModelUrl);

  if (!file && !modelUrl) {
    return {
      file,
      modelUrl: null,
      snapshotUrl,
      fileName,
      extension,
      fileObjectId: fileObjectId || null,
      canPreview: false,
      errorReason: "No model file is available for preview.",
    };
  }

  if (isLegacyRawModel) {
    return {
      file,
      modelUrl: null,
      snapshotUrl,
      fileName,
      extension,
      fileObjectId: fileObjectId || null,
      canPreview: false,
      errorReason:
        "This model needs a registered secure download URL before it can be previewed.",
    };
  }

  if (!extension) {
    return {
      file,
      modelUrl,
      snapshotUrl,
      fileName,
      extension,
      fileObjectId: fileObjectId || null,
      canPreview: false,
      errorReason: "Preview supports STL, OBJ, and 3MF model files only.",
    };
  }

  return {
    file,
    modelUrl,
    snapshotUrl,
    fileName,
    extension,
    fileObjectId: fileObjectId || null,
    canPreview: true,
    errorReason: "",
  };
}
