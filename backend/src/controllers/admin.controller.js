import pool from "../db/db.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  buildPagination,
  normalizeAdminAuditEvent,
  normalizeAdminUser,
  normalizeSiteContent,
  parseOptionalBooleanField,
} from "../utils/admin-response.util.js";
import {
  countAdminUsers,
  createAdminAuditEvent,
  getAdminDashboardMetrics,
  getAdminUserById,
  listAdminAuditEvents,
  listAdminUsers,
  listSiteContent,
  updateAdminUserFlags,
  updateSiteContentItem,
} from "../models/admin.model.js";

const getAdminDashboard = asyncHandler(async (_req, res) => {
  const metrics = await getAdminDashboardMetrics();

  return res.status(200).json(
    new ApiResponse(
      200,
      { metrics },
      "Admin dashboard metrics fetched successfully",
    ),
  );
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await listAdminUsers({
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    role: req.query.role,
    verified: req.query.verified,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        users: result.rows.map(normalizeAdminUser),
        counts: result.counts,
        pagination: buildPagination(result),
        filters: {
          search: req.query.search || "",
          role: req.query.role || "",
          verified: req.query.verified || "",
        },
      },
      "Admin users fetched successfully",
    ),
  );
});

const updateUser = asyncHandler(async (req, res) => {
  const targetUserId = Number(req.params.userId);
  const isAdmin = parseOptionalBooleanField(req.body.isAdmin, "isAdmin");
  const isEmailVerified = parseOptionalBooleanField(
    req.body.isEmailVerified,
    "isEmailVerified",
  );

  if (isAdmin === undefined && isEmailVerified === undefined) {
    throw new ApiError(400, "At least one user flag must be provided");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const existingUser = await getAdminUserById(targetUserId, connection);

    if (!existingUser) {
      throw new ApiError(404, "User not found");
    }

    if (
      Number(targetUserId) === Number(req.user.id) &&
      isAdmin === false &&
      Boolean(existingUser.is_admin)
    ) {
      throw new ApiError(400, "Admins cannot remove their own admin access");
    }

    if (isAdmin === false && Boolean(existingUser.is_admin)) {
      const adminCount = await countAdminUsers(connection);
      if (adminCount <= 1) {
        throw new ApiError(400, "At least one admin account must remain");
      }
    }

    const updatedUser = await updateAdminUserFlags(
      { userId: targetUserId, isAdmin, isEmailVerified },
      connection,
    );

    await createAdminAuditEvent(
      {
        actorId: req.user.id,
        eventType: "user_flags_updated",
        entityType: "user",
        entityId: targetUserId,
        summary: `Updated admin controls for ${existingUser.email}.`,
        metadata: {
          before: {
            isAdmin: Boolean(existingUser.is_admin),
            isEmailVerified: Boolean(existingUser.is_email_verified),
          },
          after: {
            isAdmin: Boolean(updatedUser.is_admin),
            isEmailVerified: Boolean(updatedUser.is_email_verified),
          },
        },
      },
      connection,
    );

    await connection.commit();

    return res.status(200).json(
      new ApiResponse(
        200,
        { user: normalizeAdminUser(updatedUser) },
        "Admin user updated successfully",
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const listAuditEvents = asyncHandler(async (req, res) => {
  const result = await listAdminAuditEvents({
    page: req.query.page,
    limit: req.query.limit,
    entityType: req.query.entityType,
    actorId: req.query.actorId,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        events: result.rows.map(normalizeAdminAuditEvent),
        pagination: buildPagination(result),
      },
      "Admin audit events fetched successfully",
    ),
  );
});

const getContent = asyncHandler(async (_req, res) => {
  const content = (await listSiteContent()).map(normalizeSiteContent);

  return res.status(200).json(
    new ApiResponse(
      200,
      { content },
      "Site content fetched successfully",
    ),
  );
});

const updateContent = asyncHandler(async (req, res) => {
  const contentKey = String(req.params.contentKey || "").trim();

  if (!contentKey) {
    throw new ApiError(400, "Content key is required");
  }

  const title = String(req.body.title || "").trim();

  if (!title) {
    throw new ApiError(400, "Content title is required");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const content = await updateSiteContentItem(
      {
        contentKey,
        title,
        body: req.body.body || "",
        metadata: req.body.metadata || {},
        updatedBy: req.user.id,
      },
      connection,
    );

    await createAdminAuditEvent(
      {
        actorId: req.user.id,
        eventType: "site_content_updated",
        entityType: "site_content",
        entityId: contentKey,
        summary: `Updated site content: ${contentKey}.`,
        metadata: {
          title,
        },
      },
      connection,
    );

    await connection.commit();

    return res.status(200).json(
      new ApiResponse(
        200,
        { content: normalizeSiteContent(content) },
        "Site content updated successfully",
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

export {
  getAdminDashboard,
  getContent,
  listAuditEvents,
  listUsers,
  updateContent,
  updateUser,
};
