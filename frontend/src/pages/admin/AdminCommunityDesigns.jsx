import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminLocalDesigns } from "../../api/designs";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  getModerationStatusLabel,
  getModerationStatusTone,
} from "../../utils/moderation-display";

const DEFAULT_LIMIT = 20;
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

export default function AdminCommunityDesigns() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [designs, setDesigns] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const currentTab = searchParams.get("tab") || "needs_review";
  const activeTab = useMemo(
    () => STATUS_TABS.find((tab) => tab.value === currentTab) || STATUS_TABS[0],
    [currentTab],
  );

  const filters = useMemo(
    () => ({
      tab: currentTab,
      search: searchParams.get("search") || "",
      printReady: searchParams.get("printReady") || "",
      page: Number(searchParams.get("page") || 1),
      limit: Number(searchParams.get("limit") || DEFAULT_LIMIT),
    }),
    [currentTab, searchParams],
  );

  function updateFilters(nextValues) {
    const next = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });

    if (!("page" in nextValues)) {
      next.set("page", "1");
    }

    if (next.get("tab") === "needs_review") {
      next.delete("tab");
    }

    setSearchParams(next);
  }

  useEffect(() => {
    let ignore = false;

    async function loadCommunityDesigns() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminLocalDesigns({
          sourceKind: "community",
          archived: activeTab.archived ? "true" : "",
          status: activeTab.statuses.join(","),
          search: filters.search,
          printReady: filters.printReady,
          page: filters.page,
          limit: filters.limit,
        });
        const payload = response.data || response;

        if (!ignore) {
          setDesigns(payload.localDesigns || payload.designs || []);
          setCounts(payload.counts || null);
          setPagination(payload.pagination || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load community designs.");
          setDesigns([]);
          setCounts(null);
          setPagination(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadCommunityDesigns();

    return () => {
      ignore = true;
    };
  }, [activeTab, filters.search, filters.printReady, filters.page, filters.limit]);

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-list-page unifab-admin-page--community-designs">
        <PageHeader
          title="Community designs"
          description="Review user submissions, moderation results, feedback, and Print Ready separation."
        />

        <div className="unifab-admin-segment mt-6 inline-flex flex-wrap text-sm font-medium">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateFilters({ tab: tab.value })}
              className={`rounded px-3 py-1.5 ${
                currentTab === tab.value
                  ? "bg-[#2b67ad] text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="unifab-admin-filterbar mt-4 grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_12rem_8rem]">
          <Field label="Search">
            <TextInput
              type="search"
              value={filters.search}
              onChange={(event) => updateFilters({ search: event.target.value })}
              placeholder="Title, description, summary, or owner"
            />
          </Field>
          <Field label="Print Ready">
            <SelectInput
              value={filters.printReady}
              onChange={(event) =>
                updateFilters({ printReady: event.target.value })
              }
            >
              <option value="">All states</option>
              <option value="true">Print Ready</option>
              <option value="false">Not Print Ready</option>
            </SelectInput>
          </Field>
          <Field label="Rows">
            <SelectInput
              value={filters.limit}
              onChange={(event) => updateFilters({ limit: event.target.value })}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </SelectInput>
          </Field>
        </div>

        {counts?.byStatus && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(counts.byStatus).map(([status, count]) => (
              <StatusBadge
                key={status}
                tone={getModerationStatusTone(status) || "neutral"}
              >
                {getModerationStatusLabel(status)}: {count}
              </StatusBadge>
            ))}
          </div>
        )}

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading community designs...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && designs.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No community designs found."
            description="User-submitted designs matching this queue will appear here."
          />
        )}

        {designs.length > 0 && (
          <div className="unifab-admin-table-wrap mt-6 overflow-hidden rounded-lg">
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
                {designs.map((design) => (
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
                      {design.uploader?.email ||
                        design.uploadedByEmail ||
                        `User #${design.uploadedBy || "-"}`}
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

        <Pagination
          pagination={pagination}
          onPageChange={(page) => updateFilters({ page })}
        />
      </Panel>
    </PageShell>
  );
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;

  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page} of {totalPages} ({pagination.totalCount || 0} designs)
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}
