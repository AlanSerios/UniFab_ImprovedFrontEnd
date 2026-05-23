import pool from "../db/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const TOKEN_TYPES = {
  REFRESH: "refresh",
  EMAIL_VERIFICATION: "email_verification",
  FORGOT_PASSWORD: "forgot_password",
};

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function createUser(firstName, lastName, email, password, userType) {
  const sql = `
    INSERT INTO users (
      first_name,
      last_name,
      email,
      password,
      user_type,
      is_email_verified
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const hashedPassword = await bcrypt.hash(password, 10);

  const [result] = await pool.query(sql, [
    firstName,
    lastName,
    email.trim().toLowerCase(),
    hashedPassword,
    userType,
    false,
  ]);

  return result;
}

async function findUserByEmail(email) {
  const sql = "SELECT * FROM users WHERE email = ? LIMIT 1";
  const [rows] = await pool.query(sql, [email.trim().toLowerCase()]);
  return rows[0] || null;
}

async function findUserByEmailVerificationToken(token) {
  const sql = `
    SELECT u.*
    FROM user_tokens ut
    INNER JOIN users u ON u.id = ut.user_id
    WHERE ut.token_type = ?
      AND ut.token_hash = ?
      AND ut.expires_at > NOW()
      AND ut.consumed_at IS NULL
      AND ut.revoked_at IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [TOKEN_TYPES.EMAIL_VERIFICATION, token]);
  return rows[0] || null;
}

async function findUserByForgotPasswordToken(token) {
  const sql = `
    SELECT u.*
    FROM user_tokens ut
    INNER JOIN users u ON u.id = ut.user_id
    WHERE ut.token_type = ?
      AND ut.token_hash = ?
      AND ut.expires_at > NOW()
      AND ut.consumed_at IS NULL
      AND ut.revoked_at IS NULL
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [TOKEN_TYPES.FORGOT_PASSWORD, token]);
  return rows[0] || null;
}

async function findUserById(id) {
  const sql = "SELECT * FROM users WHERE id = ? LIMIT 1";
  const [rows] = await pool.query(sql, [id]);
  return rows[0] || null;
}

async function isPasswordCorrect(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      userType: user.user_type,
      isAdmin: Boolean(user.is_admin),
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRATION },
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION },
  );
}

function generateTemporaryToken() {
  const unHashedToken = crypto.randomBytes(20).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(unHashedToken)
    .digest("hex");

  const tokenExpiry = Date.now() + 20 * 60 * 1000;

  return {
    unHashedToken,
    hashedToken,
    tokenExpiry,
  };
}

async function saveRefreshToken(userId, refreshToken) {
  await revokeUserTokens(userId, TOKEN_TYPES.REFRESH);
  const decodedToken = jwt.decode(refreshToken);
  const expiresAt =
    decodedToken?.exp && Number.isFinite(Number(decodedToken.exp))
      ? new Date(Number(decodedToken.exp) * 1000)
      : null;
  const [result] = await pool.query(
    `
      INSERT INTO user_tokens (user_id, token_type, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    [userId, TOKEN_TYPES.REFRESH, hashToken(refreshToken), expiresAt],
  );
  return result;
}

async function isRefreshTokenActive(userId, refreshToken) {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM user_tokens
      WHERE user_id = ?
        AND token_type = ?
        AND token_hash = ?
        AND (expires_at IS NULL OR expires_at > NOW())
        AND consumed_at IS NULL
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [userId, TOKEN_TYPES.REFRESH, hashToken(refreshToken)],
  );

  return Boolean(rows[0]);
}

async function revokeUserTokens(userId, tokenType = null) {
  const params = [userId];
  let typeCondition = "";

  if (tokenType) {
    typeCondition = "AND token_type = ?";
    params.push(tokenType);
  }

  const [result] = await pool.query(
    `
      UPDATE user_tokens
      SET revoked_at = NOW()
      WHERE user_id = ?
        ${typeCondition}
        AND revoked_at IS NULL
        AND consumed_at IS NULL
    `,
    params,
  );

  return result;
}

async function saveForgotPasswordToken(
  userId,
  forgotPasswordToken,
  forgotPasswordExpiry,
) {
  await revokeUserTokens(userId, TOKEN_TYPES.FORGOT_PASSWORD);
  const [result] = await pool.query(
    `
      INSERT INTO user_tokens (user_id, token_type, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    [userId, TOKEN_TYPES.FORGOT_PASSWORD, forgotPasswordToken, forgotPasswordExpiry],
  );
  return result;
}

async function saveEmailVerificationToken(
  userId,
  emailVerificationToken,
  emailVerificationExpiry,
) {
  await revokeUserTokens(userId, TOKEN_TYPES.EMAIL_VERIFICATION);
  const [result] = await pool.query(
    `
      INSERT INTO user_tokens (user_id, token_type, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    [
      userId,
      TOKEN_TYPES.EMAIL_VERIFICATION,
      emailVerificationToken,
      emailVerificationExpiry,
    ],
  );
  return result;
}

async function markEmailAsVerified(userId) {
  const sql = `
    UPDATE users
    SET is_email_verified = true
    WHERE id = ?
  `;
  const [result] = await pool.query(sql, [userId]);
  await pool.query(
    `
      UPDATE user_tokens
      SET consumed_at = NOW()
      WHERE user_id = ?
        AND token_type = ?
        AND consumed_at IS NULL
        AND revoked_at IS NULL
    `,
    [userId, TOKEN_TYPES.EMAIL_VERIFICATION],
  );
  return result;
}

async function updatePassword(userId, newPassword) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const sql = `
    UPDATE users
    SET password = ?
    WHERE id = ?
  `;

  const [result] = await pool.query(sql, [hashedPassword, userId]);
  await revokeUserTokens(userId, TOKEN_TYPES.REFRESH);
  await revokeUserTokens(userId, TOKEN_TYPES.FORGOT_PASSWORD);
  return result;
}

async function clearRefreshToken(userId) {
  return revokeUserTokens(userId, TOKEN_TYPES.REFRESH);
}

export {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByEmailVerificationToken,
  findUserByForgotPasswordToken,
  isPasswordCorrect,
  generateAccessToken,
  generateRefreshToken,
  generateTemporaryToken,
  isRefreshTokenActive,
  saveRefreshToken,
  saveForgotPasswordToken,
  saveEmailVerificationToken,
  markEmailAsVerified,
  updatePassword,
  clearRefreshToken,
};
