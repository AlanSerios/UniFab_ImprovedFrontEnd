import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getLocalDesignById,
  getSavedDesigns,
  saveDesign,
  unsaveDesign,
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
import { ModelViewer } from "../components/ui/ModelViewer";
import { ModelPreviewModal } from "../components/ui/ModelPreviewModal";
import { PageShell } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import {
  assetUrl,
  buildDesignGalleryItems,
  downloadUrl,
  formatSourceKind,
  getDesignFilesWithLegacyFallback,
  getDesignImagesWithLegacyFallback,
  getFileExtension,
  getFileLabel,
  getSafeReturnTo,
} from "../utils/local-design-detail";
import { normalizeModelPreview } from "../utils/model-preview";

function ExternalFileLink({ href, children, primary = false, className = "" }) {
  const base =
    "unifab-design-detail__action-link inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition";
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
    <div className="unifab-design-detail__summary-row flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-44 text-right font-semibold text-slate-950">
        {value}
      </span>
    </div>
  );
}

function ModelFileListRow({
  fileName,
  fileUrl,
  modelSnapshotUrl,
  fileExtension,
  canPreview,
  canQuote,
  isQuoteDisabled,
  onQuote,
  onPreview,
}) {
  return (
    <div className="unifab-design-detail__file-row grid gap-5 border-t border-slate-200 py-6 lg:grid-cols-[112px_minmax(0,1fr)_190px] lg:items-center">
      <button
        type="button"
        onClick={onPreview}
        disabled={!canPreview}
        className="unifab-design-detail__file-thumb group h-24 w-24 rounded-md border border-slate-200 bg-slate-100 p-2 transition disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:border-slate-400 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-slate-500"
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
        <div className="unifab-design-detail__file-meta flex flex-wrap items-center gap-2">
          <p className="break-all text-sm font-semibold text-slate-950">
            {fileName}
          </p>
          <StatusBadge>{fileExtension}</StatusBadge>
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Backend-hosted UniFab model file. Click the snapshot to inspect the
          model in the 3D viewer before downloading or quoting.
        </p>
        {!canQuote && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Instant quote unlocks after FabLab marks this exact file Print
            Ready.
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

        {fileUrl && (
          <ExternalFileLink href={downloadUrl(fileUrl)} className="w-full">
            Download
          </ExternalFileLink>
        )}
      </div>
    </div>
  );
}

function DesignPreviewGallery({
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
    currentItem?.type === "model" ? "3D model snapshot" : "Design thumbnail";

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
    <section className="unifab-design-detail__gallery h-full bg-white">
      <div className="unifab-design-detail__gallery-stage relative bg-slate-100">
        <button
          type="button"
          onClick={
            currentItem?.type === "model" ? () => onOpenModel(currentItem) : undefined
          }
          disabled={currentItem?.type !== "model"}
          className={`unifab-design-detail__gallery-main group flex aspect-[4/3] min-h-80 w-full items-center justify-center ${
            currentItem?.type === "model"
              ? "cursor-zoom-in"
              : "cursor-default"
          }`}
          aria-label={
            currentItem?.type === "model"
              ? "Open 3D model preview"
              : "Design thumbnail"
          }
        >
          {currentItem?.url ? (
            <img
              src={currentItem.url}
              alt={title || mainLabel}
              className="unifab-design-detail__gallery-image h-full w-full object-contain"
            />
          ) : (
            <div className="unifab-design-detail__gallery-empty flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500">
              <Box className="h-12 w-12 text-slate-400" aria-hidden="true" />
              3D model preview
            </div>
          )}

          {currentItem?.type === "model" && (
            <span className="unifab-design-detail__preview-hint absolute bottom-4 right-4 rounded-md bg-slate-950/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Open 3D preview
            </span>
          )}
        </button>

        {canSlide && (
          <>
            <button
              type="button"
              onClick={showPrevious}
              className="unifab-design-detail__gallery-nav absolute left-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label="Previous preview"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="unifab-design-detail__gallery-nav absolute right-4 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              aria-label="Next preview"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="unifab-design-detail__thumb-strip border-t border-slate-200 bg-white p-3">
        <div className="flex gap-2 overflow-x-auto">
          {previewItems.length > 0 ? (
            previewItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={`unifab-design-detail__thumb-button shrink-0 rounded-md border p-1 transition ${
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

export default function LocalDesignDetail() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const returnTo = getSafeReturnTo(searchParams);

  const [design, setDesign] = useState(null);
  const [viewerPermissions, setViewerPermissions] = useState({
    canEdit: false,
    isOwner: false,
  });
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activePreview, setActivePreview] = useState("thumbnail");
  const [previewFile, setPreviewFile] = useState(null);
  const [shareMessage, setShareMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDesign() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getLocalDesignById(designId);
        const payload = data.data || data;
        const localDesign = payload.localDesign || data.localDesign || data;

        setDesign(localDesign);
        setViewerPermissions(
          payload.viewerPermissions || {
            canEdit: false,
            isOwner: false,
          },
        );

      } catch (err) {
        setError(err.message);
        setDesign(null);
        setViewerPermissions({ canEdit: false, isOwner: false });
      } finally {
        setIsLoading(false);
      }
    }

    loadDesign();
  }, [designId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isMounted = true;

    async function loadSavedState() {
      try {
        const data = await getSavedDesigns();
        const payload = data.data || data;
        const ids =
          payload.savedDesignIds ||
          (payload.savedDesigns || []).map((item) => item.id);

        if (isMounted) {
          setIsSaved(ids.map(Number).includes(Number(designId)));
        }
      } catch {
        if (isMounted) {
          setIsSaved(false);
        }
      }
    }

    loadSavedState();

    return () => {
      isMounted = false;
    };
  }, [designId, isAuthenticated]);

  const handleQuote = async (event, designFileId = null) => {
    event?.preventDefault?.();
    const params = new URLSearchParams({
      source: "local",
      designId: String(designId),
    });

    if (designFileId) {
      params.set("fileId", String(designFileId));
    }

    navigate(`/quote?${params.toString()}`);
  };

  const handleShare = async () => {
    setShareMessage("");

    const shareUrl = `${window.location.origin}/designs/local/${designId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: design?.title || "UniFab design",
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

  const handleToggleSaved = async () => {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: `/designs/local/${designId}` } });
      return;
    }

    const nextSaved = !isSaved;
    setIsSaved(nextSaved);

    try {
      if (nextSaved) {
        await saveDesign(designId);
      } else {
        await unsaveDesign(designId);
      }
    } catch (err) {
      setIsSaved(!nextSaved);
      setError(err.message);
    }
  };

  const designFiles = getDesignFilesWithLegacyFallback(design);
  const primaryDesignFile =
    designFiles.find((file) => file.isPrimary) || designFiles[0] || null;
  const canQuote = Boolean(design?.isActive && design?.isPrintReady);
  const designFileUrl = assetUrl(primaryDesignFile?.fileUrl || design?.fileUrl);
  const designFileName =
    primaryDesignFile?.originalFileName ||
    primaryDesignFile?.fileUrl?.split("/").pop() ||
    getFileLabel(design);
  const designFileExtension =
    primaryDesignFile?.extension ||
    getFileExtension(primaryDesignFile?.originalFileName) ||
    getFileExtension(primaryDesignFile?.fileUrl || design?.fileUrl);
  const designThumbnailUrl = assetUrl(design?.thumbnailUrl);
  const designModelSnapshotUrl = assetUrl(
    primaryDesignFile?.modelSnapshotUrl || design?.modelSnapshotUrl,
  );
  const designImages = getDesignImagesWithLegacyFallback({
    design,
    thumbnailUrl: designThumbnailUrl,
  });
  const galleryItems = buildDesignGalleryItems({ designImages, designFiles });
  const tagsValue =
    design?.tags?.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {design.tags.map((tag) => (
          <StatusBadge key={tag.id || tag.name}>{tag.name}</StatusBadge>
        ))}
      </div>
    ) : (
      "No tags provided"
    );

  return (
    <PageShell size="xl">
      <div className="unifab-design-detail unifab-design-detail--local">
      {isLoading && (
        <p className="text-sm text-slate-600">Loading UniFab design...</p>
      )}

      <Alert className="mb-6" type="error">
        {error}
      </Alert>

      {!isLoading && !error && !design && (
        <EmptyState
          title="UniFab design not found."
          description="The design may be unavailable or has been removed from the library."
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
              <DesignPreviewGallery
                items={
                  galleryItems.length > 0
                    ? galleryItems
                    : [
                        {
                          key: "legacy-empty",
                          type: "image",
                          url: designThumbnailUrl || designModelSnapshotUrl,
                          label: "Design preview",
                        },
                      ].filter((item) => item.url)
                }
                title={design.title}
                activePreviewKey={activePreview}
                onChange={setActivePreview}
                onOpenModel={(item) => {
                  setPreviewFile({
                    url: item.fileUrl || primaryDesignFile?.fileUrl || design?.fileUrl,
                    fileName: item.fileName || designFileName,
                    extension: item.extension || designFileExtension,
                    fileObjectId:
                      item.fileObjectId ||
                      primaryDesignFile?.fileObjectId ||
                      design?.fileObjectId ||
                      null,
                  });
                  setIsPreviewOpen(true);
                }}
              />
            }
            summary={
              <SummaryPanel
                eyebrow="UniFab-hosted model"
                title={design.title || "Untitled design"}
                embedded
                badges={
                  <>
                    <StatusBadge>{formatSourceKind(design.sourceKind)}</StatusBadge>
                    {design.isFeatured && (
                      <StatusBadge tone="success">Featured</StatusBadge>
                    )}
                    <StatusBadge tone={canQuote ? "success" : "warning"}>
                      {canQuote ? "Print Ready" : "Needs FabLab Verification"}
                    </StatusBadge>
                  </>
                }
              >
                <p className="text-sm leading-6 text-slate-600">
                  {design.sourceKind === "community"
                    ? `Uploaded by user #${design.uploadedBy || "-"}`
                    : "Official USTP-CDO FabLab catalog model"}
                </p>

                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  <SummaryRow
                    label="Availability"
                    value={design.isActive ? "Available" : "Unavailable"}
                  />
                  <SummaryRow
                    label="License"
                    value={design.licenseType || "-"}
                  />
                  <SummaryRow
                    label="File"
                    value={design.fileUrl ? designFileName : "Missing"}
                  />
                </div>

                <div className="grid gap-2">
                  {canQuote ? (
                    <Button
                      type="button"
                      onClick={(event) =>
                        handleQuote(event, primaryDesignFile?.id || null)
                      }
                    >
                      Instant Quote
                    </Button>
                  ) : null}

                  {design.fileUrl && (
                    <ExternalFileLink
                      href={downloadUrl(designFileUrl)}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download File
                    </ExternalFileLink>
                  )}

                  {viewerPermissions.canEdit && (
                    <ButtonLink
                      to={`/my-designs/${design.id}`}
                      variant="secondary"
                      className="w-full"
                    >
                      Edit
                    </ButtonLink>
                  )}

                  <div
                    className={
                      viewerPermissions.canEdit
                        ? "grid gap-2"
                        : "grid grid-cols-[auto_minmax(0,1fr)] gap-2"
                    }
                  >
                    {!viewerPermissions.canEdit && (
                      <button
                        type="button"
                        onClick={handleToggleSaved}
                        aria-label={
                          isAuthenticated && isSaved
                            ? "Remove from saved designs"
                            : "Save design"
                        }
                        title={
                          isAuthenticated && isSaved
                            ? "Remove from saved designs"
                            : "Save design"
                        }
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                      >
                        {isAuthenticated && isSaved ? (
                          <BookmarkCheck
                            className="h-5 w-5"
                            aria-hidden="true"
                          />
                        ) : (
                          <Bookmark className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
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
                  </div>

                  {shareMessage && (
                    <p className="rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                      {shareMessage}
                    </p>
                  )}
                </div>

                {!canQuote && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="font-semibold text-amber-900">
                      Requires FabLab Verification
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-800">
                      This public model can be reviewed and downloaded, but
                      instant quote stays locked until FabLab verifies the exact
                      hosted file in the slicer.
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
                      {design.libraryNote && (
                        <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                          {design.libraryNote}
                        </div>
                      )}

                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {design.description ||
                          "No description has been provided for this design yet."}
                      </p>
                    </DetailSection>

                    <DetailSection title="Print Readiness">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={canQuote ? "success" : "warning"}>
                            {canQuote
                              ? "Instant Quote Available"
                              : "Requires FabLab Verification"}
                          </StatusBadge>
                          {!design.isActive && (
                            <StatusBadge tone="neutral">
                              Unavailable
                            </StatusBadge>
                          )}
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {canQuote
                            ? "FabLab has verified this file for instant quoting using the current backend-managed print workflow."
                            : "Content approval only makes the model visible. Instant quote requires a separate FabLab Print Ready verification for this exact file."}
                        </p>
                      </div>
                    </DetailSection>

                    <DetailSection title="Model Details">
                      <MetadataGrid
                        items={[
                          {
                            label: "Source",
                            value: formatSourceKind(design.sourceKind),
                          },
                          {
                            label: "Category",
                            value: design.category?.name || "-",
                          },
                          {
                            label: "License",
                            value: design.licenseType || "-",
                          },
                          {
                            label: "Attribution",
                            value:
                              design.sourceKind === "community"
                                ? `User #${design.uploadedBy || "-"}`
                                : "USTP-CDO FabLab",
                          },
                          {
                            label: "Tags",
                            value: tagsValue,
                          },
                        ]}
                      />
                    </DetailSection>
                  </>
                ),
              },
              {
                id: "files",
                label: "Files",
                meta: String(designFiles.length),
                content: (
                  <DetailSection
                    title="Model files"
                    description="UniFab exposes the current hosted model file for download, preview, and Print Ready quoting."
                  >
                    <div className="space-y-6">
                      {designFiles.length > 0 ? (
                        designFiles.map((designFile) => {
                          const rowFileUrl = assetUrl(designFile.fileUrl);
                          const rowFileName =
                            designFile.originalFileName ||
                            designFile.fileUrl?.split("/").pop() ||
                            "Design file";
                          const rowCanQuote = Boolean(
                            design.isActive && designFile.isPrintReady,
                          );

                          return (
                            <ModelFileListRow
                              key={designFile.id || designFile.fileUrl}
                              fileName={rowFileName}
                              fileUrl={rowFileUrl}
                              modelSnapshotUrl={assetUrl(
                                designFile.modelSnapshotUrl,
                              )}
                              fileExtension={getFileExtension(rowFileName)}
                              canPreview={Boolean(designFile.fileUrl)}
                              canQuote={rowCanQuote}
                              isQuoteDisabled={!rowCanQuote}
                              onQuote={(event) =>
                                handleQuote(event, designFile.id || null)
                              }
                              onPreview={() => {
                                setPreviewFile({
                                  url: designFile.fileUrl,
                                  fileName: rowFileName,
                                  extension:
                                    designFile.extension ||
                                    getFileExtension(rowFileName) ||
                                    getFileExtension(designFile.fileUrl),
                                  fileObjectId: designFile.fileObjectId || null,
                                });
                                setIsPreviewOpen(true);
                              }}
                            />
                          );
                        })
                      ) : (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone="warning">
                              Missing file
                            </StatusBadge>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-amber-800">
                            No hosted model file is available for this design,
                            so preview, download, and instant quote actions are
                            disabled.
                          </p>
                        </div>
                      )}
                    </div>
                  </DetailSection>
                ),
              },
            ]}
          />

          <ModelPreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
          >
            {(() => {
              const descriptor = normalizeModelPreview({
                modelUrl: previewFile?.url || primaryDesignFile?.fileUrl || design?.fileUrl,
                fileName: previewFile?.fileName || designFileName || design.fileUrl,
                extension: previewFile?.extension || designFileExtension,
                fileObjectId:
                  previewFile?.fileObjectId ||
                  primaryDesignFile?.fileObjectId ||
                  design?.fileObjectId ||
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
      </div>
    </PageShell>
  );
}
