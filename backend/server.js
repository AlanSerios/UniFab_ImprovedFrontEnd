import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import multer from "multer";
import cookieParser from "cookie-parser";

import authRoutes from "./src/routes/auth.routes.js";
import quoteRoutes from "./src/routes/quote.routes.js";
import pricingConfigRoutes from "./src/routes/pricing-config.routes.js";
import materialsRoutes from "./src/routes/materials.routes.js";
import healthCheckRoutes from "./src/routes/healthcheck.routes.js";
import designsRoutes from "./src/routes/designs.routes.js";
import adminRoutes from "./src/routes/admin.routes.js";
import adminFileRegistryRoutes from "./src/routes/admin-file-registry.routes.js";
import printRequestRoutes from "./src/routes/print-request.routes.js";
import cartRoutes from "./src/routes/cart.routes.js";
import printersRoutes from "./src/routes/printers.routes.js";
import filesRoutes from "./src/routes/files.routes.js";
import {
  DESIGN_AI_MODERATION_SERVICE_VERSION,
  startDesignModerationWorker,
} from "./src/services/design-ai-moderation-orchestrator.service.js";
import { startDesignFileCleanupJob } from "./src/services/design-file-cleanup.service.js";
import { startDatabaseRetentionCleanupJob } from "./src/services/db-retention-cleanup.service.js";
import { startExpiredQuoteCleanupJob } from "./src/services/quote-cleanup.service.js";
import { ApiError } from "./src/utils/api-error.js";
import { resolveStoragePath } from "./src/utils/storage-root.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();

function warnProductionReadinessGaps() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const requiredFlags = [
    "PROD_DB_BACKUPS_CONFIRMED",
    "PROD_DB_PITR_CONFIRMED",
    "PROD_DB_RESTORE_DRILL_CONFIRMED",
    "MYSQL_SLOW_QUERY_LOGS_CONFIRMED",
    "FILE_STORAGE_BACKUP_CONFIRMED",
  ];
  const cleanupVars = [
    "QUOTE_CLEANUP_INTERVAL_MINUTES",
    "DESIGN_FILE_CLEANUP_INTERVAL_MINUTES",
    "DB_RETENTION_CLEANUP_INTERVAL_MINUTES",
  ];

  for (const name of requiredFlags) {
    if (process.env[name] !== "true") {
      console.warn(
        `Production readiness warning: ${name}=true is required before launch.`,
      );
    }
  }

  for (const name of cleanupVars) {
    if (!process.env[name]) {
      console.warn(
        `Production readiness warning: ${name} is not set; using default cleanup interval.`,
      );
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.use(
  "/storage/local-designs/thumbnails",
  express.static(resolveStoragePath("local-designs", "thumbnails"), {
    fallthrough: false,
    index: false,
    etag: true,
    immutable: true,
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

app.use(
  "/storage/mmf-print-ready/thumbnails",
  express.static(resolveStoragePath("mmf-print-ready", "thumbnails"), {
    fallthrough: false,
    index: false,
    etag: true,
    immutable: true,
    maxAge: "7d",
    setHeaders(res) {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/quotes", quoteRoutes);
app.use("/api/v1/pricing-config", pricingConfigRoutes);
app.use("/api/v1/materials", materialsRoutes);
app.use("/api/v1/designs", designsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin/files", adminFileRegistryRoutes);
app.use("/api/v1/requests", printRequestRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/printers", printersRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/v1/healthcheck", healthCheckRoutes);

app.use("/api", (req, res, next) => {
  next(new ApiError(404, "API route not found"));
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Uploaded file is too large",
        errors: [],
      });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field",
        errors: [],
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || "File upload error",
      errors: [],
    });
  }

  const statusCode = err.statusCode || err.status || 500;

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
  });
});

// ─── Start Server ─────────────────────────────────────────────
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(
    `Design moderation: provider=openai, mode=full-ai, aiService=${DESIGN_AI_MODERATION_SERVICE_VERSION}`,
  );
  warnProductionReadinessGaps();
  startExpiredQuoteCleanupJob();
  startDesignFileCleanupJob();
  startDatabaseRetentionCleanupJob();
  startDesignModerationWorker()
    .then((queuedCount) => {
      if (queuedCount > 0) {
        console.log(`Queued ${queuedCount} pending design moderation run(s).`);
      }
    })
    .catch((error) => {
      console.error("Failed to start design moderation worker:", error);
    });
});
