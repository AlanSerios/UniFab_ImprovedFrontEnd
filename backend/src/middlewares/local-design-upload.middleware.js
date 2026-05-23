import path from "path";
import multer from "multer";
import { randomUUID } from "crypto";
import { ApiError } from "../utils/api-error.js";
import { ensureDirExists } from "../utils/temp-path.util.js";
import { resolveStoragePath } from "../utils/storage-root.util.js";

const ALLOWED_MODEL_EXTENSIONS = new Set([".stl", ".obj", ".3mf"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_MODEL_FILES = 8;
const MAX_THUMBNAIL_IMAGES = 12;
const MAX_FILES = MAX_MODEL_FILES + MAX_THUMBNAIL_IMAGES + 2;

const LOCAL_DESIGN_FILE_UPLOAD_FIELD = "designFile";
const LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD = "thumbnailImage";
const LOCAL_DESIGN_FILES_UPLOAD_FIELD = "designFiles";
const LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD = "thumbnailImages";

const LOCAL_DESIGN_FILES_DIR = resolveStoragePath("local-designs", "files");

const LOCAL_DESIGN_THUMBNAILS_DIR = resolveStoragePath(
  "local-designs",
  "thumbnails",
);

ensureDirExists(LOCAL_DESIGN_FILES_DIR);
ensureDirExists(LOCAL_DESIGN_THUMBNAILS_DIR);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (
      file.fieldname === LOCAL_DESIGN_FILE_UPLOAD_FIELD ||
      file.fieldname === LOCAL_DESIGN_FILES_UPLOAD_FIELD
    ) {
      return cb(null, LOCAL_DESIGN_FILES_DIR);
    }

    if (
      file.fieldname === LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD ||
      file.fieldname === LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD
    ) {
      return cb(null, LOCAL_DESIGN_THUMBNAILS_DIR);
    }

    return cb(new ApiError(400, `Unexpected file field: ${file.fieldname}`));
  },

  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeFileName = `${randomUUID()}${ext}`;
    cb(null, safeFileName);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (
    file.fieldname === LOCAL_DESIGN_FILE_UPLOAD_FIELD ||
    file.fieldname === LOCAL_DESIGN_FILES_UPLOAD_FIELD
  ) {
    if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
      return cb(
        new ApiError(
          400,
          "Invalid design file type. Only STL, OBJ, and 3MF files are allowed.",
        ),
        false,
      );
    }

    return cb(null, true);
  }

  if (
    file.fieldname === LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD ||
    file.fieldname === LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD
  ) {
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      return cb(
        new ApiError(
          400,
          "Invalid thumbnail image type. Only JPG, JPEG, PNG, and WEBP files are allowed.",
        ),
        false,
      );
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new ApiError(
          400,
          "Invalid thumbnail image MIME type. Only JPEG, PNG, and WEBP images are allowed.",
        ),
        false,
      );
    }

    return cb(null, true);
  }

  return cb(
    new ApiError(400, `Unexpected file field: ${file.fieldname}`),
    false,
  );
}

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter,
});

const localDesignUploadMiddleware = upload.fields([
  { name: LOCAL_DESIGN_FILE_UPLOAD_FIELD, maxCount: 1 },
  { name: LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD, maxCount: 1 },
  { name: LOCAL_DESIGN_FILES_UPLOAD_FIELD, maxCount: MAX_MODEL_FILES },
  {
    name: LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
    maxCount: MAX_THUMBNAIL_IMAGES,
  },
]);

export {
  LOCAL_DESIGN_FILE_UPLOAD_FIELD,
  LOCAL_DESIGN_FILES_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAIL_UPLOAD_FIELD,
  LOCAL_DESIGN_THUMBNAILS_UPLOAD_FIELD,
  localDesignUploadMiddleware,
  LOCAL_DESIGN_FILES_DIR,
  LOCAL_DESIGN_THUMBNAILS_DIR,
};
