import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyDesigns, publishMyDesign } from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
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

function matchesFilter(design, filter) {
  if (!filter) return true;
  if (filter === "rejected")
    return REJECTED_STATUSES.has(design.moderationStatus);
  if (filter === "approved")
    return APPROVED_STATUSES.has(design.moderationStatus);
  return design.moderationStatus === filter;
}

function formatStatus(status) {
  return String(status || "unknown").replaceAll("_", " ");
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
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {visibleDesigns.map((design) => (
              <article
                key={design.id}
                className="rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">
                      {design.title || "Untitled design"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Updated{" "}
                      {design.updatedAt
                        ? new Date(design.updatedAt).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>

                  <StatusBadge>
                    {formatStatus(design.moderationStatus)}
                  </StatusBadge>
                </div>

                {(design.moderationFeedback || design.moderationSummary) && (
                  <p className="mt-4 text-sm text-slate-600">
                    {design.moderationFeedback || design.moderationSummary}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink
                    to={`/my-designs/${design.id}`}
                    variant="secondary"
                  >
                    Edit
                  </ButtonLink>

                  {PUBLISHABLE_STATUSES.has(design.moderationStatus) && (
                    <Button
                      type="button"
                      onClick={() => handlePublish(design.id)}
                      disabled={publishingId === design.id}
                    >
                      {publishingId === design.id ? "Publishing..." : "Publish"}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
