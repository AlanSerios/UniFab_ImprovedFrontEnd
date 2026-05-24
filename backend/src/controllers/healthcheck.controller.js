import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { getProductionDatabaseMetrics } from "../services/database-observability.service.js";
import { getHealthcheckStatus } from "../services/healthcheck.service.js";

const healthCheck = asyncHandler(async (req, res) => {
  const status = await getHealthcheckStatus();

  res.status(200).json(
    new ApiResponse(
      200,
      status,
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
