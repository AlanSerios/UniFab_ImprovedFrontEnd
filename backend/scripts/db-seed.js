import bcrypt from "bcrypt";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(backendRoot, ".env") });

const USER_TYPES = new Set(["student", "faculty", "researcher", "others"]);

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }

  return String(value).trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function normalizeUserType(name, fallback) {
  const normalized = optionalEnv(name, fallback);

  if (!USER_TYPES.has(normalized)) {
    throw new Error(`${name} must be one of: ${[...USER_TYPES].join(", ")}`);
  }

  return normalized;
}

export function createScriptPool({ includeDatabase = true } = {}) {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: includeDatabase ? process.env.DB_NAME : undefined,
    multipleStatements: true,
  });
}

export async function executeSqlFile(pool, filePath) {
  const sql = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  await pool.query(sql);
}

async function upsertSeedUser(
  pool,
  { firstName, lastName, email, password, userType, isAdmin },
) {
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.query(
    `
      INSERT INTO users (
        first_name,
        last_name,
        email,
        password,
        user_type,
        is_admin,
        is_email_verified
      )
      VALUES (?, ?, ?, ?, ?, ?, TRUE)
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        password = VALUES(password),
        user_type = VALUES(user_type),
        is_admin = VALUES(is_admin),
        is_email_verified = TRUE
    `,
    [
      firstName,
      lastName,
      email.trim().toLowerCase(),
      hashedPassword,
      userType,
      isAdmin,
    ],
  );
}

export async function seedUsers(pool) {
  await upsertSeedUser(pool, {
    firstName: optionalEnv("ADMIN_FIRST_NAME", "UniFab"),
    lastName: optionalEnv("ADMIN_LAST_NAME", "Admin"),
    email: requireEnv("ADMIN_EMAIL"),
    password: requireEnv("ADMIN_PASSWORD"),
    userType: normalizeUserType("ADMIN_USER_TYPE", "faculty"),
    isAdmin: true,
  });

  await upsertSeedUser(pool, {
    firstName: optionalEnv("TEST_USER_FIRST_NAME", "Test"),
    lastName: optionalEnv("TEST_USER_LAST_NAME", "User"),
    email: optionalEnv("TEST_USER_EMAIL", "test.user@unifab.local"),
    password: optionalEnv("TEST_USER_PASSWORD", "TestUser123!"),
    userType: normalizeUserType("TEST_USER_TYPE", "student"),
    isAdmin: false,
  });
}

export async function seedDatabase(pool) {
  await executeSqlFile(pool, path.resolve(backendRoot, "db/seed.sql"));
  await seedUsers(pool);
}

async function main() {
  const pool = createScriptPool();

  try {
    await seedDatabase(pool);

    const [rows] = await pool.query(
      "SELECT id, email, is_admin, is_email_verified FROM users ORDER BY is_admin DESC, id ASC",
    );

    console.log("Seed complete:");
    console.table(rows);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
