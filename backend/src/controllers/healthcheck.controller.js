import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import pool from "../db/db.js";
import { getProductionDatabaseMetrics } from "../services/database-observability.service.js";

const healthCheck = asyncHandler(async (req, res) => {
  const checkedAt = new Date().toISOString();
  const startTime = Date.now();

  await pool.query("SELECT 1 AS ok");

  res.status(200).json(
    new ApiResponse(
      200,
      {
        status: "ok",
        service: "UniFab API",
        database: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        latencyMs: Date.now() - startTime,
        checkedAt,
      },
      "Server is running",
    ),
  );
});

const databaseMetrics = asyncHandler(async (_req, res) => {
  const metrics = await getProductionDatabaseMetrics();

  res.status(200).json(
    new ApiResponse(
      200,
      {
        status: "ok",
        metrics,
      },
      "Database metrics fetched successfully",
    ),
  );
});

export { databaseMetrics, healthCheck };
