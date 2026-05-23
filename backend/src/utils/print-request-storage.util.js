import fs from "fs";
import path from "path";
import { resolveStoragePath } from "./storage-root.util.js";

const PRINT_REQUEST_STORAGE_ROOT = resolveStoragePath("print-requests");

const PRINT_REQUEST_MODEL_FILES_ROOT = path.join(
  PRINT_REQUEST_STORAGE_ROOT,
  "models",
);

const PRINT_REQUEST_PAYMENT_SLIPS_ROOT = path.join(
  PRINT_REQUEST_STORAGE_ROOT,
  "payment-slips",
);

const PRINT_REQUEST_THUMBNAILS_ROOT = path.join(
  PRINT_REQUEST_STORAGE_ROOT,
  "thumbnails",
);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildPrintRequestModelPublicPath(file) {
  if (!file?.filename) {
    return null;
  }

  return `/storage/print-requests/models/${file.filename}`;
}

function getManagedPrintRequestModelAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/print-requests/models/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(PRINT_REQUEST_MODEL_FILES_ROOT, fileName);
}

function getManagedPrintRequestPaymentSlipAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/print-requests/payment-slips/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(PRINT_REQUEST_PAYMENT_SLIPS_ROOT, fileName);
}

function buildPrintRequestThumbnailPublicPath(fileName) {
  if (!hasText(fileName)) {
    return null;
  }

  return `/storage/print-requests/thumbnails/${path.basename(fileName)}`;
}

function getManagedPrintRequestThumbnailAbsolutePath(publicPath) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();
  const publicPrefix = "/storage/print-requests/thumbnails/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  return path.resolve(PRINT_REQUEST_THUMBNAILS_ROOT, fileName);
}

async function removeManagedPrintRequestModelFile(publicPath) {
  const absolutePath = getManagedPrintRequestModelAbsolutePath(publicPath);

  if (!absolutePath) {
    return false;
  }

  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

async function removeManagedPrintRequestPaymentSlipFile(publicPath) {
  const absolutePath = getManagedPrintRequestPaymentSlipAbsolutePath(publicPath);

  if (!absolutePath) {
    return false;
  }

  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

async function removeManagedPrintRequestThumbnailFile(publicPath) {
  const absolutePath = getManagedPrintRequestThumbnailAbsolutePath(publicPath);

  if (!absolutePath) {
    return false;
  }

  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  await fs.promises.rm(absolutePath, { force: true });
  return true;
}

export {
  PRINT_REQUEST_STORAGE_ROOT,
  PRINT_REQUEST_MODEL_FILES_ROOT,
  PRINT_REQUEST_PAYMENT_SLIPS_ROOT,
  PRINT_REQUEST_THUMBNAILS_ROOT,
  buildPrintRequestModelPublicPath,
  buildPrintRequestThumbnailPublicPath,
  getManagedPrintRequestModelAbsolutePath,
  getManagedPrintRequestPaymentSlipAbsolutePath,
  getManagedPrintRequestThumbnailAbsolutePath,
  removeManagedPrintRequestModelFile,
  removeManagedPrintRequestPaymentSlipFile,
  removeManagedPrintRequestThumbnailFile,
};
