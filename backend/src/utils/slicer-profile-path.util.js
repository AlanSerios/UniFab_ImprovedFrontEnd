import fs from "fs";
import path from "path";
import { resolveStoragePath } from "./storage-root.util.js";

const SLICER_PROFILE_STORAGE_DIR = resolveStoragePath(
  "slicer-profiles",
  "library",
);

function ensureSlicerProfileStorageDir() {
  fs.mkdirSync(SLICER_PROFILE_STORAGE_DIR, { recursive: true });
  return SLICER_PROFILE_STORAGE_DIR;
}

function getSlicerProfileStorageDir() {
  return SLICER_PROFILE_STORAGE_DIR;
}

function getSlicerProfileFilePath(profileFilename) {
  return path.join(SLICER_PROFILE_STORAGE_DIR, profileFilename);
}

export {
  SLICER_PROFILE_STORAGE_DIR,
  ensureSlicerProfileStorageDir,
  getSlicerProfileStorageDir,
  getSlicerProfileFilePath,
};
