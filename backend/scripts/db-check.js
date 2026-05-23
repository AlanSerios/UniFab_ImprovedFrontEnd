import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptPool } from "./db-seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(backendRoot, ".env") });

function readCanonicalTables() {
  const schema = fs.readFileSync(
    path.resolve(backendRoot, "db/schema.sql"),
    "utf8",
  );
  return [...schema.matchAll(/CREATE TABLE `([^`]+)`/g)].map(
    (match) => match[1],
  );
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim()
    ? String(value).trim().toLowerCase()
    : fallback;
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

async function countRows(pool, sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return Number(rows[0]?.count || 0);
}

async function checkTableDrift(pool, failures) {
  const expectedTables = readCanonicalTables();
  const [rows] = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
    [process.env.DB_NAME],
  );
  const liveTables = rows.map((row) => row.TABLE_NAME || row.table_name);
  const expected = new Set(expectedTables);
  const live = new Set(liveTables);
  const missing = expectedTables.filter((tableName) => !live.has(tableName));
  const extra = liveTables.filter((tableName) => !expected.has(tableName));

  if (missing.length > 0) {
    failures.push({ check: "schema_missing_tables", tables: missing });
  }

  if (extra.length > 0) {
    failures.push({ check: "schema_extra_tables", tables: extra });
  }

  return { expectedTables: expectedTables.length, liveTables: liveTables.length };
}

async function checkRequiredSeeds(pool, failures) {
  const adminEmail = optionalEnv("ADMIN_EMAIL", "");
  const testEmail = optionalEnv("TEST_USER_EMAIL", "test.user@unifab.local");

  const checks = [
    {
      name: "admin_user",
      sql: "SELECT COUNT(*) AS count FROM users WHERE LOWER(email) = ? AND is_admin = TRUE AND is_email_verified = TRUE",
      params: [adminEmail],
      minimum: adminEmail ? 1 : 0,
    },
    {
      name: "test_user",
      sql: "SELECT COUNT(*) AS count FROM users WHERE LOWER(email) = ? AND is_admin = FALSE AND is_email_verified = TRUE",
      params: [testEmail],
      minimum: 1,
    },
    {
      name: "categories",
      sql: "SELECT COUNT(*) AS count FROM design_categories",
      minimum: 5,
    },
    {
      name: "tags",
      sql: "SELECT COUNT(*) AS count FROM design_tags",
      minimum: 10,
    },
    {
      name: "materials",
      sql: "SELECT COUNT(*) AS count FROM materials",
      minimum: 3,
    },
    {
      name: "material_colors",
      sql: "SELECT COUNT(*) AS count FROM material_colors",
      minimum: 8,
    },
    {
      name: "pricing_config",
      sql: "SELECT COUNT(*) AS count FROM pricing_config",
      minimum: 1,
    },
    {
      name: "printers",
      sql: "SELECT COUNT(*) AS count FROM printers",
      minimum: 1,
    },
    {
      name: "printer_materials",
      sql: "SELECT COUNT(*) AS count FROM printer_materials",
      minimum: 2,
    },
    {
      name: "slicer_profiles",
      sql: "SELECT COUNT(*) AS count FROM slicer_profiles WHERE file_object_id IS NOT NULL",
      minimum: 10,
    },
  ];

  const results = [];

  for (const check of checks) {
    const count = await countRows(pool, check.sql, check.params || []);
    results.push({ name: check.name, count, minimum: check.minimum });

    if (count < check.minimum) {
      failures.push({ check: "required_seed", name: check.name, count });
    }
  }

  return results;
}

async function checkForeignKeys(pool, failures) {
  const [rows] = await pool.query(
    `
      SELECT
        constraint_name,
        table_name,
        referenced_table_name,
        column_name,
        referenced_column_name,
        ordinal_position
      FROM information_schema.key_column_usage
      WHERE table_schema = ?
        AND referenced_table_schema = ?
        AND referenced_table_name IS NOT NULL
      ORDER BY table_name, constraint_name, ordinal_position
    `,
    [process.env.DB_NAME, process.env.DB_NAME],
  );
  const groups = new Map();

  for (const row of rows) {
    const key = `${row.TABLE_NAME || row.table_name}:${
      row.CONSTRAINT_NAME || row.constraint_name
    }`;
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }

  const violations = [];

  for (const columns of groups.values()) {
    const first = columns[0];
    const tableName = first.TABLE_NAME || first.table_name;
    const referencedTableName =
      first.REFERENCED_TABLE_NAME || first.referenced_table_name;
    const constraintName = first.CONSTRAINT_NAME || first.constraint_name;
    const joinConditions = columns
      .map((column) => {
        const columnName = column.COLUMN_NAME || column.column_name;
        const referencedColumnName =
          column.REFERENCED_COLUMN_NAME || column.referenced_column_name;
        return `child.${quoteIdentifier(columnName)} = parent.${quoteIdentifier(
          referencedColumnName,
        )}`;
      })
      .join(" AND ");
    const notNullConditions = columns
      .map((column) => {
        const columnName = column.COLUMN_NAME || column.column_name;
        return `child.${quoteIdentifier(columnName)} IS NOT NULL`;
      })
      .join(" AND ");
    const [countRowsResult] = await pool.query(
      `
        SELECT COUNT(*) AS count
        FROM ${quoteIdentifier(tableName)} child
        LEFT JOIN ${quoteIdentifier(referencedTableName)} parent
          ON ${joinConditions}
        WHERE ${notNullConditions}
          AND parent.${quoteIdentifier(
            columns[0].REFERENCED_COLUMN_NAME ||
              columns[0].referenced_column_name,
          )} IS NULL
      `,
    );
    const count = Number(countRowsResult[0]?.count || 0);

    if (count > 0) {
      violations.push({ tableName, constraintName, count });
    }
  }

  if (violations.length > 0) {
    failures.push({ check: "foreign_keys", violations });
  }

  return { checkedConstraints: groups.size, violations: violations.length };
}

async function checkSlicerProfileFiles(pool, failures) {
  const [rows] = await pool.query(
    `
      SELECT sp.id, sp.profile_filename, fo.storage_key
      FROM slicer_profiles sp
      INNER JOIN file_objects fo ON fo.id = sp.file_object_id
      ORDER BY sp.id
    `,
  );
  const missing = rows.filter((row) => {
    const storageKey = row.storage_key || row.STORAGE_KEY;
    return !fs.existsSync(path.resolve(backendRoot, "storage", storageKey));
  });

  if (missing.length > 0) {
    failures.push({
      check: "slicer_profile_files",
      missing: missing.map((row) => ({
        id: row.id,
        profileFilename: row.profile_filename,
        storageKey: row.storage_key,
      })),
    });
  }

  return { checkedFiles: rows.length, missingFiles: missing.length };
}

async function checkExpiredQuoteUploadFiles(pool, failures) {
  const [rows] = await pool.query(
    `
      SELECT SUM(count) AS count
      FROM (
        SELECT COUNT(*) AS count
        FROM quote_assets qa
        INNER JOIN file_references fr
          ON fr.reference_type = 'quote_asset'
          AND fr.reference_id = qa.id
          AND fr.status = 'active'
        INNER JOIN file_objects fo ON fo.id = fr.file_object_id
        WHERE qa.status = 'active'
          AND qa.expires_at <= NOW()
          AND fo.storage_status = 'present'
          AND fo.storage_key LIKE 'quotes/%'
          AND NOT EXISTS (
            SELECT 1
            FROM quote_records qr
            INNER JOIN cart_items ci ON ci.quote_record_id = qr.id
            WHERE qr.quote_asset_id = qa.id
              AND ci.status = 'active'
              AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          )
        UNION ALL
        SELECT COUNT(*) AS count
      FROM quote_records qr
      INNER JOIN file_references fr
        ON fr.reference_type = 'quote_record'
        AND fr.reference_id = qr.id
        AND fr.status = 'active'
      INNER JOIN file_objects fo ON fo.id = fr.file_object_id
      WHERE qr.used_at IS NULL
        AND qr.quote_asset_id IS NULL
        AND qr.expires_at <= NOW()
        AND fo.storage_status = 'present'
        AND fo.storage_key LIKE 'quotes/%'
        AND NOT EXISTS (
          SELECT 1
          FROM cart_items ci
          WHERE ci.quote_record_id = qr.id
            AND ci.status = 'active'
            AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        )
      ) expired_files
    `,
  );
  const count = Number(rows[0]?.count || 0);

  if (count > 0) {
    failures.push({
      check: "expired_quote_upload_files",
      count,
    });
  }

  return { expiredPresentFiles: count };
}

async function checkDesignLibraryFiles(pool, failures) {
  const [activeDeletedRows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM file_references fr
      LEFT JOIN local_design_files ldf
        ON fr.reference_type = 'local_design_file'
        AND ldf.id = fr.reference_id
      LEFT JOIN local_design_images ldi
        ON fr.reference_type = 'local_design_image'
        AND ldi.id = fr.reference_id
      LEFT JOIN local_designs ld
        ON ld.id = COALESCE(ldf.local_design_id, ldi.local_design_id)
      WHERE fr.status = 'active'
        AND fr.reference_type IN ('local_design_file', 'local_design_image')
        AND (
          ld.deleted_at IS NOT NULL
          OR COALESCE(ldf.status, 'active') IN ('removed', 'replaced')
          OR COALESCE(ldi.status, 'active') IN ('removed', 'replaced')
        )
    `,
  );
  const [activeArchivedMmfRows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM file_references fr
      INNER JOIN mmf_print_ready_files mprf
        ON mprf.id = fr.reference_id
      WHERE fr.reference_type = 'mmf_print_ready_file'
        AND fr.status = 'active'
        AND mprf.status IN ('archived', 'removed', 'failed')
    `,
  );
  const [orphanSnapshotRows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM file_objects fo
      LEFT JOIN file_references fr
        ON fr.file_object_id = fo.id
      WHERE fo.storage_key LIKE 'local-designs/thumbnails/%'
        AND fo.original_file_name LIKE '%-snapshot.png'
        AND fr.id IS NULL
        AND fo.storage_status = 'present'
    `,
  );
  const [missingRows] = await pool.query(
    `
      SELECT fo.id, fo.storage_key
      FROM file_objects fo
      INNER JOIN file_references fr
        ON fr.file_object_id = fo.id
      WHERE fr.reference_type IN (
          'local_design_file',
          'local_design_image',
          'mmf_print_ready_file'
        )
        AND fo.storage_status = 'present'
    `,
  );
  const missingFiles = missingRows.filter((row) => {
    const storageKey = row.storage_key || row.STORAGE_KEY;
    return !fs.existsSync(path.resolve(backendRoot, "storage", storageKey));
  });
  const activeDeletedReferences = Number(activeDeletedRows[0]?.count || 0);
  const activeArchivedMmfReferences = Number(
    activeArchivedMmfRows[0]?.count || 0,
  );
  const orphanGeneratedSnapshots = Number(orphanSnapshotRows[0]?.count || 0);

  if (activeDeletedReferences > 0) {
    failures.push({
      check: "design_active_deleted_asset_references",
      count: activeDeletedReferences,
    });
  }

  if (activeArchivedMmfReferences > 0) {
    failures.push({
      check: "design_active_archived_mmf_references",
      count: activeArchivedMmfReferences,
    });
  }

  if (missingFiles.length > 0) {
    failures.push({
      check: "design_missing_files",
      count: missingFiles.length,
      sample: missingFiles.slice(0, 10).map((row) => ({
        id: row.id,
        storageKey: row.storage_key,
      })),
    });
  }

  if (orphanGeneratedSnapshots > 0) {
    failures.push({
      check: "design_orphan_generated_snapshots",
      count: orphanGeneratedSnapshots,
    });
  }

  return {
    activeDeletedReferences,
    activeArchivedMmfReferences,
    checkedFiles: missingRows.length,
    missingFiles: missingFiles.length,
    orphanGeneratedSnapshots,
  };
}

