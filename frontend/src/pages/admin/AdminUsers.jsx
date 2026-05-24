import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getAdminUsers, updateAdminUser } from "../../api/admin";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import { useAuth } from "../../context/AuthContext";

const DEFAULT_LIMIT = 20;

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filters = useMemo(
    () => ({
      search: searchParams.get("search") || "",
      role: searchParams.get("role") || "",
      verified: searchParams.get("verified") || "",
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

    async function loadFilteredUsers() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminUsers(filters);
        const payload = response.data || response;

        if (!ignore) {
          setUsers(payload.users || []);
          setCounts(payload.counts || null);
          setPagination(payload.pagination || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load users.");
          setUsers([]);
          setCounts(null);
          setPagination(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadFilteredUsers();

    return () => {
      ignore = true;
    };
  }, [filters]);

  async function toggleFlag(targetUser, field) {
    const nextValue = !targetUser[field];

    try {
      setUpdatingUserId(targetUser.id);
      setError("");
      setMessage("");

      const response = await updateAdminUser(targetUser.id, {
        [field]: nextValue,
      });
      const updatedUser = response.data?.user || response.user;

      setUsers((current) =>
        current.map((item) => (item.id === targetUser.id ? updatedUser : item)),
      );
      setMessage(`Updated ${targetUser.email}.`);
    } catch (err) {
      setError(err.message || "Failed to update user.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-list-page unifab-admin-page--users">
        <PageHeader
          title="Admin users"
          description="Review account verification and grant or remove admin access with audit history."
        />

        <div className="unifab-admin-filterbar mt-6 grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_12rem_12rem_8rem]">
          <Field label="Search">
            <TextInput
              type="search"
              value={filters.search}
              placeholder="Name or email"
              onChange={(event) => updateFilters({ search: event.target.value })}
            />
          </Field>
          <Field label="Role">
            <SelectInput
              value={filters.role}
              onChange={(event) => updateFilters({ role: event.target.value })}
            >
              <option value="">All roles</option>
              <option value="admin">Admins</option>
              <option value="client">Clients</option>
            </SelectInput>
          </Field>
          <Field label="Verification">
            <SelectInput
              value={filters.verified}
              onChange={(event) =>
                updateFilters({ verified: event.target.value })
              }
            >
              <option value="">All users</option>
              <option value="true">Verified</option>
              <option value="false">Unverified</option>
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

        {counts && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Metric label="Total" value={counts.total} />
            <Metric label="Admins" value={counts.admin} />
            <Metric label="Verified" value={counts.verified} />
            <Metric label="Unverified" value={counts.unverified} />
          </div>
        )}

        <Alert className="mt-4" type="success">
          {message}
        </Alert>
        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        {isLoading && <p className="mt-6 text-slate-600">Loading users...</p>}

        {!isLoading && !error && users.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No users found."
            description="Try a different search, role, or verification filter."
          />
        )}

        {users.length > 0 && (
          <div className="unifab-admin-table-wrap mt-6 overflow-hidden rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((item) => {
                  const isSelf = Number(item.id) === Number(currentUser?.id);

                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">
                          {item.name || item.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          User #{item.id}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={item.isAdmin ? "success" : "neutral"}>
                          {item.isAdmin ? "Admin" : "Client"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{item.email}</p>
                        <StatusBadge
                          tone={item.isEmailVerified ? "success" : "warning"}
                        >
                          {item.isEmailVerified ? "Verified" : "Unverified"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={updatingUserId === item.id}
                            onClick={() => toggleFlag(item, "isEmailVerified")}
                          >
                            {item.isEmailVerified ? "Mark unverified" : "Verify"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={item.isAdmin ? "danger" : "secondary"}
                            disabled={updatingUserId === item.id || (isSelf && item.isAdmin)}
                            onClick={() => toggleFlag(item, "isAdmin")}
                          >
                            {item.isAdmin ? "Remove admin" : "Make admin"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {Number(value || 0)}
      </p>
    </div>
  );
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;

  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page} of {totalPages} ({pagination.totalCount || 0} users)
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
