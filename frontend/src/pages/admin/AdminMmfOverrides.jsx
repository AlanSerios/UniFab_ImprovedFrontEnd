import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  deleteAdminDesignOverride,
  getAdminDesignOverrides,
  updateAdminDesignOverride,
} from "../../api/designs";
import {
  EMPTY_OVERRIDE_EDIT_FORM,
  FILTERS,
  applyOverrideFilterParams,
  buildOverrideUpdatePayload,
  extractOverridesPayload,
  extractUpdatedOverride,
  getClientNotePreview,
  getFilterCount,
  getFiltersFromSearchParams,
  hasMeaningfulOverride,
  overrideToEditForm,
} from "../../utils/admin-mmf-overrides";

function StatusBadge({ label, tone = "neutral" }) {
  const toneClasses = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    red: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

export default function AdminMmfOverrides() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [overrides, setOverrides] = useState([]);
  const [counts, setCounts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [editingOverrideId, setEditingOverrideId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_OVERRIDE_EDIT_FORM);
  const [isUpdating, setIsUpdating] = useState(false);

  const [deletingOverrideId, setDeletingOverrideId] = useState(null);
  const filters = useMemo(
    () => getFiltersFromSearchParams(searchParams),
    [searchParams],
  );

  function updateFilters(nextValues) {
    applyOverrideFilterParams({ searchParams, nextValues, setSearchParams });
  }

  useEffect(() => {
    async function loadOverrides() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getAdminDesignOverrides({
          filter: filters.filter === "all" ? "" : filters.filter,
          search: filters.search,
          page: filters.page,
          limit: filters.limit,
        });
        const payload = extractOverridesPayload(data);

        setOverrides(payload.designOverrides);
        setCounts(payload.counts);
        setPagination(payload.pagination);
      } catch (err) {
        setError(err.message);
        setOverrides([]);
        setCounts(null);
        setPagination(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadOverrides();
  }, [filters.filter, filters.search, filters.page, filters.limit]);

  const startEditingOverride = (override) => {
    setEditingOverrideId(override.id);
    setEditForm(overrideToEditForm(override));
    setError("");
    setSuccessMessage("");
  };

  const cancelEditingOverride = () => {
    setEditingOverrideId(null);
    setEditForm(EMPTY_OVERRIDE_EDIT_FORM);
    setError("");
    setSuccessMessage("");
  };

  const handleUpdateOverride = async (override) => {
    if (!hasMeaningfulOverride(editForm)) {
      const confirmed = window.confirm(
        "Remove this MMF override? Cached Print Ready files will be archived and disabled for new quotes.",
      );
      if (!confirmed) return;

      try {
        setIsUpdating(true);
        setError("");
        setSuccessMessage("");
        await updateAdminDesignOverride(override.id, {
          isHidden: false,
          isPinned: false,
          isPrintReady: false,
          clientNote: "",
        });
        setOverrides((currentOverrides) =>
          currentOverrides.filter((item) => item.id !== override.id),
        );
        setEditingOverrideId(null);
        setSuccessMessage("MMF override removed and cached files archived.");
      } catch (err) {
        setError(err.message);
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    if (
      editForm.isPrintReady &&
      !override.isPrintReady &&
      !override.printReadyFile
    ) {
      setError(
        "Open the MMF detail page to inspect API files and cache the exact printable file before enabling Print Ready.",
      );
      return;
    }

    if (
      editForm.isPrintReady &&
      !override.isPrintReady &&
      !editForm.verificationConfirmed
    ) {
      setError(
        "Confirm local slicer verification before marking this MMF override Print Ready.",
      );
      return;
    }

    try {
      setIsUpdating(true);
      setError("");
      setSuccessMessage("");

      const data = await updateAdminDesignOverride(
        override.id,
        buildOverrideUpdatePayload({ editForm, override }),
      );
      const updatedOverride = extractUpdatedOverride(data);

      setOverrides((currentOverrides) =>
        currentOverrides.map((override) =>
          override.id === updatedOverride.id ? updatedOverride : override,
        ),
      );

      setEditingOverrideId(null);
      setEditForm(EMPTY_OVERRIDE_EDIT_FORM);

      setSuccessMessage("MMF override updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOverride = async (overrideId) => {
    const confirmed = window.confirm(
      "Delete this MMF override? The design will return to its default MyMiniFactory behavior and cached files will be archived.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingOverrideId(overrideId);
      setError("");
      setSuccessMessage("");

      await deleteAdminDesignOverride(overrideId);

      setOverrides((currentOverrides) =>
        currentOverrides.filter((override) => override.id !== overrideId),
      );

      if (editingOverrideId === overrideId) {
        cancelEditingOverride();
      }

      setSuccessMessage("MMF override deleted and cached files archived.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingOverrideId(null);
    }
  };

  return (
    <main className="unifab-admin-page unifab-admin-list-page unifab-admin-page--mmf-overrides mx-auto w-full max-w-[92rem] px-4 py-8 sm:px-6 xl:px-8">
      <div className="unifab-admin-panel rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">MMF Readiness Controls</h1>
            <p className="mt-2 text-slate-600">
              View and edit existing MyMiniFactory overrides. Use the Design
              Library to find new MMF designs and manage them in context.
            </p>
          </div>

          <Link
            to="/designs"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Find MMF designs
          </Link>
        </div>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading MMF overrides...</p>
        )}

        {error && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-green-700">
            {successMessage}
          </div>
        )}

        <div className="unifab-admin-filterbar mt-6 grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_8rem]">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Search MMF object id"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
          <select
            value={filters.limit}
            onChange={(event) => updateFilters({ limit: event.target.value })}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          >
            <option value="10">10 rows</option>
            <option value="20">20 rows</option>
            <option value="50">50 rows</option>
          </select>
        </div>

        {(overrides.length > 0 || counts) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = filters.filter === filter.key;
              const count = getFilterCount(counts, filter.key);

              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => updateFilters({ filter: filter.key })}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "border-[#2b67ad] bg-[#2b67ad] text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {filter.label}
                  {count !== null ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
        )}

        {!isLoading && !error && overrides.length === 0 && (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center">
            <p className="font-medium text-slate-950">No MMF overrides yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Use the Design Library to find a MyMiniFactory design and manage
              it from the design detail page.
            </p>
          </div>
        )}

        {overrides.length === 0 && counts?.total > 0 && (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center">
            <p className="font-medium text-slate-950">
              No overrides match this filter.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Choose another filter or find MMF designs from the Design Library.
            </p>
          </div>
        )}

        {overrides.length > 0 && (
          <div className="unifab-admin-table-wrap mt-6 overflow-hidden rounded-lg">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 font-medium">MMF Object ID</th>
                  <th className="px-4 py-3 font-medium">Print Ready</th>
                  <th className="px-4 py-3 font-medium">Pinned</th>
                  <th className="px-4 py-3 font-medium">Hidden</th>
                  <th className="px-4 py-3 font-medium">Cached File</th>
                  <th className="px-4 py-3 font-medium">Cache Status</th>
                  <th className="px-4 py-3 font-medium">Client Note</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {overrides.map((override) => (
                  <tr key={override.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      <Link
                        to={`/designs/mmf/${override.mmfObjectId}`}
                        className="underline"
                      >
                        {override.mmfObjectId}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {editingOverrideId === override.id ? (
                        <input
                          type="checkbox"
                          checked={editForm.isPrintReady}
                          onChange={(event) =>
                            setEditForm((currentForm) => ({
                              ...currentForm,
                              isPrintReady: event.target.checked,
                            }))
                          }
                        />
                      ) : override.isPrintReady ? (
                        <StatusBadge label="Ready" tone="green" />
                      ) : (
                        <StatusBadge label="Not Ready" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {editingOverrideId === override.id ? (
                        <input
                          type="checkbox"
                          checked={editForm.isPinned}
                          onChange={(event) =>
                            setEditForm((currentForm) => ({
                              ...currentForm,
                              isPinned: event.target.checked,
                            }))
                          }
                        />
                      ) : override.isPinned ? (
                        <StatusBadge label="Pinned" tone="blue" />
                      ) : (
                        <StatusBadge label="Not Pinned" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {editingOverrideId === override.id ? (
                        <input
                          type="checkbox"
                          checked={editForm.isHidden}
                          onChange={(event) =>
                            setEditForm((currentForm) => ({
                              ...currentForm,
                              isHidden: event.target.checked,
                            }))
                          }
                        />
                      ) : override.isHidden ? (
                        <StatusBadge label="Hidden" tone="red" />
                      ) : (
                        <StatusBadge label="Visible" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {override.printReadyFile ? (
                        <span className="font-semibold text-slate-950">
                          {override.printReadyFile.originalFileName ||
                            `Artifact #${override.printReadyFile.id}`}
                        </span>
                      ) : override.linkedLocalDesignId ? (
                        <span className="text-slate-500">
                          Legacy local #{override.linkedLocalDesignId}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {editingOverrideId === override.id &&
                          editForm.isPrintReady
                            ? "Will cache through MMF API on save"
                            : "-"}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {override.mappingStatus === "failed" ? (
                        <div className="space-y-1">
                          <StatusBadge label="Failed" tone="red" />
                          <p className="max-w-xs text-xs leading-5 text-red-600">
                            {override.mappingError || "File caching failed."}
                          </p>
                        </div>
                      ) : override.printReadyFile || override.linkedLocalDesignId ? (
                        <StatusBadge
                          label={(override.mappingStatus || "mapped").replaceAll(
                            "_",
                            " ",
                          )}
                          tone="green"
                        />
                      ) : override.isPrintReady ? (
                        <StatusBadge label="Needs file" tone="red" />
                      ) : (
                        <StatusBadge label="Not requested" />
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {editingOverrideId === override.id ? (
                        <input
                          type="text"
                          value={editForm.clientNote}
                          onChange={(event) =>
                            setEditForm((currentForm) => ({
                              ...currentForm,
                              clientNote: event.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        getClientNotePreview(override.clientNote)
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {override.updatedAt
                        ? new Date(override.updatedAt).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      {editingOverrideId === override.id ? (
                        <div className="space-y-3">
                          {editForm.isPrintReady && !override.isPrintReady && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                              <label className="flex items-start gap-2 text-xs leading-5 text-amber-900">
                                <input
                                  type="checkbox"
                                  checked={editForm.verificationConfirmed}
                                  onChange={(event) =>
                                    setEditForm((currentForm) => ({
                                      ...currentForm,
                                      verificationConfirmed:
                                        event.target.checked,
                                    }))
                                  }
                                  className="mt-1 h-4 w-4 rounded border-amber-300"
                                />
                                <span>
                                  Verified locally in slicer and safe for Print
                                  Ready cached-file use.
                                </span>
                              </label>
                              <textarea
                                value={editForm.verificationNote}
                                onChange={(event) =>
                                  setEditForm((currentForm) => ({
                                    ...currentForm,
                                    verificationNote: event.target.value,
                                  }))
                                }
                                className="mt-2 w-full rounded-md border border-amber-200 px-2 py-1 text-xs"
                                rows={2}
                                placeholder="Optional verification note"
                              />
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateOverride(override)}
                              disabled={isUpdating}
                              className="font-semibold text-slate-950 underline disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              {isUpdating ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              onClick={cancelEditingOverride}
                              disabled={isUpdating}
                              className="font-semibold text-slate-600 underline disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            to={`/designs/mmf/${override.mmfObjectId}`}
                            className="font-semibold text-slate-950 underline"
                          >
                            Open
                          </Link>

                          <button
                            type="button"
                            onClick={() => startEditingOverride(override)}
                            className="font-semibold text-slate-950 underline"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteOverride(override.id)}
                            disabled={deletingOverrideId === override.id}
                            className="font-semibold text-red-700 underline disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {deletingOverrideId === override.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500 max-sm:flex-col max-sm:items-start">
            <span>
              Page {pagination.page} of {pagination.totalPages} (
              {pagination.totalCount || 0} overrides)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={Number(pagination.page || 1) <= 1}
                onClick={() =>
                  updateFilters({ page: Number(pagination.page || 1) - 1 })
                }
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={
                  Number(pagination.page || 1) >=
                  Number(pagination.totalPages || 1)
                }
                onClick={() =>
                  updateFilters({ page: Number(pagination.page || 1) + 1 })
                }
                className="rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
