import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import { getMyDesigns, publishMyDesign } from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import {
  getModerationStatusLabel,
  getModerationStatusTone,
  getOwnerModerationMessage,
} from "../utils/moderation-display";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Drafts", value: "draft" },
  { label: "Needs Review", value: "needs_admin_review" },
  { label: "Rejected", value: "rejected" },
  { label: "Approved", value: "approved" },
  { label: "Hidden", value: "hidden" },
];

const REJECTED_STATUSES = new Set(["auto_rejected", "admin_rejected"]);
const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);
const PUBLISHABLE_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
]);
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

function matchesFilter(design, filter) {
  if (!filter) return true;
  if (filter === "rejected")
    return REJECTED_STATUSES.has(design.moderationStatus);
  if (filter === "approved")
    return APPROVED_STATUSES.has(design.moderationStatus);
  return design.moderationStatus === filter;
}

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
      const payload = data.data || data;

      setDesigns(payload.localDesigns || []);
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
        const payload = data.data || data;

        if (isMounted) {
          setDesigns(payload.localDesigns || []);
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
    () => designs.filter((design) => matchesFilter(design, activeFilter)),
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
      <Panel>
        <PageHeader
          title="My Designs"
          description="Manage drafts, review status, feedback, and published community designs."
          action={<ButtonLink to="/my-designs/new">New Design</ButtonLink>}
        />

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
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
                className="group flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <Link
                  to={`/designs/local/${design.id}?returnTo=${encodeURIComponent("/my-designs")}`}
                  className="block"
                >
                  <div className="relative flex h-36 items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-100">
                    {design.thumbnailUrl ? (
                      <img
                        src={assetUrl(design.thumbnailUrl)}
                        alt={design.title || "Design thumbnail"}
                        className="h-full w-full object-contain p-2 transition duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                        No thumbnail
                      </div>
                    )}
                  </div>

                  <div className="p-4 pb-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <StatusBadge>Community</StatusBadge>
                      <StatusBadge
                        tone={getModerationStatusTone(
                          design.moderationStatus,
                        )}
                      >
                        {getModerationStatusLabel(design.moderationStatus)}
                      </StatusBadge>
                    </div>

                    <h2 className="line-clamp-2 font-semibold text-slate-950">
                      {design.title || "Untitled design"}
                    </h2>

                    <p className="mt-2 text-xs text-slate-500">
                      Updated{" "}
                      {design.updatedAt
                        ? new Date(design.updatedAt).toLocaleDateString()
                        : "-"}
                    </p>

                    <p className="mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6 text-slate-600">
                      {getOwnerModerationMessage(design) ||
                        design.description ||
                        "No description provided."}
                    </p>
                  </div>
                </Link>

                <div className="mt-auto border-t border-slate-200 p-4">
                  <ButtonLink
                    to={`/designs/local/${design.id}?returnTo=${encodeURIComponent("/my-designs")}`}
                    variant="secondary"
                    className="w-full"
                  >
                    View Details
                  </ButtonLink>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <ButtonLink
                      to={`/my-designs/${design.id}`}
                      variant="secondary"
                      className="w-full"
                    >
                      Edit
                    </ButtonLink>

                    {PUBLISHABLE_STATUSES.has(design.moderationStatus) ? (
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
