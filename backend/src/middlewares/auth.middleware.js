import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { findUserById } from "../models/user.model.js";

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

    const safeUser = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      userType: user.user_type,
      isAdmin: Boolean(user.is_admin),
      isEmailVerified: user.is_email_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };

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
      req.user = {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        userType: user.user_type,
        isAdmin: Boolean(user.is_admin),
        isEmailVerified: user.is_email_verified,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      };
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
