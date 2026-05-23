import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getAdminPrintRequests } from "../../api/requests";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const DEFAULT_LIMIT = 20;
const STATUS_OPTIONS = [
  ["pending_review", "Pending Review"],
  ["design_in_progress", "Design In Progress"],
  ["approved", "Approved"],
  ["payment_slip_issued", "Awaiting Payment"],
  ["payment_verified", "Payment Verified"],
  ["printing", "Printing"],
  ["completed", "Completed"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
];

const STATUS_TONES = {
  pending_review: "warning",
  design_in_progress: "warning",
  approved: "success",
  payment_slip_issued: "warning",
  payment_verified: "success",
  printing: "success",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

function getRequestCurrency(request) {
  return (
    request?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    request?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

export default function AdminPrintRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [printRequests, setPrintRequests] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(
    () => ({
      archived: searchParams.get("archived") || "",
      status: searchParams.get("status") || "",
      sourceType: searchParams.get("sourceType") || "",
      search: searchParams.get("search") || "",
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

    async function loadPrintRequests() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminPrintRequests(filters);
        const payload = response.data || response;

        if (!ignore) {
          setPrintRequests(payload.printRequests || []);
          setCounts(payload.counts || null);
          setPagination(payload.pagination || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load print requests.");
          setPrintRequests([]);
          setCounts(null);
          setPagination(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadPrintRequests();

    return () => {
      ignore = true;
    };
  }, [filters]);

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Admin print requests"
          description="Review submitted print requests, track lifecycle status, and manage payment handoff."
        />

        <div className="mt-6 inline-flex rounded-md border border-slate-300 bg-white p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => updateFilters({ archived: "" })}
            className={`rounded px-3 py-1.5 ${
              filters.archived !== "true"
                ? "bg-slate-950 text-white"
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
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Archived
          </button>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_12rem_12rem_8rem]">
          <Field label="Search">
            <TextInput
              type="search"
              value={filters.search}
              placeholder="Reference, client, or file"
              onChange={(event) => updateFilters({ search: event.target.value })}
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={filters.status}
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Source">
            <SelectInput
              value={filters.sourceType}
              onChange={(event) =>
                updateFilters({ sourceType: event.target.value })
              }
            >
              <option value="">All sources</option>
              <option value="quote">Quote</option>
              <option value="cart">Cart</option>
              <option value="library">Design Library</option>
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
              <StatusBadge key={status} tone={STATUS_TONES[status] || "neutral"}>
                {formatStatus(status)}: {count}
              </StatusBadge>
            ))}
          </div>
        )}

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading print requests...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && printRequests.length === 0 && (
          <EmptyState
            className="mt-6"
            title={`No ${
              filters.archived === "true" ? "archived" : "active"
            } print requests found.`}
            description="Submitted client print requests matching these filters will appear here."
          />
        )}

        {printRequests.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {filters.archived === "true" && (
                    <th className="px-4 py-3 font-medium">Archived</th>
                  )}
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {printRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {request.referenceNumber || `#${request.id}`}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {request.clientName ||
                        request.userName ||
                        request.user?.name ||
                        "Client"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {request.fileOriginalName || "Model file"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {request.itemCount || 1}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {[request.material, request.materialColorName]
                        .filter(Boolean)
                        .join(" / ") || "Material"}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={STATUS_TONES[request.status] || "neutral"}
                      >
                        {formatStatus(request.status)}
                      </StatusBadge>
                    </td>

                    {filters.archived === "true" && (
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(request.archivedAt)}
                      </td>
                    )}

                    <td className="px-4 py-3 text-slate-600">
                      {getRequestCurrency(request)}{" "}
                      {Number(request.estimatedCost || 0).toFixed(2)}
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/print-requests/${request.id}`}
                        className="font-semibold text-slate-950 underline"
                      >
                        View
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
        Page {page} of {totalPages} ({pagination.totalCount || 0} requests)
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
