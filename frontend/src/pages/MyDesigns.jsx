import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyDesigns, publishMyDesign } from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import {
  getModerationStatusLabel,
  getModerationStatusTone,
} from "../utils/moderation-display";
import {
  DESIGN_FILTERS,
  canPublishDesign,
  extractMyDesigns,
  getDesignDetailPath,
  getDesignEditPath,
  getDesignSummary,
  getDesignThumbnailUrl,
  getDesignTitle,
  getDesignUpdatedDate,
  matchesDesignFilter,
} from "../utils/my-designs";

export default function MyDesigns() {
  const [designs, setDesigns] = useState([]);
  const [activeFilter, setActiveFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [publishingId, setPublishingId] = useState(null);
  const [error, setError] = useState("");

  const loadDesigns = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const data = await getMyDesigns();

      setDesigns(extractMyDesigns(data));
    } catch (err) {
      setError(err.message);
      setDesigns([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialDesigns() {
      try {
        const data = await getMyDesigns();

        if (isMounted) {
          setDesigns(extractMyDesigns(data));
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setDesigns([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialDesigns();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleDesigns = useMemo(
    () => designs.filter((design) => matchesDesignFilter(design, activeFilter)),
    [designs, activeFilter],
  );

  const handlePublish = async (designId) => {
    try {
      setPublishingId(designId);
      setError("");

      await publishMyDesign(designId);
      await loadDesigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <PageShell size="xl">
      <Panel className="unifab-design-workspace unifab-design-workspace--mine">
        <PageHeader
          title="My Designs"
          description="Manage drafts, review status, feedback, and published community designs."
          action={<ButtonLink to="/my-designs/new">New Design</ButtonLink>}
        />

        <div className="unifab-design-workspace__filters mt-6 flex flex-wrap gap-2">
          {DESIGN_FILTERS.map((filter) => (
            <Button
              key={filter.value || "all"}
              type="button"
              variant={activeFilter === filter.value ? "primary" : "secondary"}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading your designs...</p>
        )}

        {!isLoading && !error && visibleDesigns.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No designs found."
            description="Saved drafts and submitted designs will appear here."
          />
        )}

        {visibleDesigns.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDesigns.map((design) => (
              <article
                key={design.id}
                className="unifab-design-card unifab-design-workspace__card group"
              >
                <Link
                  to={getDesignDetailPath(design)}
                  className="unifab-design-card__link"
                >
                  <div className="unifab-design-card__media unifab-design-workspace__thumb">
                    {design.thumbnailUrl ? (
                      <img
                        src={getDesignThumbnailUrl(design)}
                        alt={getDesignTitle(design)}
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
                      <StatusBadge>Community</StatusBadge>
                      <StatusBadge
                        tone={getModerationStatusTone(
                          design.moderationStatus,
                        )}
                      >
                        {getModerationStatusLabel(design.moderationStatus)}
                      </StatusBadge>
                    </div>

                    <h2 className="unifab-design-card__title line-clamp-2">
                      {getDesignTitle(design)}
                    </h2>

                    <p className="unifab-design-card__date">
                      Updated {getDesignUpdatedDate(design)}
                    </p>

                    <p className="unifab-design-card__description line-clamp-2">
                      {getDesignSummary(design)}
                    </p>
                  </div>
                </Link>

                <div className="unifab-design-card__footer">
                  <ButtonLink
                    to={getDesignDetailPath(design)}
                    variant="secondary"
                    className="w-full"
                  >
                    View Details
                  </ButtonLink>

                  <div className="unifab-design-card__split-actions">
                    <ButtonLink
                      to={getDesignEditPath(design)}
                      variant="secondary"
                      className="w-full"
                    >
                      Edit
                    </ButtonLink>

                    {canPublishDesign(design) ? (
                      <Button
                        type="button"
                        onClick={() => handlePublish(design.id)}
                        disabled={publishingId === design.id}
                        className="w-full"
                      >
                        {publishingId === design.id
                          ? "Publishing..."
                          : "Publish"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled
                        className="w-full"
                      >
                        No publish action
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
