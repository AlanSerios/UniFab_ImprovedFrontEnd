import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const EMPTY_OVERRIDE_FORM = {
  isPinned: false,
  isHidden: false,
  isPrintReady: false,
  clientNote: "",
  verificationConfirmed: false,
  verificationNote: "",
  selectedMmfFileId: "",
  selectedArchiveEntryPath: "",
};

export function buildMmfSelectionKey(fileId, archiveEntryPath = "") {
  return `${fileId}::${archiveEntryPath || ""}`;
}

export function parseMmfSelectionKey(key) {
  const [fileId, archiveEntryPath = ""] = String(key).split("::");

  return {
    fileId: Number(fileId),
    archiveEntryPath: archiveEntryPath || undefined,
  };
}

export function formatFileSize(value) {
  const size = Number(value || 0);

  if (!size) {
    return "-";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} kB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPathExtension(value) {
  if (!value) return null;

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}

export function buildMmfCandidateRows(files = []) {
  return files.flatMap((file) => {
    if (file.type === "zip") {
      return (file.archiveEntries || []).map((entry) => ({
        key: buildMmfSelectionKey(file.id, entry.path),
        fileId: file.id,
        archiveEntryPath: entry.path,
        name: entry.name || entry.path,
        parentName: file.name,
        extension: entry.extension || file.extension,
        size: entry.size,
        supported: file.supported,
        type: "zip-entry",
      }));
    }

    return [
      {
        key: buildMmfSelectionKey(file.id),
        fileId: file.id,
        archiveEntryPath: "",
        name: file.name,
        parentName: "",
        extension: file.extension,
        size: file.size,
        supported: file.supported,
        type: "file",
      },
    ];
  });
}

export function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

export function overrideToForm(override) {
  if (!override) {
    return EMPTY_OVERRIDE_FORM;
  }

  return {
    isPinned: Boolean(override.isPinned),
    isHidden: Boolean(override.isHidden),
    isPrintReady: Boolean(override.isPrintReady),
    clientNote: override.clientNote || "",
    verificationConfirmed: false,
    verificationNote: "",
    selectedMmfFileId:
      override.mappingMetadata?.selectedFile?.id ||
      override.mappingMetadata?.selectedMmfFileId ||
      "",
    selectedArchiveEntryPath:
      override.mappingMetadata?.selectedArchiveEntry?.path || "",
  };
}

export function getSafeReturnTo(searchParams) {
  const returnTo = searchParams.get("returnTo");

  if (!returnTo) {
    return "/designs";
  }

  if (returnTo === "/designs" || returnTo.startsWith("/designs?")) {
    return returnTo;
  }

  return "/designs";
}

export function getMmfPreviewImage(design) {
  const primaryImage = design?.images?.find((image) => image.isPrimary);
  const fallbackImage = design?.images?.[0];

  return (
    primaryImage?.standardUrl ||
    primaryImage?.thumbnailUrl ||
    primaryImage?.originalUrl ||
    fallbackImage?.standardUrl ||
    fallbackImage?.thumbnailUrl ||
    fallbackImage?.originalUrl ||
    ""
  );
}

export function getMmfImageUrl(image) {
  return (
    image?.standardUrl ||
    image?.thumbnailUrl ||
    image?.originalUrl ||
    ""
  );
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

export function getDesignerName(designer) {
  return designer?.name || designer?.username || null;
}

export function formatList(items, key = "name") {
  if (!Array.isArray(items) || items.length === 0) {
    return "-";
  }

  return items
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.[key] || item?.name || item?.slug || "";
    })
    .filter(Boolean)
    .join(", ");
}

export function formatLicense(design) {
  if (design?.license) {
    return design.license;
  }

  const activeLicenses = (design?.licenses || [])
    .filter((license) => license.value === true && license.type)
    .map((license) => license.type);

  return activeLicenses.length > 0 ? activeLicenses.join(", ") : "-";
}

export function formatDimensions(dimensions) {
  if (!dimensions) return "-";
  if (typeof dimensions === "string") return dimensions;

  const axisValues = ["x", "y", "z"]
    .map((axis) => dimensions[axis] || dimensions[axis.toUpperCase()])
    .filter(Boolean);

  return axisValues.length > 0
    ? axisValues.join(" x ")
    : JSON.stringify(dimensions);
}

export function formatStatus(status) {
  return (status || "not_requested")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getFileExtension(fileName) {
  const cleanName = String(fileName || "").split(/[?#]/)[0];
  const match = cleanName.match(/\.([a-z0-9]+)$/i);

  return match ? match[1].toUpperCase() : "MODEL";
}
