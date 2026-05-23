import path from "path";

function sanitizeDownloadFileName(fileName, fallback = "download") {
  const baseName = path.basename(String(fileName || fallback));
  const sanitized = baseName
    .replace(/[\r\n"]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .trim();

  return sanitized || fallback;
}

function toAsciiFallback(fileName) {
  return fileName.replace(/[^\x20-\x7E]/g, "_");
}

function buildContentDisposition(disposition, fileName) {
  const safeFileName = sanitizeDownloadFileName(fileName);
  const asciiFallback = toAsciiFallback(safeFileName);
  const encodedFileName = encodeURIComponent(safeFileName).replace(
    /['()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodedFileName}`;
}

export { buildContentDisposition, sanitizeDownloadFileName };
