import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getAdminAuditEvents } from "../../api/admin";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const DEFAULT_LIMIT = 25;

export default function AdminAudit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const filters = useMemo(
    () => ({
      entityType: searchParams.get("entityType") || "",
      actorId: searchParams.get("actorId") || "",
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

    async function loadAuditEvents() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminAuditEvents(filters);
        const payload = response.data || response;

        if (!ignore) {
          setEvents(payload.events || []);
          setPagination(payload.pagination || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load audit events.");
          setEvents([]);
          setPagination(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadAuditEvents();

    return () => {
      ignore = true;
    };
  }, [filters]);

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Admin audit log"
          description="Review admin control changes for users, site content, and future operational events."
        />

        <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-[12rem_12rem_8rem]">
          <Field label="Entity">
            <SelectInput
              value={filters.entityType}
              onChange={(event) =>
                updateFilters({ entityType: event.target.value })
              }
            >
              <option value="">All entities</option>
              <option value="user">Users</option>
              <option value="site_content">Site content</option>
              <option value="print_request">Print requests</option>
              <option value="local_design">Designs</option>
            </SelectInput>
          </Field>
          <Field label="Actor ID">
            <TextInput
              type="number"
              min="1"
              value={filters.actorId}
              onChange={(event) => updateFilters({ actorId: event.target.value })}
            />
          </Field>
          <Field label="Rows">
            <SelectInput
              value={filters.limit}
              onChange={(event) => updateFilters({ limit: event.target.value })}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </SelectInput>
          </Field>
        </div>

        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading audit events...</p>
        )}

        {!isLoading && !error && events.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No audit events found."
            description="Admin control events will appear here as the system records them."
          />
        )}

        {events.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">
                        {event.summary || event.eventType}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.eventType}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone="neutral">
                        {event.entityType || "system"}
                      </StatusBadge>
                      <p className="mt-1 text-xs text-slate-500">
                        {event.entityId || "-"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {event.actorEmail || event.actorName || "System"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <pre className="max-w-sm overflow-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                        {formatMetadata(event.metadata)}
                      </pre>
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
        Page {page} of {totalPages} ({pagination.totalCount || 0} events)
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

function formatMetadata(metadata) {
  if (!metadata) return "{}";
  return JSON.stringify(metadata, null, 2);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}
