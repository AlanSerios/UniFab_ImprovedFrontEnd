import bcrypt from "bcrypt";
import dotenv from "dotenv";
import pool from "../src/db/db.js";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }

  return String(value).trim();
}

async function main() {
  const email = requireEnv("ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("ADMIN_PASSWORD");
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "UniFab";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Admin";
  const userType = process.env.ADMIN_USER_TYPE?.trim() || "faculty";
  const allowedUserTypes = new Set([
    "student",
    "faculty",
    "researcher",
    "others",
  ]);

  if (!allowedUserTypes.has(userType)) {
    throw new Error(
      "ADMIN_USER_TYPE must be one of: student, faculty, researcher, others",
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = `
    INSERT INTO users (
      first_name,
      last_name,
      email,
      password,
      user_type,
      is_admin,
      is_email_verified
    )
    VALUES (?, ?, ?, ?, ?, TRUE, TRUE)
    ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      password = VALUES(password),
      user_type = VALUES(user_type),
      is_admin = TRUE,
      is_email_verified = TRUE
  `;

  await pool.query(sql, [firstName, lastName, email, hashedPassword, userType]);

  const [rows] = await pool.query(
    "SELECT id, email, is_admin, is_email_verified FROM users WHERE email = ? LIMIT 1",
    [email],
  );

  console.log("Admin user ready:");
  console.table(rows);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
