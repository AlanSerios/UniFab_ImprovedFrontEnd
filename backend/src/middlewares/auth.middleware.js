import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { findUserById } from "../models/user.model.js";
import { mapUserRowToSafeUser } from "../utils/auth-response.util.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Unauthorized: No token provided");
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await findUserById(decodedToken.id);

    if (!user) {
      throw new ApiError(401, "Invalid access token");
    }

    const safeUser = mapUserRowToSafeUser(user, { coerceAdmin: true });

    req.user = safeUser;
    next();
  } catch (err) {
    throw new ApiError(401, "Invalid access token");
  }
});

export const optionalVerifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    next();
    return;
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await findUserById(decodedToken.id);

    if (user) {
      req.user = mapUserRowToSafeUser(user, { coerceAdmin: true });
    }
  } catch {
    req.user = null;
  }

  next();
});

export const verifyEmailVerified = (req, _res, next) => {
  if (!req.user?.isEmailVerified) {
    throw new ApiError(
      403,
      "Please verify your email before submitting a print request.",
    );
  }

  next();
};
