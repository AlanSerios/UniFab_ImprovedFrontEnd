import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export const PUBLISHABLE_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
]);

export const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

export function buildMyDesignFormData({
  form,
  designFiles,
  thumbnailImages,
  assetState,
}) {
  const fd = new FormData();
  fd.append("title", form.title);
  fd.append("description", form.description);
  fd.append("categoryId", form.categoryId);
  fd.append("tagIds", form.tagIds.join(","));
  fd.append("licenseType", form.licenseType);
  fd.append("ownershipConfirmed", String(form.ownershipConfirmed));
  fd.append("policyAcknowledged", String(form.policyAcknowledged));
  fd.append("removeFileIds", assetState.removeFileIds.join(","));
  fd.append("removeImageIds", assetState.removeImageIds.join(","));
  fd.append("fileOrder", JSON.stringify(assetState.fileOrder));
  fd.append("imageOrder", JSON.stringify(assetState.imageOrder));

  if (assetState.primaryFileId) {
    fd.append("primaryFileId", String(assetState.primaryFileId));
  }

  if (assetState.primaryImageId) {
    fd.append("primaryImageId", String(assetState.primaryImageId));
  }

  if (assetState.replaceFileId && assetState.replacementFile) {
    fd.append("replaceFileId", String(assetState.replaceFileId));
    fd.append("designFiles", assetState.replacementFile);
  }

  if (assetState.replaceImageId && assetState.replacementImage) {
    fd.append("replaceImageId", String(assetState.replaceImageId));
    fd.append("thumbnailImages", assetState.replacementImage);
  }

  for (const file of designFiles) fd.append("designFiles", file);
  for (const file of thumbnailImages) fd.append("thumbnailImages", file);

  return fd;
}

export function activeFiles(design) {
  return (design?.files || []).filter(
    (file) =>
      (file.status || "active") === "active" &&
      (file.storageStatus || "present") === "present",
  );
}

export function activeImages(design) {
  return (design?.images || []).filter(
    (image) =>
      (image.status || "active") === "active" &&
      (image.storageStatus || "present") === "present",
  );
}

export function toAssetState(design) {
  const files = activeFiles(design);
  const images = activeImages(design);

  return {
    removeFileIds: [],
    removeImageIds: [],
    replaceFileId: "",
    replaceImageId: "",
    replacementFile: null,
    replacementImage: null,
    primaryFileId: files.find((file) => file.isPrimary)?.id || files[0]?.id || "",
    primaryImageId:
      images.find((image) => image.isPrimary)?.id || images[0]?.id || "",
    fileOrder: files.map((file) => Number(file.id)).filter(Boolean),
    imageOrder: images.map((image) => Number(image.id)).filter(Boolean),
  };
}

export function toFormState(design) {
  return {
    title: design?.title === "Untitled draft" ? "" : design?.title || "",
    description: design?.description || "",
    categoryId: design?.category?.id ? String(design.category.id) : "",
    tagIds: (design?.tags || []).map((tag) => String(tag.id)),
    licenseType: design?.licenseType || "",
    ownershipConfirmed: Boolean(design?.ownershipConfirmed),
    policyAcknowledged: Boolean(design?.policyAcknowledged),
  };
}

export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!value || Number.isNaN(value)) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function getOrderIndex(order, id, fallbackIndex) {
  const index = order.findIndex((value) => Number(value) === Number(id));
  return index < 0 ? fallbackIndex + 1000 : index;
}
