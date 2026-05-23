import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

const STORAGE_ROOT = path.resolve(
  process.env.STORAGE_ROOT || path.join(BACKEND_ROOT, "storage"),
);

const TEMP_ROOT = path.resolve(
  process.env.TEMP_ROOT || path.join(BACKEND_ROOT, "temp"),
);

function resolveStoragePath(...segments) {
  return path.resolve(STORAGE_ROOT, ...segments);
}

function resolveTempPath(...segments) {
  return path.resolve(TEMP_ROOT, ...segments);
}

export { BACKEND_ROOT, STORAGE_ROOT, TEMP_ROOT, resolveStoragePath, resolveTempPath };
