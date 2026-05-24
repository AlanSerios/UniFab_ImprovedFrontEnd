import crypto from "crypto";

function mapUserRowToSafeUser(user, { coerceAdmin = false } = {}) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    userType: user.user_type,
    isAdmin: coerceAdmin ? Boolean(user.is_admin) : user.is_admin,
    isEmailVerified: user.is_email_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };
}

function hashTemporaryToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientAppUrl() {
  return (
    process.env.CLIENT_APP_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  );
}

function buildFrontendUrl(path) {
  const baseUrl = getClientAppUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}

function buildForgotPasswordResetUrl(unHashedToken) {
  return `${process.env.FORGOT_PASSWORD_REDIRECT_URL}/${unHashedToken}`;
}

export {
  buildForgotPasswordResetUrl,
  buildFrontendUrl,
  getAuthCookieOptions,
  hashTemporaryToken,
  mapUserRowToSafeUser,
};
