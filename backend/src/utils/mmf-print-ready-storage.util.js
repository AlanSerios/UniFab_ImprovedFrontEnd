import fs from "fs";
import path from "path";
import { getManagedLocalDesignAbsolutePath } from "./local-design-storage.util.js";
import { resolveStoragePath } from "./storage-root.util.js";

const MMF_PRINT_READY_STORAGE_ROOT = resolveStoragePath("mmf-print-ready");

const MMF_PRINT_READY_FILES_ROOT = path.join(
  MMF_PRINT_READY_STORAGE_ROOT,
  "files",
);

const MMF_PRINT_READY_THUMBNAILS_ROOT = path.join(
  MMF_PRINT_READY_STORAGE_ROOT,
  "thumbnails",
);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildMmfPrintReadyFilePublicPath(fileName) {
  return `/storage/mmf-print-ready/files/${path.basename(fileName)}`;
}

function buildMmfPrintReadyThumbnailPublicPath(fileName) {
  return `/storage/mmf-print-ready/thumbnails/${path.basename(fileName)}`;
}

function getManagedMmfPrintReadyFileAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/mmf-print-ready/files/";

  if (normalizedPublicPath.startsWith("/storage/local-designs/files/")) {
    return getManagedLocalDesignAbsolutePath(normalizedPublicPath, "design");
  }

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(MMF_PRINT_READY_FILES_ROOT, fileName);
}

function getManagedMmfPrintReadyThumbnailAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/mmf-print-ready/thumbnails/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(MMF_PRINT_READY_THUMBNAILS_ROOT, fileName);
}

async function removeManagedMmfPrintReadyFile(publicPath) {
  if (
    !hasText(publicPath) ||
    !String(publicPath).trim().startsWith("/storage/mmf-print-ready/files/")
  ) {
    return false;
  }

  const absolutePath = getManagedMmfPrintReadyFileAbsolutePath(publicPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

async function removeManagedMmfPrintReadyThumbnail(publicPath) {
  const absolutePath = getManagedMmfPrintReadyThumbnailAbsolutePath(publicPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

export {
  MMF_PRINT_READY_STORAGE_ROOT,
  MMF_PRINT_READY_FILES_ROOT,
  MMF_PRINT_READY_THUMBNAILS_ROOT,
  buildMmfPrintReadyFilePublicPath,
  buildMmfPrintReadyThumbnailPublicPath,
  getManagedMmfPrintReadyFileAbsolutePath,
  getManagedMmfPrintReadyThumbnailAbsolutePath,
  removeManagedMmfPrintReadyFile,
  removeManagedMmfPrintReadyThumbnail,
};
