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
import designRequestRoutes from "./src/routes/design-requests.routes.js";
import printRequestRoutes from "./src/routes/print-request.routes.js";
import printersRoutes from "./src/routes/printers.routes.js";
import { startExpiredQuoteCleanupJob } from "./src/services/quote-cleanup.service.js";
import { ApiError } from "./src/utils/api-error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(
  "/storage/local-designs",
  express.static(path.resolve(process.cwd(), "storage", "local-designs"), {
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
  "/storage/print-requests/models",
  express.static(
    path.resolve(process.cwd(), "storage", "print-requests", "models"),
    {
      fallthrough: false,
      index: false,
      etag: true,
      immutable: true,
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    },
  ),
);

// ─── Routes ───────────────────────────────────────────────────
app.use(
  "/storage/print-requests/payment-slips",
  express.static(
    path.resolve(process.cwd(), "storage", "print-requests", "payment-slips"),
    {
      fallthrough: false,
      index: false,
      etag: true,
      immutable: true,
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    },
  ),
);

app.use(
  "/storage/design-requests/references",
  express.static(
    path.resolve(process.cwd(), "storage", "design-requests", "references"),
    {
      fallthrough: false,
      index: false,
      etag: true,
      immutable: true,
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    },
  ),
);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/quotes", quoteRoutes);
app.use("/api/v1/pricing-config", pricingConfigRoutes);
app.use("/api/v1/materials", materialsRoutes);
app.use("/api/v1/designs", designsRoutes);
app.use("/api/v1/design-requests", designRequestRoutes);
app.use("/api/v1/requests", printRequestRoutes);
app.use("/api/v1/printers", printersRoutes);
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
  startExpiredQuoteCleanupJob();
});
