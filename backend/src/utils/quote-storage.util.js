import fs from "fs";
import path from "path";
import { resolveStoragePath } from "./storage-root.util.js";

const QUOTE_STORAGE_ROOT = resolveStoragePath("quotes");
const QUOTE_MODEL_FILES_ROOT = path.join(QUOTE_STORAGE_ROOT, "models");
const QUOTE_THUMBNAILS_ROOT = path.join(QUOTE_STORAGE_ROOT, "thumbnails");

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildQuoteModelPublicPath(file) {
  if (!file?.filename) {
    return null;
  }

  return `/storage/quotes/models/${file.filename}`;
}

function buildQuoteThumbnailPublicPath(fileName) {
  if (!hasText(fileName)) {
    return null;
  }

  return `/storage/quotes/thumbnails/${path.basename(fileName)}`;
}

function getManagedQuoteModelAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/quotes/models/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(QUOTE_MODEL_FILES_ROOT, fileName);
}

function getManagedQuoteThumbnailAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/quotes/thumbnails/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(QUOTE_THUMBNAILS_ROOT, fileName);
}

async function removeManagedQuoteModelFile(publicPath) {
  const absolutePath = getManagedQuoteModelAbsolutePath(publicPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

async function removeManagedQuoteThumbnailFile(publicPath) {
  const absolutePath = getManagedQuoteThumbnailAbsolutePath(publicPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

export {
  QUOTE_MODEL_FILES_ROOT,
  QUOTE_STORAGE_ROOT,
  QUOTE_THUMBNAILS_ROOT,
  buildQuoteModelPublicPath,
  buildQuoteThumbnailPublicPath,
  getManagedQuoteModelAbsolutePath,
  getManagedQuoteThumbnailAbsolutePath,
  removeManagedQuoteModelFile,
  removeManagedQuoteThumbnailFile,
};
