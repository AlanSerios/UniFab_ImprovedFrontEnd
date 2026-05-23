import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FilePlus,
  ImagePlus,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  archiveAdminLocalDesign,
  createAdminLocalDesign,
  deleteAdminLocalDesign,
  getAdminLocalDesignById,
  getDesignTaxonomy,
  updateAdminLocalDesignCuration,
  updateAdminLocalDesign,
} from "../../api/designs";
import { API_BASE_URL } from "../../api/client";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Alert, StatusBadge } from "../../components/ui/Feedback";
import {
  Field,
  FormSection,
  SelectInput,
  TextArea,
  TextInput,
} from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

function toFormState(localDesign) {
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

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

function activeFiles(design) {
  return (design?.files || []).filter(
    (file) =>
      (file.status || "active") === "active" &&
      (file.storageStatus || "present") === "present",
  );
}

function activeImages(design) {
  return (design?.images || []).filter(
    (image) =>
      (image.status || "active") === "active" &&
      (image.storageStatus || "present") === "present",
  );
}

function toAssetState(design) {
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

function formatFileSize(bytes) {
  const value = Number(bytes);

  if (!value || Number.isNaN(value)) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getOrderIndex(order, id, fallbackIndex) {
  const index = order.findIndex((item) => Number(item) === Number(id));
  return index < 0 ? fallbackIndex + 1000 : index;
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function OriginOption({ checked, label, name, onChange, sublabel, value }) {
  return (
    <label className="flex cursor-pointer gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 border-slate-300 text-slate-950 focus:ring-slate-500"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-950">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
            {sublabel}
          </span>
        )}
      </span>
    </label>
  );
}

function UploadZone({
  accept,
  description,
  icon: Icon,
  inputId,
  onChange,
  selectedFiles,
  title,
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <label
        htmlFor={inputId}
        className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center transition hover:border-slate-500 hover:bg-slate-50"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-950 text-white">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="mt-4 text-base font-semibold text-slate-950">
          {title}
        </span>
        <span className="mt-1 max-w-md text-sm leading-6 text-slate-600">
          {description}
        </span>
        <span className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Browse files
        </span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={onChange}
        />
      </label>

      {selectedFiles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedFiles.map((file) => (
            <span
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {file.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  accept,
  canMoveDown,
  canMoveUp,
  isPrimary,
  isPrintReady,
  kind,
  meta,
  name,
  onMoveDown,
  onMoveUp,
  onPrimary,
  onRemove,
  onReplace,
  previewUrl,
  replacementName,
}) {
  const isImage = kind === "image";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
        <div className="flex h-24 min-h-24 items-center justify-center overflow-hidden rounded-md bg-slate-100">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : isImage ? (
            <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
          ) : (
            <FilePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isPrimary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-xs font-semibold text-white">
                <Star className="h-3 w-3" aria-hidden="true" />
                Primary
              </span>
            )}
            {isPrintReady && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <Check className="h-3 w-3" aria-hidden="true" />
                Print Ready
              </span>
            )}
          </div>
          <p className="mt-2 break-all text-sm font-semibold text-slate-950">
            {name}
          </p>
          {meta && <p className="mt-1 text-xs text-slate-500">{meta}</p>}
          {replacementName && (
            <p className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
              Will replace with {replacementName}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button
          type="button"
          size="sm"
          variant={isPrimary ? "subtle" : "secondary"}
          onClick={onPrimary}
        >
          <Star className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Primary
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ArrowUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ArrowDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Down
        </Button>
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50">
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Replace
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={onReplace}
          />
        </label>
        <Button type="button" size="sm" variant="danger" onClick={onRemove}>
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Remove
        </Button>
      </div>
    </article>
  );
}

function buildFormData({
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

export default function AdminLocalDesignForm() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(designId);

  const [form, setForm] = useState(() => toFormState(null));
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [currentDesign, setCurrentDesign] = useState(null);
  const [designFiles, setDesignFiles] = useState([]);
  const [thumbnailImages, setThumbnailImages] = useState([]);
  const [assetState, setAssetState] = useState(() => toAssetState(null));
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingCuration, setIsSavingCuration] = useState(false);
  const [persistedIsActive, setPersistedIsActive] = useState(true);
  const [loadedSourceKind, setLoadedSourceKind] = useState("lab");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTaxonomy() {
      try {
        const data = await getDesignTaxonomy();
        const payload = data.data || data;

        if (isMounted) {
          setTaxonomy({
            categories: payload.categories || [],
            tags: payload.tags || [],
          });
        }
      } catch {
        if (isMounted) {
          setTaxonomy({ categories: [], tags: [] });
        }
      }
    }

    loadTaxonomy();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    let isMounted = true;

    async function loadLocalDesign() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getAdminLocalDesignById(designId);
        const localDesign = data.data?.localDesign || data.localDesign || data;

        if (isMounted) {
          setLoadedSourceKind(localDesign.sourceKind || "lab");
          setCurrentDesign(localDesign);
          setForm(toFormState(localDesign));
          setAssetState(toAssetState(localDesign));
          setPersistedIsActive(Boolean(localDesign.isActive));
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadLocalDesign();

    return () => {
      isMounted = false;
    };
  }, [designId, isEditing]);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const updateSelectedTags = (event) => {
    updateField(
      "tagIds",
      Array.from(event.target.selectedOptions).map((option) => option.value),
    );
  };

  const updateAssetState = (patch) => {
    setAssetState((current) => ({ ...current, ...patch }));
  };

  const markFileForRemoval = (fileId) => {
    const normalizedId = Number(fileId);
    updateAssetState({
      removeFileIds: [...new Set([...assetState.removeFileIds, normalizedId])],
      fileOrder: assetState.fileOrder.filter((id) => Number(id) !== normalizedId),
      primaryFileId:
        Number(assetState.primaryFileId) === normalizedId
          ? ""
          : assetState.primaryFileId,
    });
  };

  const markImageForRemoval = (imageId) => {
    const normalizedId = Number(imageId);
    updateAssetState({
      removeImageIds: [...new Set([...assetState.removeImageIds, normalizedId])],
      imageOrder: assetState.imageOrder.filter(
        (id) => Number(id) !== normalizedId,
      ),
      primaryImageId:
        Number(assetState.primaryImageId) === normalizedId
          ? ""
          : assetState.primaryImageId,
    });
  };

  const moveInOrder = (kind, id, direction) => {
    const key = kind === "file" ? "fileOrder" : "imageOrder";
    const order = [...assetState[key]];
    const index = order.findIndex((item) => Number(item) === Number(id));
    const nextIndex = index + direction;

    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;

    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    updateAssetState({ [key]: order });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!isEditing && designFiles.length === 0) {
      setError("Design file is required when creating an official lab design.");
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setSuccessMessage("");

      const formData = buildFormData({
        form,
        designFiles,
        thumbnailImages,
        isEditing,
        assetState,
      });

      if (isEditing) {
        const data = await updateAdminLocalDesign(designId, formData);
        const localDesign = data.data?.localDesign || data.localDesign || data;

        setPersistedIsActive(Boolean(localDesign?.isActive));
        setCurrentDesign(localDesign);
        setAssetState(toAssetState(localDesign));
        setForm((currentForm) => ({
          ...currentForm,
          archivedAt: localDesign?.archivedAt || currentForm.archivedAt,
        }));
        setDesignFiles([]);
        setThumbnailImages([]);
        setSuccessMessage("Official lab design updated successfully.");
        return;
      }

      await createAdminLocalDesign(formData);
      navigate("/admin/lab-designs");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    const confirmed = window.confirm(
      "Archive this unavailable official lab design? It will be hidden from the default admin list.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsArchiving(true);
      setError("");
      setSuccessMessage("");

      const data = await archiveAdminLocalDesign(designId);
      const localDesign = data.data?.localDesign || data.localDesign || data;

      setForm((currentForm) => ({
        ...currentForm,
        archivedAt: localDesign?.archivedAt || new Date().toISOString(),
      }));
      setSuccessMessage("Official lab design archived.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Permanently delete this archived official lab design? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      setError("");
      setSuccessMessage("");

      await deleteAdminLocalDesign(designId);
      navigate("/admin/lab-designs?archived=true");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveCuration = async () => {
    try {
      setIsSavingCuration(true);
      setError("");
      setSuccessMessage("");

      const data = await updateAdminLocalDesignCuration(designId, {
        isFeatured: form.isFeatured === "true",
        featuredRank: Number(form.featuredRank) || 0,
        isLibraryHidden: form.isLibraryHidden === "true",
        libraryNote: form.libraryNote,
      });
      const localDesign = data.data?.localDesign || data.localDesign || data;

      setForm(toFormState(localDesign));
      setSuccessMessage("Library curation settings updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingCuration(false);
    }
  };

  const visibleModelFiles = useMemo(() => {
    return activeFiles(currentDesign)
      .filter((file) => !assetState.removeFileIds.includes(Number(file.id)))
      .map((file, index) => ({ file, index }))
      .sort(
        (a, b) =>
          getOrderIndex(assetState.fileOrder, a.file.id, a.index) -
          getOrderIndex(assetState.fileOrder, b.file.id, b.index),
      )
      .map(({ file }) => file);
  }, [assetState.fileOrder, assetState.removeFileIds, currentDesign]);

  const visiblePreviewImages = useMemo(() => {
    return activeImages(currentDesign)
      .filter((image) => !assetState.removeImageIds.includes(Number(image.id)))
      .map((image, index) => ({ image, index }))
      .sort(
        (a, b) =>
          getOrderIndex(assetState.imageOrder, a.image.id, a.index) -
          getOrderIndex(assetState.imageOrder, b.image.id, b.index),
      )
      .map(({ image }) => image);
  }, [assetState.imageOrder, assetState.removeImageIds, currentDesign]);

  return (
    <PageShell size="xl">
      <div className="space-y-6">
        <PageHeader
          title={
            isEditing
              ? `Edit Official Lab Design${currentDesign?.title ? `: ${currentDesign.title}` : ""}`
              : "New Official Lab Design"
          }
          description="Create lab-owned catalog entries with managed files, previews, taxonomy, and library curation."
          action={
            <ButtonLink to="/admin/lab-designs" variant="secondary">
              Back to Lab Designs
            </ButtonLink>
          }
          meta={
            isEditing ? (
              <StatusBadge
                tone={
                  form.archivedAt
                    ? "neutral"
                    : form.isActive === "true"
                      ? "success"
                      : "warning"
                }
              >
                {form.archivedAt
                  ? "Archived"
                  : form.isActive === "true"
                    ? "Available"
                    : "Unavailable"}
              </StatusBadge>
            ) : (
              <StatusBadge tone="success">Official</StatusBadge>
            )
          }
        />

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading official lab design...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        <Alert className="mt-6" type="success">
          {successMessage}
        </Alert>

        {!isLoading && isEditing && loadedSourceKind !== "lab" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-950">
              This is a community design.
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Community submissions are reviewed in the Community Designs
              workflow. The Official Lab Designs form is reserved for lab-owned
              catalog records.
            </p>
            <ButtonLink
              to={`/admin/community-designs/${designId}`}
              className="mt-4"
            >
              Open Community Review
            </ButtonLink>
          </div>
        )}

        {!isLoading && (!isEditing || loadedSourceKind === "lab") && (
          <form
            onSubmit={handleSubmit}
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <div className="space-y-5">
              <SectionCard
                title="Basic information"
                description="Name the official lab design and attach the approved category and tags used in the public library."
              >
                <FormSection columns="grid-cols-1">
                  <Field label="Design title">
                    <TextInput
                      value={form.title}
                      onChange={(event) =>
                        updateField("title", event.target.value)
                      }
                      placeholder="Example: USTP FabLab phone stand"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Category"
                      hint="Choose one approved library category."
                    >
                      <SelectInput
                        value={form.categoryId}
                        onChange={(event) =>
                          updateField("categoryId", event.target.value)
                        }
                      >
                        <option value="">Select category</option>
                        {taxonomy.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>

                    <Field
                      label="Tags"
                      hint="Hold Ctrl or Shift to choose more than one."
                    >
                      <SelectInput
                        multiple
                        className="h-28"
                        value={form.tagIds}
                        onChange={updateSelectedTags}
                      >
                        {taxonomy.tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>

                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Model origin - this is a...
                    </p>
                    <div className="mt-2 rounded-md border border-slate-200 bg-white px-4">
                      <OriginOption
                        name="licenseType"
                        value="Original work"
                        checked={form.licenseType === "Original work"}
                        onChange={() =>
                          updateField("licenseType", "Original work")
                        }
                        label="Original model - made by the FabLab"
                        sublabel="This is a lab-owned original catalog design."
                      />
                      <OriginOption
                        name="licenseType"
                        value="Permitted remix"
                        checked={form.licenseType === "Permitted remix"}
                        onChange={() =>
                          updateField("licenseType", "Permitted remix")
                        }
                        label="Remix or variation of another model."
                        sublabel="The lab has permission to adapt and publish this model."
                      />
                      <OriginOption
                        name="licenseType"
                        value="Public/open license"
                        checked={form.licenseType === "Public/open license"}
                        onChange={() =>
                          updateField("licenseType", "Public/open license")
                        }
                        label="Reupload of another model - respecting original license."
                        sublabel="The source license allows UniFab to host this catalog entry."
                      />
                    </div>
                  </div>
                </FormSection>
              </SectionCard>

              <SectionCard
                title="Description"
                description="Add public-facing context, print notes, assembly notes, and any lab-specific usage guidance."
              >
                <Field label="Design description">
                  <TextArea
                    rows={9}
                    value={form.description}
                    onChange={(event) =>
                      updateField("description", event.target.value)
                    }
                    placeholder="Describe the official lab design, intended use, assembly notes, and print guidance."
                  />
                </Field>
              </SectionCard>

              <SectionCard
                title="Add files"
                description="Upload model files and preview images. New uploads are added unless you replace a specific existing asset below."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <UploadZone
                    inputId="admin-local-model-files"
                    icon={FilePlus}
                    title="Add model files"
                    description="STL, OBJ, and 3MF files are stored as separate active model assets."
                    accept=".stl,.obj,.3mf"
                    selectedFiles={designFiles}
                    onChange={(event) =>
                      setDesignFiles(Array.from(event.target.files || []))
                    }
                  />
                  <UploadZone
                    inputId="admin-local-preview-images"
                    icon={ImagePlus}
                    title="Add preview images"
                    description="JPG, PNG, or WEBP files become the public gallery."
                    accept=".jpg,.jpeg,.png,.webp"
                    selectedFiles={thumbnailImages}
                    onChange={(event) =>
                      setThumbnailImages(Array.from(event.target.files || []))
                    }
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Preview images"
                description="Set the primary image, reorder gallery images, replace a specific image, or remove it from the active catalog entry."
              >
                {visiblePreviewImages.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {visiblePreviewImages.map((image, index) => (
                      <AssetCard
                        key={image.id}
                        kind="image"
                        accept=".jpg,.jpeg,.png,.webp"
                        previewUrl={assetUrl(image.imageUrl)}
                        name={
                          image.originalFileName ||
                          image.imageUrl?.split("/").pop() ||
                          "Preview image"
                        }
                        meta="Gallery image"
                        isPrimary={
                          Number(assetState.primaryImageId) === Number(image.id)
                        }
                        replacementName={
                          Number(assetState.replaceImageId) === Number(image.id)
                            ? assetState.replacementImage?.name
                            : ""
                        }
                        canMoveUp={index > 0}
                        canMoveDown={index < visiblePreviewImages.length - 1}
                        onPrimary={() =>
                          updateAssetState({ primaryImageId: image.id })
                        }
                        onMoveUp={() => moveInOrder("image", image.id, -1)}
                        onMoveDown={() => moveInOrder("image", image.id, 1)}
                        onReplace={(event) =>
                          updateAssetState({
                            replaceImageId: image.id,
                            replacementImage: event.target.files?.[0] || null,
                          })
                        }
                        onRemove={() => markImageForRemoval(image.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                    No active preview images yet. Add one above to create the
                    public gallery.
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Model files"
                description="Manage model files independently. Print Ready verification remains file-level and separate from catalog visibility."
              >
                {visibleModelFiles.length > 0 ? (
                  <div className="space-y-3">
                    {visibleModelFiles.map((file, index) => (
                      <AssetCard
                        key={file.id}
                        kind="model"
                        accept=".stl,.obj,.3mf"
                        previewUrl={assetUrl(file.modelSnapshotUrl)}
                        name={
                          file.originalFileName ||
                          file.fileUrl?.split("/").pop() ||
                          "Model file"
                        }
                        meta={
                          [
                            formatFileSize(file.fileSize),
                            file.isPrintReady
                              ? "Verified for Instant Quote"
                              : "Needs Print Ready review",
                          ]
                            .filter(Boolean)
                            .join(" / ")
                        }
                        isPrimary={
                          Number(assetState.primaryFileId) === Number(file.id)
                        }
                        isPrintReady={file.isPrintReady}
                        replacementName={
                          Number(assetState.replaceFileId) === Number(file.id)
                            ? assetState.replacementFile?.name
                            : ""
                        }
                        canMoveUp={index > 0}
                        canMoveDown={index < visibleModelFiles.length - 1}
                        onPrimary={() =>
                          updateAssetState({ primaryFileId: file.id })
                        }
                        onMoveUp={() => moveInOrder("file", file.id, -1)}
                        onMoveDown={() => moveInOrder("file", file.id, 1)}
                        onReplace={(event) =>
                          updateAssetState({
                            replaceFileId: file.id,
                            replacementFile: event.target.files?.[0] || null,
                          })
                        }
                        onRemove={() => markFileForRemoval(file.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
                    No active model files yet. Creating an official lab design
                    requires at least one model file.
                  </div>
                )}
              </SectionCard>

              {isEditing && (
                <SectionCard
                  title="Library curation"
                  description="Curation changes affect catalog presentation only. They do not approve content or grant Print Ready status."
                >
                  <FormSection columns="md:grid-cols-2">
                    <Field label="Featured">
                      <SelectInput
                        value={form.isFeatured}
                        onChange={(event) =>
                          updateField("isFeatured", event.target.value)
                        }
                      >
                        <option value="false">Not featured</option>
                        <option value="true">Featured</option>
                      </SelectInput>
                    </Field>

                    <Field label="Featured rank">
                      <TextInput
                        type="number"
                        min="0"
                        max="9999"
                        value={form.featuredRank}
                        onChange={(event) =>
                          updateField("featuredRank", event.target.value)
                        }
                      />
                    </Field>

                    <Field label="Public library visibility">
                      <SelectInput
                        value={form.isLibraryHidden}
                        onChange={(event) =>
                          updateField("isLibraryHidden", event.target.value)
                        }
                      >
                        <option value="false">Visible in library</option>
                        <option value="true">Hidden from library</option>
                      </SelectInput>
                    </Field>

                    <div className="md:col-span-2">
                      <Field label="Library note">
                        <TextArea
                          rows={3}
                          value={form.libraryNote}
                          onChange={(event) =>
                            updateField("libraryNote", event.target.value)
                          }
                          placeholder="Optional public note shown on the design detail page."
                        />
                      </Field>
                    </div>
                  </FormSection>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSavingCuration}
                    onClick={handleSaveCuration}
                  >
                    {isSavingCuration ? "Saving curation..." : "Save Curation"}
                  </Button>
                </SectionCard>
              )}

              <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                Material and dimensions are not collected here because quote
                material is selected during quoting and printable dimensions are
                measured from the model file by the slicer workflow.
              </div>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <Panel className="p-4 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Official catalog
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">
                      {isEditing ? "Ready to update?" : "Ready to create?"}
                    </h2>
                  </div>
                  <StatusBadge
                    tone={
                      form.archivedAt
                        ? "neutral"
                        : form.isActive === "true"
                          ? "success"
                          : "warning"
                    }
                  >
                    {form.archivedAt
                      ? "Archived"
                      : form.isActive === "true"
                        ? "Available"
                        : "Unavailable"}
                  </StatusBadge>
                </div>

                {isEditing && (
                  <div className="mt-4">
                    <Field
                      label="Availability"
                      hint="Unavailable designs can be archived after saving."
                    >
                      <SelectInput
                        value={form.isActive}
                        onChange={(event) =>
                          updateField("isActive", event.target.value)
                        }
                      >
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                      </SelectInput>
                    </Field>
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  <Button type="submit" className="w-full" disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving
                      ? "Saving..."
                      : isEditing
                        ? "Update Official Design"
                        : "Create Official Design"}
                  </Button>

                  <ButtonLink
                    to="/admin/lab-designs"
                    variant="secondary"
                    className="w-full"
                  >
                    Cancel
                  </ButtonLink>
                </div>
              </Panel>

              {isEditing && !persistedIsActive && !form.archivedAt && (
                <Panel className="border-red-200 bg-red-50 p-4 sm:p-4">
                  <h2 className="text-sm font-semibold text-red-900">
                    Archive design
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-red-700">
                    Archive is available only after the design is saved as
                    unavailable.
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    className="mt-3 w-full"
                    onClick={handleArchive}
                    disabled={isArchiving}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isArchiving ? "Archiving..." : "Archive Design"}
                  </Button>
                </Panel>
              )}

              {isEditing && !persistedIsActive && form.archivedAt && (
                <Panel className="border-red-200 bg-red-50 p-4 sm:p-4">
                  <h2 className="text-sm font-semibold text-red-900">
                    Permanent delete
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-red-700">
                    Permanent deletion is restricted to archived official lab
                    designs.
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    className="mt-3 w-full"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDeleting ? "Deleting..." : "Delete Permanently"}
                  </Button>
                </Panel>
              )}
            </aside>
          </form>
        )}
      </div>
    </PageShell>
  );
}
