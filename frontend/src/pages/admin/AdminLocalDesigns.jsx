import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminLabDesigns } from "../../api/designs";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const DEFAULT_LIMIT = 20;

export default function AdminLocalDesigns() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [localDesigns, setLocalDesigns] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(
    () => ({
      archived: searchParams.get("archived") || "",
      search: searchParams.get("search") || "",
      printReady: searchParams.get("printReady") || "",
      page: Number(searchParams.get("page") || 1),
      limit: Number(searchParams.get("limit") || DEFAULT_LIMIT),
    }),
    [searchParams],
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

    setSearchParams(next);
  }

  useEffect(() => {
    let ignore = false;

    async function loadLocalDesigns() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminLabDesigns(filters);
        const payload = response.data || response;

        if (!ignore) {
          setLocalDesigns(payload.localDesigns || payload.designs || []);
          setCounts(payload.counts || null);
          setPagination(payload.pagination || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load lab designs.");
          setLocalDesigns([]);
          setCounts(null);
          setPagination(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadLocalDesigns();

    return () => {
      ignore = true;
    };
  }, [filters]);

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-list-page unifab-admin-page--lab-designs">
        <PageHeader
          title="Official lab designs"
          description="Manage lab-owned catalog designs separately from community submissions."
          action={<ButtonLink to="/admin/lab-designs/new">New Lab Design</ButtonLink>}
        />

        <div className="unifab-admin-segment mt-6 inline-flex text-sm font-medium">
          <button
            type="button"
            onClick={() => updateFilters({ archived: "" })}
            className={`rounded px-3 py-1.5 ${
              filters.archived !== "true"
                ? "bg-[#2b67ad] text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => updateFilters({ archived: "true" })}
            className={`rounded px-3 py-1.5 ${
              filters.archived === "true"
                ? "bg-[#2b67ad] text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Archived
          </button>
        </div>

        <div className="unifab-admin-filterbar mt-4 grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_12rem_8rem]">
          <Field label="Search">
            <TextInput
              type="search"
              value={filters.search}
              placeholder="Title, description, or uploader"
              onChange={(event) => updateFilters({ search: event.target.value })}
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
              <option value="false">Needs verification</option>
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
              <StatusBadge key={status} tone="neutral">
                {formatStatus(status)}: {count}
              </StatusBadge>
            ))}
          </div>
        )}

        {isLoading && <p className="mt-6 text-slate-600">Loading lab designs...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && localDesigns.length === 0 && (
          <EmptyState
            className="mt-6"
            title={`No ${
              filters.archived === "true" ? "archived" : "active"
            } lab designs found.`}
            description="Add an official lab design to make it available in the design library."
          />
        )}

        {localDesigns.length > 0 && (
          <div className="unifab-admin-table-wrap mt-6 overflow-hidden rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Availability</th>
                  <th className="px-4 py-3 font-medium">Print Ready</th>
                  {filters.archived === "true" && (
                    <th className="px-4 py-3 font-medium">Archived</th>
                  )}
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {localDesigns.map((design) => (
                  <tr key={design.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {design.title}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {design.category?.name || "-"}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge tone={design.isActive ? "success" : "neutral"}>
                        {design.isActive ? "Available" : "Unavailable"}
                      </StatusBadge>
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={design.isPrintReady ? "success" : "warning"}
                      >
                        {design.isPrintReady ? "Ready" : "Needs verification"}
                      </StatusBadge>
                    </td>

                    {filters.archived === "true" && (
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(design.archivedAt)}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/lab-designs/${design.id}`}
                        className="font-semibold text-slate-950 underline"
                      >
                        Edit
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

function formatStatus(value) {
  return String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
