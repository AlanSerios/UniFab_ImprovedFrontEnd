import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByEmailVerificationToken,
  findUserByForgotPasswordToken,
  isPasswordCorrect,
  isRefreshTokenActive,
  generateAccessToken,
  generateRefreshToken,
  generateTemporaryToken,
  saveRefreshToken,
  saveForgotPasswordToken,
  saveEmailVerificationToken,
  markEmailAsVerified,
  updatePassword,
  clearRefreshToken,
} from "../models/user.model.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  sendEmail,
  emailVerificationMailgenContent,
  forgotPasswordMailgenContent,
} from "../utils/mail.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await findUserById(userId);

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(userId, refreshToken);

    return { accessToken, refreshToken };
  } catch (error) {
    console.error("generateAccessAndRefreshTokens error:", error);
    throw new ApiError(
      500,
      "Something went wrong while generating access token",
    );
  }
};

const getClientAppUrl = () =>
  process.env.CLIENT_APP_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

const buildFrontendUrl = (path) => {
  const baseUrl = getClientAppUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
};

const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, userType } = req.body;

  const existedUser = await findUserByEmail(email);

  if (existedUser) {
    throw new ApiError(409, "User with email already exists", []);
  }

  const result = await createUser(
    firstName,
    lastName,
    email,
    password,
    userType,
  );

  const user = await findUserById(result.insertId);

  if (!user) {
    throw new ApiError(500, "Something went wrong while registering a user");
  }

  const { unHashedToken, hashedToken, tokenExpiry } = generateTemporaryToken();

  await saveEmailVerificationToken(user.id, hashedToken, new Date(tokenExpiry));

  await sendEmail({
    to: user.email,
    subject: "Please verify your email",
    mailgenContent: emailVerificationMailgenContent(
      `${user.first_name} ${user.last_name}`,
      buildFrontendUrl(`/verify-email/${unHashedToken}`),
    ),
  });

  const createdUser = await findUserById(user.id);

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while fetching created user");
  }

  const safeUser = {
    id: createdUser.id,
    firstName: createdUser.first_name,
    lastName: createdUser.last_name,
    email: createdUser.email,
    userType: createdUser.user_type,
    isAdmin: createdUser.is_admin,
    isEmailVerified: createdUser.is_email_verified,
    createdAt: createdUser.created_at,
    updatedAt: createdUser.updated_at,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: safeUser },
        "User registered successfully and verification email has been sent on your email",
      ),
    );
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  const user = await findUserByEmail(email);

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const isMatch = await isPasswordCorrect(password, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user.id,
  );

  const loggedInUser = await findUserById(user.id);

  const safeUser = {
    id: loggedInUser.id,
    firstName: loggedInUser.first_name,
    lastName: loggedInUser.last_name,
    email: loggedInUser.email,
    userType: loggedInUser.user_type,
    isAdmin: loggedInUser.is_admin,
    isEmailVerified: loggedInUser.is_email_verified,
    createdAt: loggedInUser.created_at,
    updatedAt: loggedInUser.updated_at,
  };

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: safeUser,
        },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const userID = req.user?.id;

  if (!userID) {
    throw new ApiError(401, "Unauthorized");
  }

  await clearRefreshToken(userID);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, null, "User logged out successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: req.user },
        "Current user fetched successfully",
      ),
    );
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { verificationToken } = req.params;

  if (!verificationToken) {
    throw new ApiError(400, "Verification token is required");
  }

  let hashedToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

  const user = await findUserByEmailVerificationToken(hashedToken);

  if (!user) {
    throw new ApiError(400, "Invalid or expired verification token");
  }

  await markEmailAsVerified(user.id);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Email verified successfully"));
});

const resendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await findUserById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.is_email_verified) {
    throw new ApiError(409, "Email is already verified");
  }

  const { unHashedToken, hashedToken, tokenExpiry } = generateTemporaryToken();

  await saveEmailVerificationToken(user.id, hashedToken, new Date(tokenExpiry));

  await sendEmail({
    to: user.email,
    subject: "Please verify your email",
    mailgenContent: emailVerificationMailgenContent(
      `${user.first_name} ${user.last_name}`,
      buildFrontendUrl(`/verify-email/${unHashedToken}`),
    ),
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Verification email resent successfully, please check your email",
      ),
    );
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );

    const user = await findUserById(decodedToken.id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (!(await isRefreshTokenActive(user.id, incomingRefreshToken))) {
      throw new ApiError(401, "Refresh token is invalid");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user.id,
    );

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(new ApiResponse(200, {}, "Access token refreshed successfully"));
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token");
  }
});

const forgotPasswordRequest = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await findUserByEmail(email);

  if (!user) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { email },
          "Password reset email sent successfully, please check your email",
        ),
      );
  }

  const { unHashedToken, hashedToken, tokenExpiry } = generateTemporaryToken();

  await saveForgotPasswordToken(user.id, hashedToken, new Date(tokenExpiry));

  await sendEmail({
    to: user.email,
    subject: "Password Reset Request",
    mailgenContent: forgotPasswordMailgenContent(
      `${user.first_name} ${user.last_name}`,
      `${process.env.FORGOT_PASSWORD_REDIRECT_URL}/${unHashedToken}`,
    ),
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { email },
        "Password reset email sent successfully, please check your email",
      ),
    );
});

const resetForgotPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { newPassword } = req.body;

  let hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const user = await findUserByForgotPasswordToken(hashedToken);

  if (!user) {
    throw new ApiError(400, "Invalid or expired password reset token");
  }

  await updatePassword(user.id, newPassword);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await findUserById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isMatch = await isPasswordCorrect(oldPassword, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Incorrect old password");
  }

  await updatePassword(user.id, newPassword);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  verifyEmail,
  resendVerificationEmail,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgotPassword,
  changeCurrentPassword,
};
