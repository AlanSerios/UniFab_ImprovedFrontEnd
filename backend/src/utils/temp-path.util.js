import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { resolveTempPath } from "./storage-root.util.js";

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getTempDir(...segments) {
  const dirPath = resolveTempPath(...segments);
  ensureDirExists(dirPath);
  return dirPath;
}

function createTempFilePath(folderSegments, extension) {
  const dirPath = getTempDir(...folderSegments);
  return path.join(dirPath, `${randomUUID()}${extension}`);
}

export { ensureDirExists, getTempDir, createTempFilePath };
