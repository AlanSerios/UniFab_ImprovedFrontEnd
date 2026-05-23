import express from "express";
import {
  createAdminPrinter,
  deleteAdminPrinter,
  listAdminPrinters,
  listPublicPrinterInfo,
  updateAdminPrinter,
} from "../controllers/printers.controller.js";
import {
  verifyEmailVerified,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { verifyAdmin } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  createPrinterValidator,
  printerIdValidator,
  updatePrinterValidator,
} from "../validators/printers.validator.js";
import {
  authenticatedReadRateLimiter,
  publicReadRateLimiter,
  writeRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

const router = express.Router();

router.route("/").get(publicReadRateLimiter, listPublicPrinterInfo);

router.use(verifyJWT, verifyEmailVerified, verifyAdmin);

router
  .route("/admin")
  .get(authenticatedReadRateLimiter, listAdminPrinters)
  .post(writeRateLimiter, createPrinterValidator(), validate, createAdminPrinter);

router
  .route("/admin/:printerId")
  .patch(writeRateLimiter, updatePrinterValidator(), validate, updateAdminPrinter)
  .delete(writeRateLimiter, printerIdValidator(), validate, deleteAdminPrinter);

export default router;
