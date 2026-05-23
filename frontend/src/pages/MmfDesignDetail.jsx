import { useCallback, useEffect, useState } from "react";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Share2,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import {
  createAdminDesignOverride,
  getAdminMmfOAuthStatus,
  getMmfDesignByObjectId,
  inspectAdminMmfFiles,
  removeAdminMmfPrintReadyFile,
  startAdminMmfOAuth,
  updateAdminDesignOverride,
} from "../api/designs";
import {
  DetailSection,
  DetailTabs,
  MetadataGrid,
  ModelDetailHero,
  ModelDetailShell,
  SummaryPanel,
} from "../components/design/DesignDetailLayout";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { Field, TextArea } from "../components/ui/Form";
import { ModelViewer } from "../components/ui/ModelViewer";
import { ModelPreviewModal } from "../components/ui/ModelPreviewModal";
import { PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { normalizeModelPreview } from "../utils/model-preview";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const EMPTY_OVERRIDE_FORM = {
  isPinned: false,
  isHidden: false,
  isPrintReady: false,
  clientNote: "",
  verificationConfirmed: false,
  verificationNote: "",
  selectedMmfFileId: "",
  selectedArchiveEntryPath: "",
};

function buildMmfSelectionKey(fileId, archiveEntryPath = "") {
  return `${fileId}::${archiveEntryPath || ""}`;
}

function parseMmfSelectionKey(key) {
  const [fileId, archiveEntryPath = ""] = String(key).split("::");

  return {
    fileId: Number(fileId),
    archiveEntryPath: archiveEntryPath || undefined,
  };
}

function formatFileSize(value) {
  const size = Number(value || 0);

  if (!size) {
    return "-";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} kB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getPathExtension(value) {
  if (!value) return null;

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}

function buildMmfCandidateRows(files = []) {
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

function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

function overrideToForm(override) {
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

function getSafeReturnTo(searchParams) {
  const returnTo = searchParams.get("returnTo");

  if (!returnTo) {
    return "/designs";
  }

  if (returnTo === "/designs" || returnTo.startsWith("/designs?")) {
    return returnTo;
  }

  return "/designs";
}

function getMmfPreviewImage(design) {
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

function getMmfImageUrl(image) {
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

function dedupeGalleryItems(items) {
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

function getDesignerName(designer) {
  return designer?.name || designer?.username || null;
}

function formatList(items, key = "name") {
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

function formatLicense(design) {
  if (design?.license) {
    return design.license;
  }

  const activeLicenses = (design?.licenses || [])
    .filter((license) => license.value === true && license.type)
    .map((license) => license.type);

  return activeLicenses.length > 0 ? activeLicenses.join(", ") : "-";
}

function formatDimensions(dimensions) {
  if (!dimensions) return "-";
  if (typeof dimensions === "string") return dimensions;

  const axisValues = ["x", "y", "z"]
    .map((axis) => dimensions[axis] || dimensions[axis.toUpperCase()])
    .filter(Boolean);

  return axisValues.length > 0
    ? axisValues.join(" x ")
    : JSON.stringify(dimensions);
}

function formatStatus(status) {
  return (status || "not_requested")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getFileExtension(fileName) {
  const cleanName = String(fileName || "").split(/[?#]/)[0];
  const match = cleanName.match(/\.([a-z0-9]+)$/i);

  return match ? match[1].toUpperCase() : "MODEL";
}

function ExternalFileLink({ href, children, primary = false, className = "" }) {
  const base =
    "inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition";
  const tone = primary
    ? "bg-slate-950 text-white hover:bg-slate-800"
    : "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${tone} ${className}`}
    >
      {children}
    </a>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-44 text-right font-semibold text-slate-950">
        {value}
      </span>
    </div>
  );
}

function MmfPreviewGallery({
  items,
  title,
  activePreviewKey,
  onChange,
  onOpenModel,
}) {
  const previewItems = Array.isArray(items)
    ? items.filter((item) => item.url || (item.type === "model" && item.fileUrl))
    : [];
  const activeIndex = previewItems.findIndex(
    (item) => item.key === activePreviewKey,
  );
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const currentItem = previewItems[currentIndex] || null;
  const canSlide = previewItems.length > 1;
  const mainLabel =
    currentItem?.type === "model" ? "3D model snapshot" : "MMF preview image";

  const showPrevious = () => {
    if (!canSlide) return;
    const nextIndex =
      currentIndex === 0 ? previewItems.length - 1 : currentIndex - 1;
    onChange(previewItems[nextIndex].key);
  };

  const showNext = () => {
    if (!canSlide) return;
    const nextIndex =
      currentIndex === previewItems.length - 1 ? 0 : currentIndex + 1;
    onChange(previewItems[nextIndex].key);
  };

  return (
    <section className="h-full bg-white">
      <div className="relative bg-slate-100">
        <button
          type="button"
          onClick={
            currentItem?.type === "model" ? () => onOpenModel(currentItem) : undefined
          }
          disabled={currentItem?.type !== "model"}
          className={`group flex aspect-[4/3] min-h-80 w-full items-center justify-center ${
            currentItem?.type === "model"
              ? "cursor-zoom-in"
              : "cursor-default"
          }`}
          aria-label={
            currentItem?.type === "model"
              ? "Open 3D model preview"
              : "MMF preview image"
          }
        >
          {currentItem?.url ? (
            <img
              src={currentItem.url}
              alt={title || mainLabel}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
              <Box className="h-12 w-12 text-slate-400" aria-hidden="true" />
              3D model preview
            </div>
          )}

          {currentItem?.type === "model" && (
            <span className="absolute bottom-4 right-4 rounded-md bg-slate-950/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Open 3D preview
            </span>
          )}
        </button>

        {canSlide && (
          <>
            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label="Previous preview"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="absolute right-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label="Next preview"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex gap-2 overflow-x-auto">
          {previewItems.length > 0 ? (
            previewItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={`shrink-0 rounded-md border p-1 transition ${
                  currentItem?.key === item.key
                    ? "border-slate-950 bg-white"
                    : "border-slate-200 hover:border-slate-400"
                }`}
                title={item.label}
              >
                <span className="relative flex h-20 w-32 items-center justify-center overflow-hidden rounded bg-slate-100">
                  {item.url ? (
                    <img
                      src={item.url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Box className="h-7 w-7 text-slate-400" aria-hidden="true" />
                  )}
                  {item.type === "model" && (
                    <span className="absolute right-2 top-2 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      3D
                    </span>
                  )}
                  {previewItems.filter((preview) => preview.type === item.type)
                    .length > 1 && (
                    <span className="absolute bottom-2 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {index + 1}
                    </span>
                  )}
                </span>
                <span className="sr-only">{item.label}</span>
              </button>
            ))
          ) : (
            <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100">
              <Box className="h-7 w-7 text-slate-400" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function MmfFileRow({ title, description, status, action }) {
  return (
    <div className="grid gap-4 border-t border-slate-200 py-6 md:grid-cols-[minmax(0,1fr)_190px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-950">{title}</p>
          {status}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="grid gap-2">{action}</div>
    </div>
  );
}

function MmfModelFileListRow({
  fileName,
  modelSnapshotUrl,
  fileExtension,
  canPreview,
  canQuote,
  isQuoteDisabled,
  sourceUrl,
  onPreview,
  onQuote,
}) {
  return (
    <div className="grid gap-5 border-t border-slate-200 py-6 lg:grid-cols-[112px_minmax(0,1fr)_190px] lg:items-center">
      <button
        type="button"
        onClick={onPreview}
        disabled={!canPreview}
        className="group h-24 w-24 rounded-md border border-slate-200 bg-slate-100 p-2 transition disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:border-slate-400 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-slate-500"
        aria-label="Open 3D model preview"
      >
        {modelSnapshotUrl ? (
          <img
            src={modelSnapshotUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Box className="h-8 w-8 text-slate-400" aria-hidden="true" />
          </span>
        )}
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all text-sm font-semibold text-slate-950">
            {fileName}
          </p>
          <StatusBadge>{fileExtension}</StatusBadge>
          <StatusBadge tone={canQuote ? "success" : "warning"}>
            {canQuote ? "Print Ready" : "Needs Review"}
          </StatusBadge>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Cached MMF printable artifact used only for UniFab instant quote and
          FabLab review. Public source downloads remain on MyMiniFactory.
        </p>
        {!canQuote && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Instant quote unlocks after FabLab caches and verifies the exact
            printable file.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          onClick={onQuote}
          disabled={isQuoteDisabled}
          variant={canQuote ? "primary" : "secondary"}
          className="w-full"
        >
          Instant Quote
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={onPreview}
          disabled={!canPreview}
          className="w-full"
        >
          Preview 3D
        </Button>

        {sourceUrl && (
          <ExternalFileLink href={sourceUrl} className="w-full">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Source
          </ExternalFileLink>
        )}
      </div>
    </div>
  );
}

export default function MmfDesignDetail() {
  const { objectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  const returnTo = getSafeReturnTo(searchParams);

  const [design, setDesign] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPrintReadyFile, setPreviewPrintReadyFile] = useState(null);
  const [activePreview, setActivePreview] = useState("thumbnail");
  const [shareMessage, setShareMessage] = useState("");
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isRemovingPrintReadyFile, setIsRemovingPrintReadyFile] =
    useState(false);
  const [mmfOAuthStatus, setMmfOAuthStatus] = useState(null);
  const [fileInspection, setFileInspection] = useState(null);
  const [selectedMmfFileKeys, setSelectedMmfFileKeys] = useState([]);
  const [isInspectingFiles, setIsInspectingFiles] = useState(false);
  const [overrideForm, setOverrideForm] = useState(EMPTY_OVERRIDE_FORM);

  const isPrintReady = Boolean(design?.override?.isPrintReady);
  const linkedLocalDesignId = design?.override?.linkedLocalDesignId || null;
  const printReadyFiles = design?.override?.printReadyFiles?.length
    ? design.override.printReadyFiles
    : design?.override?.printReadyFile
      ? [design.override.printReadyFile]
      : [];
  const printReadyFile = printReadyFiles[0] || null;
  const printReadySnapshotUrl = assetUrl(printReadyFile?.modelSnapshotUrl);
  const printReadyFileName =
    printReadyFile?.originalFileName ||
    printReadyFile?.cachedFileUrl?.split("/").pop() ||
    design?.name ||
    "MMF printable file";
  const canQuoteDirectly = Boolean(isPrintReady && printReadyFile);
  const inspectedFiles = fileInspection?.files || [];
  const cachedMmfFileKeys = new Set(
    printReadyFiles
      .filter((file) => file.mmfFileId)
      .map((file) =>
        buildMmfSelectionKey(file.mmfFileId, file.archiveEntryPath || ""),
      ),
  );
  const selectedMmfFileKeySet = new Set(selectedMmfFileKeys);
  const mmfCandidateRows = buildMmfCandidateRows(inspectedFiles);
  const mmfGalleryItems = dedupeGalleryItems([
    ...(design?.images || [])
      .map((image, index) => ({
        key: `image-${image.id || getMmfImageUrl(image) || index}`,
        type: "image",
        url: getMmfImageUrl(image),
        label: image.name || image.title || `MMF preview image ${index + 1}`,
      }))
      .filter((item) => item.url),
    ...printReadyFiles
      .map((file, index) => ({
        key: `model-${file.id || file.cachedFileUrl || index}`,
        type: "model",
        url: assetUrl(file.modelSnapshotUrl),
        fileUrl: file.cachedFileUrl,
        fileObjectId: file.fileObjectId || null,
        file,
        fileName:
          file.originalFileName ||
          file.cachedFileUrl?.split("/").pop() ||
          `MMF printable file ${index + 1}`,
        extension:
          file.extension ||
          getPathExtension(file.originalFileName) ||
          getPathExtension(file.cachedFileUrl),
        label:
          file.originalFileName ||
          `3D model snapshot ${index + 1}`,
      }))
      .filter((item) => item.url || item.fileUrl),
  ]);
  const previewImage = getMmfPreviewImage(design);
  const designerName = getDesignerName(design?.designer);
  const loadDesign = useCallback(async () => {
    const data = await getMmfDesignByObjectId(objectId);
    const mmfObject = data.data?.mmfObject || data.mmfObject || data;

    setDesign(mmfObject);
    setOverrideForm(overrideToForm(mmfObject.override));
    setSelectedMmfFileKeys([]);

    return mmfObject;
  }, [objectId]);

  useEffect(() => {
    async function loadInitialDesign() {
      try {
        setIsLoading(true);
        setError("");

        await loadDesign();
      } catch (err) {
        setError(err.message);
        setDesign(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadInitialDesign();
  }, [loadDesign]);

  useEffect(() => {
    async function loadMmfOAuthStatus() {
      if (!isAdmin) {
        return;
      }

      try {
        const data = await getAdminMmfOAuthStatus();
        setMmfOAuthStatus(data.data?.status || data.status || null);
      } catch {
        setMmfOAuthStatus({ connected: false });
      }
    }

    loadMmfOAuthStatus();
  }, [isAdmin]);

  const updateOverrideField = (field, value) => {
    setOverrideForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const toggleMmfFileSelection = (key) => {
    setSelectedMmfFileKeys((currentKeys) =>
      currentKeys.includes(key)
        ? currentKeys.filter((currentKey) => currentKey !== key)
        : [...currentKeys, key],
    );
  };

  const handleStartMmfOAuth = async () => {
    try {
      setError("");
      setMessage("");

      const data = await startAdminMmfOAuth();
      const authorizationUrl =
        data.data?.authorizationUrl || data.authorizationUrl;

      if (!authorizationUrl) {
        throw new Error("MyMiniFactory authorization URL was not returned.");
      }

      window.location.href = authorizationUrl;
    } catch (err) {
      setError(err.message);
    }
  };

  const handleInspectFiles = async () => {
    try {
      setIsInspectingFiles(true);
      setError("");
      setMessage("");

      const data = await inspectAdminMmfFiles(objectId);
      const inspection = data.data?.inspection || data.inspection || null;

      setFileInspection(inspection);

      if (inspection?.preferredSelection) {
        const preferredKey = buildMmfSelectionKey(
          inspection.preferredSelection.selectedMmfFileId,
          inspection.preferredSelection.selectedArchiveEntryPath || "",
        );

        if (!cachedMmfFileKeys.has(preferredKey)) {
          setSelectedMmfFileKeys((currentKeys) =>
            currentKeys.length > 0 ? currentKeys : [preferredKey],
          );
        }

        setOverrideForm((currentForm) => ({
          ...currentForm,
          selectedMmfFileId:
            currentForm.selectedMmfFileId ||
            inspection.preferredSelection.selectedMmfFileId ||
            "",
          selectedArchiveEntryPath:
            currentForm.selectedArchiveEntryPath ||
            inspection.preferredSelection.selectedArchiveEntryPath ||
            "",
        }));
      }
    } catch (err) {
      setError(err.message);
      setFileInspection(null);
    } finally {
      setIsInspectingFiles(false);
    }
  };

  const handleRemovePrintReadyFile = async () => {
    if (!printReadyFile) {
      return;
    }

    const confirmed = window.confirm(
      "Remove the cached MMF printable file and disable Print Ready for this reference?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsRemovingPrintReadyFile(true);
      setError("");
      setMessage("");

      await removeAdminMmfPrintReadyFile(objectId);
      await loadDesign();
      setFileInspection(null);
      setMessage("Cached MMF printable file archived.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRemovingPrintReadyFile(false);
    }
  };

  const handleQuote = async (event, printReadyFileId = null) => {
    event?.preventDefault?.();
    const params = new URLSearchParams({
      source: "mmf",
      objectId: String(objectId),
    });

    if (printReadyFileId) {
      params.set("fileId", String(printReadyFileId));
    }

    navigate(`/quote?${params.toString()}`);
  };

  const handleSaveOverride = async (event) => {
    event.preventDefault();

    if (
      overrideForm.isPrintReady &&
      !design?.override?.isPrintReady &&
      !overrideForm.verificationConfirmed
    ) {
      setError(
        "Confirm local slicer verification before marking this MMF design Print Ready.",
      );
      return;
    }

    const payload = {
      mmfObjectId: Number(objectId),
      isPinned: overrideForm.isPinned,
      isHidden: overrideForm.isHidden,
      isPrintReady: overrideForm.isPrintReady,
      clientNote: overrideForm.clientNote,
      selectedMmfFiles:
        overrideForm.isPrintReady && selectedMmfFileKeys.length > 0
          ? selectedMmfFileKeys
              .filter((key) => !cachedMmfFileKeys.has(key))
              .map(parseMmfSelectionKey)
          : undefined,
      selectedMmfFileId: overrideForm.isPrintReady
        ? overrideForm.selectedMmfFileId || undefined
        : undefined,
      selectedArchiveEntryPath:
        overrideForm.isPrintReady && overrideForm.selectedArchiveEntryPath
          ? overrideForm.selectedArchiveEntryPath
          : undefined,
      verificationConfirmed:
        overrideForm.isPrintReady && !design?.override?.isPrintReady
          ? true
          : undefined,
      verificationNote:
        overrideForm.isPrintReady && !design?.override?.isPrintReady
          ? overrideForm.verificationNote
          : undefined,
    };

    try {
      setIsSavingOverride(true);
      setError("");
      setMessage("");

      if (design?.override?.id) {
        await updateAdminDesignOverride(design.override.id, payload);
      } else {
        await createAdminDesignOverride(payload);
      }

      await loadDesign();
      setMessage("MyMiniFactory admin override saved successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleShare = async () => {
    setShareMessage("");

    const shareUrl = `${window.location.origin}/designs/mmf/${objectId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: design?.name || design?.title || "MyMiniFactory design",
          url: shareUrl,
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Design link copied.");
        return;
      }

      setShareMessage(shareUrl);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Could not share this design right now.");
      }
    }
  };

  const tagsValue =
    design?.tags?.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {design.tags.slice(0, 12).map((tag) => (
          <StatusBadge key={typeof tag === "string" ? tag : tag.id || tag.name}>
            {typeof tag === "string" ? tag : tag.name || tag.slug}
          </StatusBadge>
        ))}
      </div>
    ) : (
      "No tags provided"
    );

  return (
    <PageShell size="xl">
      {isLoading && (
        <p className="text-sm text-slate-600">
          Loading MyMiniFactory design...
        </p>
      )}

      <Alert className="mb-6" type="error">
        {error}
      </Alert>

      <Alert className="mb-6" type="success">
        {message}
      </Alert>

      {!isLoading && !error && !design && (
        <EmptyState
          title="MyMiniFactory design not found."
          description="This catalog item may be unavailable or hidden from the design library."
          action={
            <ButtonLink to={returnTo} variant="secondary">
              Back to designs
            </ButtonLink>
          }
        />
      )}

      {design && (
        <ModelDetailShell backTo={returnTo}>
          <ModelDetailHero
            joined
            media={
              <MmfPreviewGallery
                items={
                  mmfGalleryItems.length > 0
                    ? mmfGalleryItems
                    : [
                        {
                          key: "legacy-preview",
                          type: "image",
                          url: previewImage || printReadySnapshotUrl,
                          label: "MMF preview image",
                        },
                      ].filter((item) => item.url)
                }
                title={design.name || design.title}
                activePreviewKey={activePreview}
                onChange={setActivePreview}
                onOpenModel={(item) => {
                  setPreviewPrintReadyFile({
                    ...(item.file || {}),
                    cachedFileUrl: item.fileUrl,
                    displayFileName: item.fileName,
                    extension: item.extension,
                    fileObjectId: item.fileObjectId || item.file?.fileObjectId || null,
                  });
                  setIsPreviewOpen(true);
                }}
              />
            }
            summary={
              <SummaryPanel
                eyebrow="External reference"
                title={design.name || design.title || "MyMiniFactory design"}
                embedded
                badges={
                  <>
                    <StatusBadge>MyMiniFactory</StatusBadge>
                    <StatusBadge tone={isPrintReady ? "success" : "warning"}>
                      {isPrintReady ? "Print Ready" : "Needs Review"}
                    </StatusBadge>
                    {printReadyFile && (
                      <StatusBadge tone="success">Cached File</StatusBadge>
                    )}
                    {design.override?.isHidden && (
                      <StatusBadge tone="neutral">Hidden</StatusBadge>
                    )}
                  </>
                }
              >
                <p className="text-sm leading-6 text-slate-600">
                  {designerName
                    ? `By ${designerName} on MyMiniFactory`
                    : "External MyMiniFactory catalog reference"}
                </p>

                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  <SummaryRow
                    label="Quote status"
                    value={canQuoteDirectly ? "Available" : "Blocked"}
                  />
                  <SummaryRow
                    label="Mapping"
                    value={formatStatus(design.override?.mappingStatus)}
                  />
                  <SummaryRow
                    label="License"
                    value={formatLicense(design)}
                  />
                </div>

                <div className="grid gap-2">
                  {design.url && (
                    <ExternalFileLink
                      href={design.url}
                      primary
                      className="w-full"
                    >
                      <ExternalLink
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      View on MyMiniFactory
                    </ExternalFileLink>
                  )}

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleShare}
                    className="w-full"
                  >
                    <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Share
                  </Button>

                  {shareMessage && (
                    <p className="rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                      {shareMessage}
                    </p>
                  )}
                </div>

                {!canQuoteDirectly && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="font-semibold text-amber-900">
                      FabLab Review Required
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      UniFab can quote this reference only after FabLab verifies
                      and caches a backend-managed printable file.
                    </p>
                  </div>
                )}
              </SummaryPanel>
            }
          />

          <DetailTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                id: "details",
                label: "Details",
                content: (
                  <>
                    <DetailSection title="Description">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {design.description ||
                          "No description was provided by the external source."}
                      </p>
                    </DetailSection>

                    <DetailSection title="Print Readiness">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            tone={canQuoteDirectly ? "success" : "warning"}
                          >
                            {canQuoteDirectly
                              ? "Instant Quote Available"
                              : "Quote Blocked"}
                          </StatusBadge>
                          <StatusBadge
                            tone={
                              design.override?.mappingStatus === "failed"
                                ? "danger"
                                : printReadyFile || linkedLocalDesignId
                                  ? "success"
                                  : "warning"
                            }
                          >
                            {formatStatus(design.override?.mappingStatus)}
                          </StatusBadge>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {canQuoteDirectly
                            ? "FabLab has reviewed this MMF reference and cached a backend-managed printable file for instant quote."
                            : isPrintReady
                              ? "This reference is marked Print Ready, but instant quote still requires a cached backend-managed printable file."
                              : "This reference requires FabLab review before UniFab can offer instant quote."}
                        </p>

                        {design.override?.mappingDiagnostics?.message && (
                          <p className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                            {design.override.mappingDiagnostics.message}
                          </p>
                        )}
                      </div>
                    </DetailSection>

                    <DetailSection title="Model Details">
                      <MetadataGrid
                        items={[
                          {
                            label: "Source",
                            value: "MyMiniFactory",
                          },
                          {
                            label: "Designer",
                            value: designerName || "-",
                          },
                          {
                            label: "License",
                            value: formatLicense(design),
                          },
                          {
                            label: "Dimensions",
                            value: formatDimensions(design.dimensions),
                          },
                          {
                            label: "Categories",
                            value: formatList(design.categories),
                          },
                          {
                            label: "Tags",
                            value: tagsValue,
                          },
                        ]}
                      />
                    </DetailSection>

                    {design.override?.clientNote && (
                      <DetailSection title="FabLab Note">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                          {design.override.clientNote}
                        </p>
                      </DetailSection>
                    )}
                  </>
                ),
              },
              {
                id: "files",
                label: "Files",
                meta: String(
                  printReadyFiles.length || (linkedLocalDesignId ? 1 : 0),
                ),
                content: (
                  <DetailSection
                    title="Model files"
                    description="MMF models remain external. UniFab shows the cached Print Ready artifact only when it is needed for preview, instant quote, and FabLab review."
                  >
                    <div className="space-y-6">
                      {printReadyFiles.length > 0 ? (
                        printReadyFiles.map((file) => {
                          const fileUrl = assetUrl(file.cachedFileUrl);
                          const fileName =
                            file.originalFileName ||
                            file.cachedFileUrl?.split("/").pop() ||
                            design?.name ||
                            "MMF printable file";
                          const fileCanQuote = Boolean(
                            isPrintReady && file.status === "cached",
                          );

                          return (
                            <MmfModelFileListRow
                              key={file.id || file.cachedFileUrl}
                              fileName={fileName}
                              modelSnapshotUrl={assetUrl(
                                file.modelSnapshotUrl,
                              )}
                              fileExtension={getFileExtension(fileName)}
                              canPreview={Boolean(fileUrl)}
                              canQuote={fileCanQuote}
                              isQuoteDisabled={!fileCanQuote}
                              sourceUrl={design.url}
                              onPreview={() => {
                                setPreviewPrintReadyFile({
                                  ...file,
                                  cachedFileUrl: file.cachedFileUrl,
                                  displayFileName: fileName,
                                  extension:
                                    file.extension ||
                                    getPathExtension(fileName) ||
                                    getPathExtension(file.cachedFileUrl),
                                });
                                setIsPreviewOpen(true);
                              }}
                              onQuote={(event) => handleQuote(event, file.id)}
                            />
                          );
                        })
                      ) : (
                        <>
                          <MmfFileRow
                            title="MyMiniFactory source"
                            description="Original external model page. Downloads and source details remain on MyMiniFactory."
                            status={<StatusBadge>External</StatusBadge>}
                            action={
                              design.url ? (
                                <ExternalFileLink
                                  href={design.url}
                                  className="w-full"
                                >
                                  <ExternalLink
                                    className="mr-2 h-4 w-4"
                                    aria-hidden="true"
                                  />
                                  View Source
                                </ExternalFileLink>
                              ) : null
                            }
                          />

                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge tone="warning">
                                No cached artifact
                              </StatusBadge>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-amber-800">
                              UniFab can show a 3D model snapshot and enable
                              instant quote after FabLab caches and verifies the
                              selected MMF file or ZIP entry.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </DetailSection>
                ),
              },
            ]}
          />

          {isAdmin && (
            <Panel className="mt-6 bg-white">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    MMF Admin Controls
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Manage curation, visibility, client note, and Print Ready
                    mapping for this MyMiniFactory reference.
                  </p>
                </div>

                <StatusBadge tone={design.override?.id ? "success" : "neutral"}>
                  {design.override?.id ? "Override saved" : "No override"}
                </StatusBadge>
              </div>

              <form onSubmit={handleSaveOverride} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={overrideForm.isPinned}
                      onChange={(event) =>
                        updateOverrideField("isPinned", event.target.checked)
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-950">
                        Pin
                      </span>
                      Prioritize this design in MMF results.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={overrideForm.isHidden}
                      onChange={(event) =>
                        updateOverrideField("isHidden", event.target.checked)
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-950">
                        Hide
                      </span>
                      Remove this design from client-facing results.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={overrideForm.isPrintReady}
                      onChange={(event) =>
                        updateOverrideField(
                          "isPrintReady",
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                      <span>
                        <span className="block font-semibold text-slate-950">
                          Print Ready
                        </span>
                      Enable direct quote through a verified cached file.
                      </span>
                  </label>
                </div>

                <Field label="Client note">
                  <TextArea
                    rows={4}
                    value={overrideForm.clientNote}
                    onChange={(event) =>
                      updateOverrideField("clientNote", event.target.value)
                    }
                    placeholder="Optional note shown to clients on this design."
                  />
                </Field>

                {overrideForm.isPrintReady && (
                  <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                    <div className="rounded-md border border-amber-200 bg-white p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            MyMiniFactory cached printable file
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            Inspect OAuth-visible MMF files, choose the exact
                            printable file or ZIP entry, then save the override
                            to cache a backend-managed artifact.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {printReadyFile && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={handleRemovePrintReadyFile}
                              disabled={isRemovingPrintReadyFile}
                            >
                              {isRemovingPrintReadyFile
                                ? "Archiving..."
                                : "Archive cached file"}
                            </Button>
                          )}

                          {!mmfOAuthStatus?.connected && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={handleStartMmfOAuth}
                            >
                              Connect MMF
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleInspectFiles}
                            disabled={
                              isInspectingFiles || !mmfOAuthStatus?.connected
                            }
                          >
                            {isInspectingFiles
                              ? "Inspecting..."
                              : "Inspect MMF files"}
                          </Button>
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-slate-500">
                        {mmfOAuthStatus?.connected
                          ? "MMF service account is connected."
                          : "Connect the lab-owned MMF account before API file caching."}
                      </p>

                      {inspectedFiles.length > 0 && (
                        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Select printable files to cache
                            </p>
                          </div>

                          <div className="divide-y divide-slate-200">
                            {mmfCandidateRows.length > 0 ? (
                              mmfCandidateRows.map((row) => {
                                const isCached = cachedMmfFileKeys.has(row.key);
                                const isSelected =
                                  isCached || selectedMmfFileKeySet.has(row.key);

                                return (
                                  <label
                                    key={row.key}
                                    className={`flex items-start gap-3 px-3 py-3 text-sm ${
                                      isCached
                                        ? "bg-emerald-50 text-emerald-950"
                                        : "bg-white text-slate-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="mt-1 h-4 w-4 rounded border-slate-300"
                                      checked={isSelected}
                                      disabled={isCached || !row.supported}
                                      onChange={() =>
                                        toggleMmfFileSelection(row.key)
                                      }
                                    />

                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-semibold text-slate-950">
                                        {row.name}
                                      </span>
                                      <span className="mt-1 block text-xs text-slate-500">
                                        {row.type === "zip-entry"
                                          ? `ZIP entry from ${row.parentName}`
                                          : "Direct printable file"}{" "}
                                        / {String(row.extension || "").toUpperCase()} /{" "}
                                        {formatFileSize(row.size)}
                                      </span>
                                    </span>

                                    {isCached ? (
                                      <StatusBadge tone="success">
                                        Already cached
                                      </StatusBadge>
                                    ) : (
                                      <StatusBadge tone="neutral">
                                        Available
                                      </StatusBadge>
                                    )}
                                  </label>
                                );
                              })
                            ) : (
                              <div className="px-3 py-4 text-sm text-slate-500">
                                No supported STL, OBJ, or 3MF files were found
                                for caching.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <label className="flex items-start gap-3 text-sm leading-6 text-amber-900">
                      <input
                        type="checkbox"
                        checked={
                          design.override?.isPrintReady ||
                          overrideForm.verificationConfirmed
                        }
                        disabled={design.override?.isPrintReady}
                        onChange={(event) =>
                          updateOverrideField(
                            "verificationConfirmed",
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-amber-300"
                      />
                      <span>
                        I verified the source file locally in the slicer,
                        confirmed supported file type, orientation/scale, and
                        safe content. UniFab may map the selected STL, OBJ, 3MF,
                        or selected ZIP entry as a cached MMF Print Ready
                        artifact through the backend MMF API.
                      </span>
                    </label>

                    {!design.override?.isPrintReady && (
                      <Field label="Verification note">
                        <TextArea
                          rows={3}
                          value={overrideForm.verificationNote}
                          onChange={(event) =>
                            updateOverrideField(
                              "verificationNote",
                              event.target.value,
                            )
                          }
                          placeholder="Optional internal note about source file, scale, or local slicer check."
                        />
                      </Field>
                    )}
                  </div>
                )}

                <Button type="submit" disabled={isSavingOverride}>
                  {isSavingOverride ? "Saving..." : "Save MMF Override"}
                </Button>
              </form>
            </Panel>
          )}

          <ModelPreviewModal
            isOpen={
              isPreviewOpen &&
              Boolean(previewPrintReadyFile || printReadyFile)
            }
            onClose={() => setIsPreviewOpen(false)}
          >
            {(() => {
              const descriptor = normalizeModelPreview({
                modelUrl:
                  previewPrintReadyFile?.cachedFileUrl ||
                  printReadyFile?.cachedFileUrl,
                fileName:
                  previewPrintReadyFile?.displayFileName ||
                  printReadyFileName ||
                  printReadyFile?.cachedFileUrl,
                extension:
                  previewPrintReadyFile?.extension ||
                  printReadyFile?.extension ||
                  getPathExtension(previewPrintReadyFile?.displayFileName) ||
                  getPathExtension(printReadyFileName) ||
                  getPathExtension(printReadyFile?.cachedFileUrl),
                fileObjectId:
                  previewPrintReadyFile?.fileObjectId ||
                  printReadyFile?.fileObjectId ||
                  null,
              });

              return (
                descriptor.canPreview ? (
                  <ModelViewer
                    url={descriptor.modelUrl}
                    fileName={descriptor.fileName}
                    extension={descriptor.extension}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    {descriptor.errorReason}
                  </div>
                )
              );
            })()}
          </ModelPreviewModal>
        </ModelDetailShell>
      )}
    </PageShell>
  );
}
