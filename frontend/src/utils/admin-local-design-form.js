import { API_BASE_URL } from "../api/client";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function toAdminLocalDesignFormState(localDesign) {
  return {
    title: localDesign?.title || "",
    description: localDesign?.description || "",
    licenseType: localDesign?.licenseType || "",
    categoryId: localDesign?.category?.id ? String(localDesign.category.id) : "",
    tagIds: (localDesign?.tags || []).map((tag) => String(tag.id)),
    isActive: localDesign?.isActive === false ? "false" : "true",
    isFeatured: localDesign?.isFeatured ? "true" : "false",
    featuredRank: String(localDesign?.featuredRank || 0),
    isLibraryHidden: localDesign?.isLibraryHidden ? "true" : "false",
    libraryNote: localDesign?.libraryNote || "",
    archivedAt: localDesign?.archivedAt || null,
  };
}

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
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

export function toAdminLocalDesignAssetState(design) {
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

export function formatFileSize(bytes) {
  const value = Number(bytes);

  if (!value || Number.isNaN(value)) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function getOrderIndex(order, id, fallbackIndex) {
  const index = order.findIndex((item) => Number(item) === Number(id));
  return index < 0 ? fallbackIndex + 1000 : index;
}

export function buildAdminLocalDesignFormData({
  form,
  designFiles,
  thumbnailImages,
  isEditing,
  assetState,
}) {
  const formData = new FormData();

  formData.append("title", form.title);
  formData.append("description", form.description);
  formData.append("licenseType", form.licenseType);
  formData.append("categoryId", form.categoryId);
  formData.append("tagIds", form.tagIds.join(","));

  if (isEditing) {
    formData.append("isActive", form.isActive);
  }

  formData.append("removeFileIds", assetState.removeFileIds.join(","));
  formData.append("removeImageIds", assetState.removeImageIds.join(","));
  formData.append("fileOrder", JSON.stringify(assetState.fileOrder));
  formData.append("imageOrder", JSON.stringify(assetState.imageOrder));

  if (assetState.primaryFileId) {
    formData.append("primaryFileId", String(assetState.primaryFileId));
  }

  if (assetState.primaryImageId) {
    formData.append("primaryImageId", String(assetState.primaryImageId));
  }

  if (assetState.replaceFileId && assetState.replacementFile) {
    formData.append("replaceFileId", String(assetState.replaceFileId));
    formData.append("designFiles", assetState.replacementFile);
  }

  if (assetState.replaceImageId && assetState.replacementImage) {
    formData.append("replaceImageId", String(assetState.replaceImageId));
    formData.append("thumbnailImages", assetState.replacementImage);
  }

  for (const file of designFiles) {
    formData.append("designFiles", file);
  }

  for (const file of thumbnailImages) {
    formData.append("thumbnailImages", file);
  }

  return formData;
}
