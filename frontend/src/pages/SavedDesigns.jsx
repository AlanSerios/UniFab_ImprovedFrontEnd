import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import {
  getMmfDesignByObjectId,
  getSavedDesigns,
  unsaveDesign,
} from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const SAVED_MMF_STORAGE_KEY = "unifab.savedMmfDesignIds";

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

function sourceLabel(sourceKind) {
  return sourceKind === "community" ? "Community" : "Official Lab";
}

function getStoredSavedMmfDesignIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(SAVED_MMF_STORAGE_KEY) || "[]",
    );

    return Array.isArray(storedIds)
      ? storedIds.map(Number).filter(Number.isFinite)
      : [];
  } catch {
    return [];
  }
}

function setStoredSavedMmfDesignIds(ids) {
  window.localStorage.setItem(
    SAVED_MMF_STORAGE_KEY,
    JSON.stringify([...new Set(ids.map(Number).filter(Number.isFinite))]),
  );
}

function getMmfThumbnailUrl(item) {
  const primaryImage = item.images?.find((image) => image.isPrimary);
  const fallbackImage = item.images?.[0];

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

export default function SavedDesigns() {
  const [designs, setDesigns] = useState([]);
  const [mmfDesigns, setMmfDesigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSavedDesigns() {
      try {
        setIsLoading(true);
        setError("");

        const savedMmfIds = getStoredSavedMmfDesignIds();
        const [data, mmfResults] = await Promise.all([
          getSavedDesigns(),
          Promise.allSettled(
            savedMmfIds.map((objectId) => getMmfDesignByObjectId(objectId)),
          ),
        ]);
        const payload = data.data || data;
        const mmfObjects = mmfResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => {
            const resultPayload = result.value.data || result.value;
            return resultPayload.mmfObject || resultPayload;
          })
          .filter((item) => item?.id);

        if (isMounted) {
          setDesigns(payload.savedDesigns || []);
          setMmfDesigns(mmfObjects);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setDesigns([]);
          setMmfDesigns([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSavedDesigns();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUnsave = async (designId) => {
    const previousDesigns = designs;
    setDesigns((currentDesigns) =>
      currentDesigns.filter((design) => Number(design.id) !== Number(designId)),
    );

    try {
      await unsaveDesign(designId);
    } catch (err) {
      setError(err.message);
      setDesigns(previousDesigns);
    }
  };

  const handleRemoveMmf = (objectId) => {
    const normalizedId = Number(objectId);
    const nextIds = getStoredSavedMmfDesignIds().filter(
      (savedId) => Number(savedId) !== normalizedId,
    );

    setStoredSavedMmfDesignIds(nextIds);
    setMmfDesigns((currentDesigns) =>
      currentDesigns.filter((design) => Number(design.id) !== normalizedId),
    );
  };

  const hasSavedDesigns = designs.length > 0 || mmfDesigns.length > 0;

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Saved Designs"
          description="Private bookmarks for UniFab-hosted designs you may want to download or request later."
          action={<ButtonLink to="/designs">Browse Designs</ButtonLink>}
        />

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading saved designs...</p>
        )}

        {!isLoading && !error && !hasSavedDesigns && (
          <EmptyState
            className="mt-6"
            title="No saved designs yet."
            description="Save designs from the library to keep a private shortlist."
            action={<ButtonLink to="/designs">Browse Designs</ButtonLink>}
          />
        )}

        {hasSavedDesigns && (
          <div className="mt-6 space-y-10">
            {designs.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-slate-950">
                  UniFab Designs
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Saved UniFab-hosted files from the Design Library.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {designs.map((design) => (
                    <article
                      key={design.id}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                    >
                      <Link to={`/designs/local/${design.id}`}>
                        <div className="h-44 bg-slate-100">
                          {design.thumbnailUrl ? (
                            <img
                              src={assetUrl(design.thumbnailUrl)}
                              alt={design.title || "Design thumbnail"}
                              className="h-full w-full object-contain p-2"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-500">
                              No thumbnail
                            </div>
                          )}
                        </div>
                      </Link>

                      <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge>
                            {sourceLabel(design.sourceKind)}
                          </StatusBadge>
                          <StatusBadge
                            tone={design.isPrintReady ? "success" : "warning"}
                          >
                            {design.isPrintReady ? "Print Ready" : "Review Only"}
                          </StatusBadge>
                        </div>

                        <h2 className="mt-3 line-clamp-2 font-semibold text-slate-950">
                          {design.title || "Untitled design"}
                        </h2>

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                          {design.description || "No description provided."}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <ButtonLink
                            to={`/designs/local/${design.id}`}
                            variant="secondary"
                          >
                            View Details
                          </ButtonLink>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleUnsave(design.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {mmfDesigns.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold text-slate-950">
                  MyMiniFactory Bookmarks
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Browser-local external references saved from the Design
                  Library.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mmfDesigns.map((design) => {
                    const title =
                      design.name || design.title || `Object ${design.id}`;
                    const thumbnailUrl = getMmfThumbnailUrl(design);

                    return (
                      <article
                        key={`mmf-${design.id}`}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                      >
                        <Link to={`/designs/mmf/${design.id}`}>
                          <div className="h-44 bg-slate-100">
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt={title}
                                className="h-full w-full object-contain p-2"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                No thumbnail
                              </div>
                            )}
                          </div>
                        </Link>

                        <div className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge>MyMiniFactory</StatusBadge>
                            <StatusBadge
                              tone={
                                design.override?.isPrintReady
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {design.override?.isPrintReady
                                ? "Print Ready"
                                : "Needs Review"}
                            </StatusBadge>
                          </div>

                          <h2 className="mt-3 line-clamp-2 font-semibold text-slate-950">
                            {title}
                          </h2>

                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                            {design.description || "No description provided."}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <ButtonLink
                              to={`/designs/mmf/${design.id}`}
                              variant="secondary"
                            >
                              View Details
                            </ButtonLink>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleRemoveMmf(design.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