async function checkHighTrafficIndexes(pool, failures) {
  const expectedIndexes = [
    {
      tableName: "print_requests",
      indexName: "idx_print_requests_client_archive_status_created",
    },
    {
      tableName: "print_requests",
      indexName: "idx_print_requests_archive_status_source_created",
    },
    {
      tableName: "file_objects",
      indexName: "idx_file_objects_status_created",
    },
    {
      tableName: "file_references",
      indexName: "idx_file_references_reference",
    },
    {
      tableName: "file_references",
      indexName: "idx_file_references_file_status",
    },
    {
      tableName: "quote_records",
      indexName: "idx_quote_records_owner_used_expires_created",
    },
    {
      tableName: "quote_assets",
      indexName: "idx_quote_assets_owner_status_expires_id",
    },
    {
      tableName: "local_designs",
      indexName: "idx_local_designs_public_high_traffic",
    },
    {
      tableName: "local_designs",
      indexName: "idx_local_designs_admin_queue",
    },
    {
      tableName: "users",
      indexName: "idx_users_admin_verified_created",
    },
  ];
  const expectedTables = [
    ...new Set(expectedIndexes.map((item) => item.tableName)),
  ];
  const [rows] = await pool.query(
    `
      SELECT table_name, index_name
      FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name IN (${expectedTables.map(() => "?").join(", ")})
      GROUP BY table_name, index_name
    `,
    [process.env.DB_NAME, ...expectedTables],
  );
  const live = new Set(
    rows.map((row) => {
      const tableName = row.table_name || row.TABLE_NAME;
      const indexName = row.index_name || row.INDEX_NAME;
      return `${tableName}:${indexName}`;
    }),
  );
  const missing = expectedIndexes.filter(
    (item) => !live.has(`${item.tableName}:${item.indexName}`),
  );

  if (missing.length > 0) {
    failures.push({ check: "high_traffic_indexes", missing });
  }

  return {
    checkedIndexes: expectedIndexes.length,
    missingIndexes: missing.length,
  };
}

async function main() {
  const failures = [];
  const pool = createScriptPool();

  try {
    const tableDrift = await checkTableDrift(pool, failures);
    const requiredSeeds = await checkRequiredSeeds(pool, failures);
    const foreignKeys = await checkForeignKeys(pool, failures);
    const slicerProfiles = await checkSlicerProfileFiles(pool, failures);
    const quoteUploads = await checkExpiredQuoteUploadFiles(pool, failures);
    const designLibraryFiles = await checkDesignLibraryFiles(pool, failures);
    const highTrafficIndexes = await checkHighTrafficIndexes(pool, failures);
    const summary = {
      status: failures.length === 0 ? "ok" : "failed",
      database: process.env.DB_NAME,
      tableDrift,
      requiredSeeds,
      foreignKeys,
      slicerProfiles,
      quoteUploads,
      designLibraryFiles,
      highTrafficIndexes,
      failures,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
