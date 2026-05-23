import fs from "fs";
import path from "path";
import { resolveStoragePath } from "./storage-root.util.js";

const LOCAL_DESIGN_STORAGE_ROOT = resolveStoragePath("local-designs");

const LOCAL_DESIGN_FILES_ROOT = path.join(LOCAL_DESIGN_STORAGE_ROOT, "files");
const LOCAL_DESIGN_THUMBNAILS_ROOT = path.join(
  LOCAL_DESIGN_STORAGE_ROOT,
  "thumbnails",
);

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getManagedLocalDesignAbsolutePath(publicPath, assetType) {
  if (!hasText(publicPath)) {
    return null;
  }

  const normalizedPublicPath = String(publicPath).trim();

  const publicPrefix =
    assetType === "design"
      ? "/storage/local-designs/files/"
      : "/storage/local-designs/thumbnails/";

  if (!normalizedPublicPath.startsWith(publicPrefix)) {
    return null;
  }

  const fileName = path.basename(normalizedPublicPath);

  if (!fileName || fileName === "." || fileName === "..") {
    return null;
  }

  const baseDir =
    assetType === "design"
      ? LOCAL_DESIGN_FILES_ROOT
      : LOCAL_DESIGN_THUMBNAILS_ROOT;

  return path.resolve(baseDir, fileName);
}

function buildLocalDesignThumbnailPublicPath(fileName) {
  return `/storage/local-designs/thumbnails/${path.basename(fileName)}`;
}

async function removeManagedLocalDesignFile(publicPath, assetType) {
  const absolutePath = getManagedLocalDesignAbsolutePath(publicPath, assetType);

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
  LOCAL_DESIGN_STORAGE_ROOT,
  LOCAL_DESIGN_FILES_ROOT,
  LOCAL_DESIGN_THUMBNAILS_ROOT,
  buildLocalDesignThumbnailPublicPath,
  getManagedLocalDesignAbsolutePath,
  removeManagedLocalDesignFile,
};
