import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptPool, executeSqlFile, seedDatabase } from "./db-seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.resolve(backendRoot, ".env") });

const generatedDirectories = [
  path.resolve(projectRoot, "temp/quote-uploads"),
  path.resolve(projectRoot, "storage/local-designs/files"),
  path.resolve(projectRoot, "storage/local-designs/thumbnails"),
  path.resolve(backendRoot, "temp/gcode"),
  path.resolve(backendRoot, "temp/quote-uploads"),
  path.resolve(backendRoot, "storage/local-designs/files"),
  path.resolve(backendRoot, "storage/local-designs/thumbnails"),
  path.resolve(backendRoot, "storage/mmf-print-ready/files"),
  path.resolve(backendRoot, "storage/mmf-print-ready/thumbnails"),
  path.resolve(backendRoot, "storage/quotes/models"),
  path.resolve(backendRoot, "storage/quotes/thumbnails"),
  path.resolve(backendRoot, "storage/print-requests/models"),
  path.resolve(backendRoot, "storage/print-requests/payment-slips"),
  path.resolve(backendRoot, "storage/print-requests/receipts"),
  path.resolve(backendRoot, "storage/print-requests/thumbnails"),
  path.resolve(backendRoot, "storage/slicer-profiles/incoming"),
];

function requireResetApproval() {
  if (process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Refusing reset: set ALLOW_DB_RESET=true to continue.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_DB_RESET !== "true"
  ) {
    throw new Error(
      "Refusing production reset: set ALLOW_PRODUCTION_DB_RESET=true to continue.",
    );
  }

  if (!process.env.DB_NAME || !String(process.env.DB_NAME).trim()) {
    throw new Error("DB_NAME is required.");
  }
}

function assertSafeCleanupPath(targetPath) {
  const resolved = path.resolve(targetPath);
  const allowedRoots = [backendRoot, projectRoot].map((item) =>
    item.toLowerCase(),
  );
  const lowerResolved = resolved.toLowerCase();

  if (
    !allowedRoots.some(
      (root) => lowerResolved === root || lowerResolved.startsWith(`${root}\\`),
    )
  ) {
    throw new Error(`Unsafe cleanup path outside workspace: ${resolved}`);
  }

  return resolved;
}

async function resetDatabase() {
  const databaseName = String(process.env.DB_NAME).trim();
  const serverPool = createScriptPool({ includeDatabase: false });

  try {
    await serverPool.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await serverPool.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
  } finally {
    await serverPool.end();
  }

  const databasePool = createScriptPool();

  try {
    await executeSqlFile(databasePool, path.resolve(backendRoot, "db/schema.sql"));
    await seedDatabase(databasePool);
  } finally {
    await databasePool.end();
  }
}

async function clearGeneratedFiles() {
  for (const targetPath of generatedDirectories) {
    const safePath = assertSafeCleanupPath(targetPath);
    await fs.mkdir(safePath, { recursive: true });
    const entries = await fs.readdir(safePath, { withFileTypes: true });

    for (const entry of entries) {
      await fs.rm(path.join(safePath, entry.name), {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    }
  }
}

async function main() {
  requireResetApproval();
  await resetDatabase();
  await clearGeneratedFiles();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        database: process.env.DB_NAME,
        clearedDirectories: generatedDirectories.length,
        preserved: ["backend/storage/slicer-profiles/library"],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
