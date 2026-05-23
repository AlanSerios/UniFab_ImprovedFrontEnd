import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pool from "../src/db/db.js";
import { STORAGE_ROOT } from "../src/utils/storage-root.util.js";
import { registerManagedPublicPath } from "../src/services/file-storage.service.js";

dotenv.config();

const backfill = process.argv.includes("--backfill");

function normalizeStoragePath(filePath) {
  return path.relative(STORAGE_ROOT, filePath).replace(/\\/g, "/");
}

function publicPathForStorageKey(storageKey) {
  const basename = path.basename(storageKey);

  if (storageKey.startsWith("local-designs/files/")) {
    return `/storage/local-designs/files/${basename}`;
  }

  if (storageKey.startsWith("local-designs/thumbnails/")) {
    return `/storage/local-designs/thumbnails/${basename}`;
  }

  if (storageKey.startsWith("mmf-print-ready/files/")) {
    return `/storage/mmf-print-ready/files/${basename}`;
  }

  if (storageKey.startsWith("mmf-print-ready/thumbnails/")) {
    return `/storage/mmf-print-ready/thumbnails/${basename}`;
  }

  if (storageKey.startsWith("quotes/models/")) {
    return `/storage/quotes/models/${basename}`;
  }

  if (storageKey.startsWith("quotes/thumbnails/")) {
    return `/storage/quotes/thumbnails/${basename}`;
  }

  if (storageKey.startsWith("print-requests/models/")) {
    return `/storage/print-requests/models/${basename}`;
  }

  if (storageKey.startsWith("print-requests/thumbnails/")) {
    return `/storage/print-requests/thumbnails/${basename}`;
  }

  if (storageKey.startsWith("print-requests/payment-slips/")) {
    return `/storage/print-requests/payment-slips/${basename}`;
  }

  if (storageKey.startsWith("slicer-profiles/library/")) {
    return `/storage/slicer-profiles/library/${basename}`;
  }

  return null;
}

async function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function collectReferences() {
  const [rows] = await pool.query(
    `
      SELECT
        fo.id,
        fo.public_path,
        fo.id AS file_object_id,
        fo.created_by AS owner_user_id,
        fo.visibility,
        fr.reference_type AS referenceType,
        fr.reference_column AS referenceColumn,
        fr.file_role AS fileRole
      FROM file_objects fo
      LEFT JOIN file_references fr ON fr.file_object_id = fo.id
      WHERE fo.public_path IS NOT NULL
    `,
  );

  return rows;
}

async function backfillReference(reference) {
  if (reference.file_object_id || !reference.public_path) {
    return null;
  }

  const fileObject = await registerManagedPublicPath({
    publicPath: reference.public_path,
    visibility: reference.visibility,
    createdBy: reference.owner_user_id || null,
    dedupe: false,
  });

  if (!fileObject) return null;

  return fileObject;
}

async function main() {
  const physicalFiles = await listFiles(STORAGE_ROOT);
  const physicalPublicPaths = new Map(
    physicalFiles.map((filePath) => [
      publicPathForStorageKey(normalizeStoragePath(filePath)),
      filePath,
    ]),
  );
  const references = await collectReferences();
  const referencedPaths = new Set(references.map((item) => item.public_path));
  const missingReferences = references.filter(
    (item) => item.public_path && !physicalPublicPaths.has(item.public_path),
  );
  const unreferencedFiles = [...physicalPublicPaths.entries()]
    .filter(([publicPath]) => publicPath && !referencedPaths.has(publicPath))
    .map(([publicPath, filePath]) => ({ publicPath, filePath }));
  let backfilled = 0;

  if (backfill) {
    for (const reference of references) {
      const fileObject = await backfillReference(reference);
      if (fileObject) backfilled += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        storageRoot: STORAGE_ROOT,
        mode: backfill ? "backfill" : "dry-run",
        physicalFileCount: physicalFiles.length,
        referencedPathCount: referencedPaths.size,
        missingReferenceCount: missingReferences.length,
        unreferencedFileCount: unreferencedFiles.length,
        backfilled,
        missingReferences: missingReferences.slice(0, 100),
        unreferencedFiles: unreferencedFiles.slice(0, 100),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
