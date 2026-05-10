import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminLocalDesigns } from "../../api/designs";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  getModerationStatusLabel,
  getModerationStatusTone,
} from "../../utils/moderation-display";
import { SelectInput, TextInput } from "../../components/ui/Form";

const STATUS_TABS = [
  {
    label: "Needs Review",
    value: "needs_review",
    statuses: ["needs_admin_review", "screening"],
  },
  {
    label: "Approved",
    value: "approved",
    statuses: ["admin_approved", "auto_approved"],
  },
  {
    label: "Rejected / Hidden",
    value: "rejected",
    statuses: ["admin_rejected", "auto_rejected", "hidden"],
  },
  {
    label: "Archived",
    value: "archived",
    statuses: [],
    archived: true,
  },
];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export default function AdminCommunityDesigns() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [designs, setDesigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchFilter, setSearchFilter] = useState("");
  const [decisionSourceFilter, setDecisionSourceFilter] = useState("");
  const [printReadyFilter, setPrintReadyFilter] = useState("");

  const currentTab = searchParams.get("tab") || "needs_review";
  const activeTab = useMemo(
    () => STATUS_TABS.find((tab) => tab.value === currentTab) || STATUS_TABS[0],
    [currentTab],
  );

  const visibleDesigns = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLowerCase();

    return designs.filter((design) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          design.title,
          design.description,
          design.moderationSummary,
          design.moderationFeedback,
          design.uploadedBy ? `user ${design.uploadedBy}` : "",
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch),
          );

      const matchesDecisionSource =
        !decisionSourceFilter ||
        design.moderationDecisionSource === decisionSourceFilter;

      const matchesPrintReady =
        !printReadyFilter ||
        (printReadyFilter === "ready" && design.isPrintReady) ||
        (printReadyFilter === "not_ready" && !design.isPrintReady);

      return matchesSearch && matchesDecisionSource && matchesPrintReady;
    });
  }, [designs, searchFilter, decisionSourceFilter, printReadyFilter]);

  const updateTabFilter = (nextTab) => {
    setSearchParams(nextTab === "needs_review" ? {} : { tab: nextTab });
  };

  useEffect(() => {
    let isMounted = true;

    async function loadCommunityDesigns() {
      try {
        if (isMounted) {
          setIsLoading(true);
        }

        const data = await getAdminLocalDesigns({
          sourceKind: "community",
          archived: activeTab.archived ? "true" : "",
          status: activeTab.statuses.join(","),
        });
        const payload = data.data || data;

        if (isMounted) {
          setDesigns(payload.localDesigns || payload.designs || []);
          setError("");
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

    loadCommunityDesigns();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Community Designs"
          description="Review user submissions, moderation results, feedback, and Print Ready separation."
        />

        <div className="mt-6 inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-1 text-sm font-medium">
          {STATUS_TABS.map((tab) => {
            const isActive = currentTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateTabFilter(tab.value)}
                className={`rounded px-3 py-1.5 ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TextInput
            type="search"
            value={searchFilter}
            onChange={(event) => setSearchFilter(event.target.value)}
            placeholder="Search title, summary, feedback, or owner"
          />

          <SelectInput
            value={decisionSourceFilter}
            onChange={(event) => setDecisionSourceFilter(event.target.value)}
          >
            <option value="">All decision sources</option>
            <option value="rules">Rules</option>
            <option value="ai">AI</option>
            <option value="render">Render</option>
            <option value="admin">Admin</option>
            <option value="none">None</option>
          </SelectInput>

          <SelectInput
            value={printReadyFilter}
            onChange={(event) => setPrintReadyFilter(event.target.value)}
          >
            <option value="">All Print Ready states</option>
            <option value="ready">Print Ready</option>
            <option value="not_ready">Not Print Ready</option>
          </SelectInput>
        </div>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading community designs...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && visibleDesigns.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No community designs found."
            description="User-submitted designs matching this queue will appear here."
          />
        )}

        {designs.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Print Ready</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {visibleDesigns.map((design) => (
                  <tr key={design.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">
                        {design.title || "Untitled design"}
                      </p>
                      {(design.moderationSummary ||
                        design.moderationFeedback) && (
                        <p className="mt-1 max-w-md truncate text-xs text-slate-500">
                          {design.moderationFeedback ||
                            design.moderationSummary}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      User #{design.uploadedBy || "-"}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={getModerationStatusTone(design.moderationStatus)}
                      >
                        {getModerationStatusLabel(design.moderationStatus)}
                      </StatusBadge>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={design.isPrintReady ? "success" : "neutral"}
                      >
                        {design.isPrintReady ? "Ready" : "Not Ready"}
                      </StatusBadge>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(design.updatedAt)}
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/community-designs/${design.id}`}
                        className="font-semibold text-slate-950 underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
