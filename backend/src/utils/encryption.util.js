import crypto from "crypto";
import { ApiError } from "./api-error.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getEncryptionKey() {
  const configuredKey = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;

  if (!configuredKey) {
    throw new ApiError(
      500,
      "Integration token encryption key is not configured",
    );
  }

  if (/^[a-f0-9]{64}$/i.test(configuredKey)) {
    return Buffer.from(configuredKey, "hex");
  }

  const decodedKey = Buffer.from(configuredKey, "base64");

  if (decodedKey.length === 32) {
    return decodedKey;
  }

  throw new ApiError(
    500,
    "Integration token encryption key must be 32 bytes as base64 or 64 hex characters",
  );
}

function encryptText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptText(value) {
  if (!value) {
    return null;
  }

  const [version, ivValue, authTagValue, encryptedValue] =
    String(value).split(":");

  if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
    throw new ApiError(500, "Encrypted integration token is invalid");
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagValue, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export { decryptText, encryptText };
