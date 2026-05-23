import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const migrationsDir = path.resolve(backendRoot, "db/migrations");

dotenv.config({ path: path.resolve(backendRoot, ".env") });

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
}

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => {
      const absolutePath = path.join(migrationsDir, fileName);
      const sql = fs.readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
      return { fileName, sql, checksum: checksum(sql) };
    });
}

async function ensureSchemaMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id bigint unsigned NOT NULL AUTO_INCREMENT,
      migration_name varchar(255) NOT NULL,
      checksum_sha256 char(64) NOT NULL,
      execution_type enum('applied','baseline') NOT NULL DEFAULT 'applied',
      applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function countApplicationTables(pool) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
        AND table_name <> 'schema_migrations'
    `,
    [process.env.DB_NAME],
  );
  return Number(rows[0]?.count || 0);
}

async function getAppliedMigrations(pool) {
  const [rows] = await pool.query(
    `
      SELECT migration_name, checksum_sha256, execution_type, applied_at
      FROM schema_migrations
      ORDER BY migration_name ASC
    `,
  );
  return new Map(rows.map((row) => [row.migration_name, row]));
}

async function recordMigration(pool, migration, executionType) {
  await pool.query(
    `
      INSERT INTO schema_migrations (
        migration_name,
        checksum_sha256,
        execution_type
      )
      VALUES (?, ?, ?)
    `,
    [migration.fileName, migration.checksum, executionType],
  );
}

async function applyCanonicalSchema(pool) {
  const schemaSql = fs
    .readFileSync(path.resolve(backendRoot, "db/schema.sql"), "utf8")
    .replace(/^\uFEFF/, "");
  await pool.query(schemaSql);
}

async function baselineAll(pool, migrations) {
  for (const migration of migrations) {
    await recordMigration(pool, migration, "baseline");
  }
}

async function assertChecksums(applied, migrations) {
  const knownMigrations = new Map(
    migrations.map((migration) => [migration.fileName, migration]),
  );

  for (const [name, row] of applied.entries()) {
    const current = knownMigrations.get(name);

    if (!current) {
      throw new Error(`Applied migration is missing from disk: ${name}`);
    }

    if (current.checksum !== row.checksum_sha256) {
      throw new Error(
        `Migration checksum changed after apply: ${name}. Refusing to continue.`,
      );
    }
  }
}

async function migrate({ statusOnly = false } = {}) {
  const pool = createPool();
  const migrations = readMigrations();

  try {
    await ensureSchemaMigrations(pool);

    let applied = await getAppliedMigrations(pool);
    await assertChecksums(applied, migrations);

    const applicationTableCount = await countApplicationTables(pool);

    if (applicationTableCount === 0 && applied.size === 0 && !statusOnly) {
      await applyCanonicalSchema(pool);
      await ensureSchemaMigrations(pool);
      await baselineAll(pool, migrations);
      applied = await getAppliedMigrations(pool);
    } else if (applicationTableCount > 0 && applied.size === 0 && !statusOnly) {
      await baselineAll(pool, migrations);
      applied = await getAppliedMigrations(pool);
    }

    const pending = migrations.filter(
      (migration) => !applied.has(migration.fileName),
    );

    if (statusOnly) {
      console.log(
        JSON.stringify(
          {
            status: pending.length === 0 ? "ok" : "pending",
            database: process.env.DB_NAME,
            applied: applied.size,
            pending: pending.map((migration) => migration.fileName),
          },
          null,
          2,
        ),
      );
      process.exitCode = pending.length === 0 ? 0 : 1;
      return;
    }

    for (const migration of pending) {
      await pool.query(migration.sql);
      await recordMigration(pool, migration, "applied");
    }

    console.log(
      JSON.stringify(
        {
          status: "ok",
          database: process.env.DB_NAME,
          baselineCount: applied.size,
          appliedCount: pending.length,
          appliedMigrations: pending.map((migration) => migration.fileName),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

const args = new Set(process.argv.slice(2));

migrate({ statusOnly: args.has("--status") }).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
