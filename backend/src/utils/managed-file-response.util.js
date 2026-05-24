import { buildDownloadUrl } from "../services/file-storage.service.js";

function buildManagedFileDownloadUrl(
  fileObjectId,
  fallbackUrl,
  { inline = false } = {},
) {
  return fileObjectId ? buildDownloadUrl(fileObjectId, { inline }) : fallbackUrl;
}

function buildInlineManagedFileDownloadUrl(fileObjectId, fallbackUrl) {
  return buildManagedFileDownloadUrl(fileObjectId, fallbackUrl, {
    inline: true,
  });
}

export {
  buildInlineManagedFileDownloadUrl,
  buildManagedFileDownloadUrl,
};
