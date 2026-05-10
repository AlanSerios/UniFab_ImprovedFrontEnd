import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import { ApiError } from "../utils/api-error.js";
import { ensureDirExists } from "../utils/temp-path.util.js";
import {
  PRINT_REQUEST_MODEL_UPLOAD_FIELD,
  PRINT_REQUEST_MODEL_ALLOWED_EXTENSIONS,
  MAX_PRINT_REQUEST_MODEL_FILE_SIZE_BYTES,
} from "../constants/print-request.constants.js";
import {
  PRINT_REQUEST_MODEL_FILES_ROOT,
} from "../utils/print-request-storage.util.js";

const ALLOWED_MODEL_EXTENSIONS = new Set(
  PRINT_REQUEST_MODEL_ALLOWED_EXTENSIONS,
);

ensureDirExists(PRINT_REQUEST_MODEL_FILES_ROOT);

const modelStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, PRINT_REQUEST_MODEL_FILES_ROOT);
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFileName = `${randomUUID()}${ext}`;
    cb(null, safeFileName);
  },
});

function modelFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
    return cb(
      new ApiError(
        400,
        "Invalid model file type. Only STL, OBJ, and 3MF files are allowed.",
      ),
      false,
    );
  }

  return cb(null, true);
}

const modelUpload = multer({
  storage: modelStorage,
  limits: {
    fileSize: MAX_PRINT_REQUEST_MODEL_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: modelFileFilter,
});

const printRequestModelUploadMiddleware = modelUpload.single(
  PRINT_REQUEST_MODEL_UPLOAD_FIELD,
);

export {
  printRequestModelUploadMiddleware,
};
