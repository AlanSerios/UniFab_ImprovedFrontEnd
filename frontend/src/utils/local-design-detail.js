import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

export function downloadUrl(path) {
  const url = assetUrl(path);

  if (!url || !url.includes("/api/v1/files/")) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

export function formatSourceKind(sourceKind) {
  return sourceKind === "community" ? "Community Design" : "Official Lab";
}

export function getSafeReturnTo(searchParams) {
  const returnTo = searchParams.get("returnTo");

  if (!returnTo) {
    return "/designs";
  }

  if (
    returnTo === "/designs" ||
    returnTo.startsWith("/designs?") ||
    returnTo === "/my-designs" ||
    returnTo.startsWith("/my-designs?")
  ) {
    return returnTo;
  }

  return "/designs";
}

export function getFileLabel(design) {
  return (
    design?.fileName ||
    design?.fileUrl?.split("/").pop() ||
    design?.title ||
    "Design file"
  );
}

export function getFileExtension(fileName) {
  const cleanName = String(fileName || "").split(/[?#]/)[0];
  const match = cleanName.match(/\.([a-z0-9]+)$/i);

  return match ? match[1].toUpperCase() : "MODEL";
}

function normalizeGalleryUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const parsedUrl = new URL(value, window.location.origin);
    return parsedUrl.pathname.replace(/\/{2,}/g, "/").toLowerCase();
  } catch {
    return String(value).split(/[?#]/)[0].replace(/\/{2,}/g, "/").toLowerCase();
  }
}

export function dedupeGalleryItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const identity = item.type === "model" ? item.fileUrl || item.url : item.url;
    const key = `${item.type}:${normalizeGalleryUrl(identity) || item.key}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function activeDesignFiles(design) {
  return (design?.files || []).filter(
    (file) =>
      (file.status || "active") === "active" &&
      (file.storageStatus || "present") === "present",
  );
}

export function activeDesignImages(design) {
  return (design?.images || []).filter(
    (image) =>
      (image.status || "active") === "active" &&
      (image.storageStatus || "present") === "present",
  );
}

export function getDesignFilesWithLegacyFallback(design) {
  const files = activeDesignFiles(design);

  if (files.length) {
    return files;
  }

  if (!design?.fileUrl) {
    return [];
  }

  return [
    {
      id: null,
      fileUrl: design.fileUrl,
      modelSnapshotUrl: design.modelSnapshotUrl,
      originalFileName: getFileLabel(design),
      extension: getFileExtension(design.fileUrl || getFileLabel(design)),
      fileObjectId: design.fileObjectId || null,
      fileSize: design.fileSize,
      isPrintReady: Boolean(design.isPrintReady),
      isPrimary: true,
    },
  ];
}

export function getDesignImagesWithLegacyFallback({ design, thumbnailUrl }) {
  const images = activeDesignImages(design);

  if (images.length) {
    return images;
  }

  if (!thumbnailUrl) {
    return [];
  }

  return [
    {
      id: "legacy-thumbnail",
      imageUrl: design.thumbnailUrl,
      originalFileName: "Design thumbnail",
    },
  ];
}

export function buildDesignGalleryItems({ designImages, designFiles }) {
  return dedupeGalleryItems([
    ...designImages
      .map((image, index) => ({
        key: `image-${image.id || image.imageUrl || index}`,
        type: "image",
        url: assetUrl(image.imageUrl),
        label: image.originalFileName || `Design thumbnail ${index + 1}`,
      }))
      .filter((item) => item.url),
    ...designFiles
      .map((file, index) => ({
        key: `model-${file.id || file.fileUrl || index}`,
        type: "model",
        url: assetUrl(file.modelSnapshotUrl),
        fileUrl: file.fileUrl,
        fileObjectId: file.fileObjectId || null,
        modelSnapshotUrl: file.modelSnapshotUrl,
        fileName:
          file.originalFileName ||
          file.fileUrl?.split("/").pop() ||
          `Design file ${index + 1}`,
        extension:
          file.extension ||
          getFileExtension(file.originalFileName) ||
          getFileExtension(file.fileUrl),
        label: file.originalFileName || `3D model snapshot ${index + 1}`,
      }))
      .filter((item) => item.url || item.fileUrl),
  ]);
}
