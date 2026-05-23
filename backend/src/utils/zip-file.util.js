import path from "path";
import zlib from "zlib";
import { ApiError } from "./api-error.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_CANDIDATES = 100;
const MAX_EXTRACTED_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_MODEL_EXTENSIONS = new Set([".stl", ".obj", ".3mf"]);

function getEntryExtension(entryName) {
  return path.posix.extname(entryName || "").toLowerCase();
}

function decodeZipName(buffer, isUtf8) {
  return buffer.toString(isUtf8 ? "utf8" : "latin1");
}

function isSafeZipEntryName(entryName) {
  if (!entryName || entryName.includes("\\")) {
    return false;
  }

  if (entryName.startsWith("/") || /^[a-z]:/i.test(entryName)) {
    return false;
  }

  const normalizedPath = path.posix.normalize(entryName);

  return (
    normalizedPath === entryName &&
    !normalizedPath.startsWith("../") &&
    normalizedPath !== ".."
  );
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new ApiError(400, "ZIP archive is invalid or unsupported");
}

function listZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ApiError(400, "ZIP central directory is invalid");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const fileName = decodeZipName(
      buffer.subarray(nameStart, nameStart + fileNameLength),
      Boolean(flags & 0x0800),
    );

    entries.push({
      name: fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      encrypted: Boolean(flags & 0x0001),
      isDirectory: fileName.endsWith("/"),
      safe: isSafeZipEntryName(fileName),
      extension: getEntryExtension(fileName),
    });

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function listPrintableZipEntries(buffer) {
  return listZipEntries(buffer)
    .filter(
      (entry) =>
        !entry.isDirectory &&
        entry.safe &&
        !entry.encrypted &&
        SUPPORTED_MODEL_EXTENSIONS.has(entry.extension),
    )
    .filter((entry) => entry.uncompressedSize <= MAX_EXTRACTED_FILE_BYTES)
    .slice(0, MAX_ZIP_CANDIDATES)
    .map((entry) => ({
      path: entry.name,
      name: path.posix.basename(entry.name),
      extension: entry.extension,
      size: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
    }));
}

function extractZipEntry(buffer, entryPath) {
  const entries = listZipEntries(buffer);
  const entry = entries.find((candidate) => candidate.name === entryPath);

  if (!entry) {
    throw new ApiError(400, "Selected ZIP entry was not found");
  }

  if (
    entry.isDirectory ||
    !entry.safe ||
    entry.encrypted ||
    !SUPPORTED_MODEL_EXTENSIONS.has(entry.extension)
  ) {
    throw new ApiError(400, "Selected ZIP entry is not a supported model file");
  }

  if (entry.uncompressedSize > MAX_EXTRACTED_FILE_BYTES) {
    throw new ApiError(
      400,
      "Selected ZIP entry is larger than the supported 50 MB limit",
    );
  }

  const localOffset = entry.localHeaderOffset;

  if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new ApiError(400, "Selected ZIP entry has an invalid local header");
  }

  const localFileNameLength = buffer.readUInt16LE(localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localFileNameLength + localExtraLength;
  const compressedData = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );

  let extracted;

  if (entry.compressionMethod === 0) {
    extracted = Buffer.from(compressedData);
  } else if (entry.compressionMethod === 8) {
    extracted = zlib.inflateRawSync(compressedData, {
      maxOutputLength: MAX_EXTRACTED_FILE_BYTES,
    });
  } else {
    throw new ApiError(
      400,
      "Selected ZIP entry uses an unsupported compression method",
    );
  }

  if (extracted.byteLength > MAX_EXTRACTED_FILE_BYTES) {
    throw new ApiError(
      400,
      "Selected ZIP entry is larger than the supported 50 MB limit",
    );
  }

  return {
    buffer: extracted,
    name: path.posix.basename(entry.name),
    path: entry.name,
    extension: entry.extension,
    size: extracted.byteLength,
  };
}

export { extractZipEntry, listPrintableZipEntries };
