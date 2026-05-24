import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMmfDesignByObjectId,
  getSavedDesigns,
  unsaveDesign,
} from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import {
  extractMmfObject,
  extractSavedDesigns,
  getDesignDescription,
  getLocalDesignPath,
  getLocalDesignThumbnailUrl,
  getLocalDesignTitle,
  getLocalPrintReadyLabel,
  getMmfDesignPath,
  getMmfDesignTitle,
  getMmfPrintReadyLabel,
  getMmfSavedThumbnailUrl,
  getPrintReadyTone,
  getStoredSavedMmfDesignIdList,
  removeStoredSavedMmfDesignId,
  sourceLabel,
} from "../utils/saved-designs";

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

        const savedMmfIds = getStoredSavedMmfDesignIdList();
        const [data, mmfResults] = await Promise.all([
          getSavedDesigns(),
          Promise.allSettled(
            savedMmfIds.map((objectId) => getMmfDesignByObjectId(objectId)),
          ),
        ]);
        const mmfObjects = mmfResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => extractMmfObject(result.value))
          .filter((item) => item?.id);

        if (isMounted) {
          setDesigns(extractSavedDesigns(data));
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
    const normalizedId = removeStoredSavedMmfDesignId(objectId);

    setMmfDesigns((currentDesigns) =>
      currentDesigns.filter((design) => Number(design.id) !== normalizedId),
    );
  };

  const hasSavedDesigns = designs.length > 0 || mmfDesigns.length > 0;

  return (
    <PageShell size="xl">
      <Panel className="unifab-design-workspace unifab-design-workspace--saved">
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
          <div className="unifab-design-workspace__sections mt-6 space-y-10">
            {designs.length > 0 && (
              <section className="unifab-design-workspace__section">
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
                      className="unifab-design-card unifab-design-workspace__card group"
                    >
                      <Link
                        to={getLocalDesignPath(design)}
                        className="unifab-design-card__link"
                      >
                        <div className="unifab-design-card__media unifab-design-workspace__thumb">
                          {design.thumbnailUrl ? (
                            <img
                              src={getLocalDesignThumbnailUrl(design)}
                              alt={getLocalDesignTitle(design)}
                              className="transition duration-300 group-hover:scale-[1.025]"
                            />
                          ) : (
                            <div className="unifab-design-card__empty-thumb">
                              No thumbnail
                            </div>
                          )}
                        </div>

                        <div className="unifab-design-card__body">
                          <div className="unifab-design-card__meta">
                          <StatusBadge>
                            {sourceLabel(design.sourceKind)}
                          </StatusBadge>
                          <StatusBadge
                            tone={getPrintReadyTone(design.isPrintReady)}
                          >
                            {getLocalPrintReadyLabel(design)}
                          </StatusBadge>
                        </div>

                          <h2 className="unifab-design-card__title line-clamp-2">
                          {getLocalDesignTitle(design)}
                        </h2>

                          <p className="unifab-design-card__description line-clamp-2">
                          {getDesignDescription(design)}
                        </p>
                        </div>
                      </Link>

                      <div className="unifab-design-card__footer">
                        <div className="unifab-design-card__split-actions">
                          <ButtonLink
                            to={getLocalDesignPath(design)}
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
              <section className="unifab-design-workspace__section">
                <h2 className="text-xl font-semibold text-slate-950">
                  MyMiniFactory Bookmarks
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Browser-local external references saved from the Design
                  Library.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {mmfDesigns.map((design) => {
                    const title = getMmfDesignTitle(design);
                    const thumbnailUrl = getMmfSavedThumbnailUrl(design);

                    return (
                      <article
                        key={`mmf-${design.id}`}
                        className="unifab-design-card unifab-design-workspace__card group"
                      >
                        <Link
                          to={getMmfDesignPath(design)}
                          className="unifab-design-card__link"
                        >
                          <div className="unifab-design-card__media unifab-design-workspace__thumb">
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt={title}
                                className="transition duration-300 group-hover:scale-[1.025]"
                              />
                            ) : (
                              <div className="unifab-design-card__empty-thumb">
                                No thumbnail
                              </div>
                            )}
                          </div>

                          <div className="unifab-design-card__body">
                            <div className="unifab-design-card__meta">
                            <StatusBadge>MyMiniFactory</StatusBadge>
                            <StatusBadge
                              tone={
                                getPrintReadyTone(design.override?.isPrintReady)
                              }
                            >
                              {getMmfPrintReadyLabel(design)}
                            </StatusBadge>
                          </div>

                            <h2 className="unifab-design-card__title line-clamp-2">
                            {title}
                          </h2>

                            <p className="unifab-design-card__description line-clamp-2">
                            {getDesignDescription(design)}
                          </p>
                          </div>
                        </Link>

                        <div className="unifab-design-card__footer">
                          <div className="unifab-design-card__split-actions">
                            <ButtonLink
                              to={getMmfDesignPath(design)}
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
