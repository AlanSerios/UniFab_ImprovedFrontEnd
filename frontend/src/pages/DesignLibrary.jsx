import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import { getDesignTaxonomy, searchDesignLibrary } from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { SelectInput, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

const DEFAULT_LOCAL_PAGINATION = {
  page: 1,
  limit: 12,
  totalCount: 0,
  totalPages: 1,
};

const DEFAULT_MMF_PAGINATION = {
  page: 1,
  limit: 12,
  totalCount: 0,
  totalPages: 1,
  visibleCount: 0,
};

const LOCAL_SORT_VALUES = new Set([
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "print_ready",
]);

const LOCAL_LIMIT_VALUES = new Set([6, 12, 24]);
const SOURCE_FILTER_VALUES = new Set(["lab", "community"]);
const PRINT_READY_FILTER_VALUES = new Set(["true", "false"]);

const MMF_SORT_VALUES = new Set(["popularity", "date", "visits"]);
const MMF_ORDER_VALUES = new Set(["asc", "desc"]);
const MMF_LIMIT_VALUES = new Set([12, 24, 36]);

function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

function getSearchValue(searchParams, key, fallback = "") {
  return searchParams.get(key) || fallback;
}

function getAllowedSearchValue(
  searchParams,
  key,
  allowedValues,
  fallback = "",
) {
  const value = searchParams.get(key);

  if (!value || !allowedValues.has(value)) {
    return fallback;
  }

  return value;
}

function getPositiveIntegerSearchValue(searchParams, key, fallback) {
  const value = Number(searchParams.get(key));

  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }

  return value;
}

function getLocalLimitSearchValue(searchParams) {
  const value = Number(searchParams.get("localLimit"));

  if (!LOCAL_LIMIT_VALUES.has(value)) {
    return 12;
  }

  return value;
}

function getMmfLimitSearchValue(searchParams) {
  const value = Number(searchParams.get("mmfPerPage"));

  if (!MMF_LIMIT_VALUES.has(value)) {
    return 12;
  }

  return value;
}

function getMmfThumbnailUrl(item) {
  const primaryImage = item.images?.find((image) => image.isPrimary);
  const fallbackImage = item.images?.[0];

  return (
    primaryImage?.standardUrl ||
    primaryImage?.thumbnailUrl ||
    primaryImage?.originalUrl ||
    fallbackImage?.standardUrl ||
    fallbackImage?.thumbnailUrl ||
    fallbackImage?.originalUrl ||
    ""
  );
}

function parseLocalDesignPayload(localPayload, fallbackLimit) {
  if (Array.isArray(localPayload)) {
    return {
      items: localPayload,
      pagination: {
        page: 1,
        limit: fallbackLimit,
        totalCount: localPayload.length,
        totalPages: 1,
      },
    };
  }

  const items = localPayload?.items || [];
  const page = Number(localPayload?.page || 1);
  const limit = Number(localPayload?.limit || fallbackLimit);
  const totalCount = Number(localPayload?.totalCount || items.length);
  const totalPages = Number(localPayload?.totalPages || 1);

  return {
    items,
    pagination: {
      page: Math.max(page, 1),
      limit: Math.max(limit, 1),
      totalCount: Math.max(totalCount, 0),
      totalPages: Math.max(totalPages, 1),
    },
  };
}

function parseMmfPaginationPayload(mmfPayload, fallbackLimit) {
  const items = mmfPayload?.items || [];
  const page = Number(mmfPayload?.page || 1);
  const limit = Number(mmfPayload?.limit || fallbackLimit);
  const totalCount = Number(mmfPayload?.totalCount || 0);
  const totalPages = Number(mmfPayload?.totalPages || 1);
  const visibleCount = Number(
    mmfPayload?.visibleCount ?? mmfPayload?.items?.length ?? 0,
  );

  return {
    items,
    pagination: {
      page: Math.max(page, 1),
      limit: Math.max(limit, 1),
      totalCount: Math.max(totalCount, 0),
      totalPages: Math.max(totalPages, 1),
      visibleCount: Math.max(visibleCount, 0),
    },
  };
}

export default function DesignLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();

  const submittedSearch = getSearchValue(searchParams, "q");
  const categoryFilter = getSearchValue(searchParams, "category");
  const tagFilter = getSearchValue(searchParams, "tag");

  const sourceFilter = getAllowedSearchValue(
    searchParams,
    "sourceKind",
    SOURCE_FILTER_VALUES,
  );

  const printReadyFilter = getAllowedSearchValue(
    searchParams,
    "printReady",
    PRINT_READY_FILTER_VALUES,
  );

  const localSort = getAllowedSearchValue(
    searchParams,
    "localSort",
    LOCAL_SORT_VALUES,
    "newest",
  );

  const localPage = getPositiveIntegerSearchValue(searchParams, "localPage", 1);
  const localLimit = getLocalLimitSearchValue(searchParams);

  const mmfPage = getPositiveIntegerSearchValue(searchParams, "mmfPage", 1);
  const mmfPerPage = getMmfLimitSearchValue(searchParams);

  const mmfSort = getAllowedSearchValue(
    searchParams,
    "mmfSort",
    MMF_SORT_VALUES,
    "popularity",
  );

  const mmfOrder = getAllowedSearchValue(
    searchParams,
    "mmfOrder",
    MMF_ORDER_VALUES,
    "desc",
  );

  const [searchTerm, setSearchTerm] = useState(submittedSearch);
  const [localPagination, setLocalPagination] = useState(
    DEFAULT_LOCAL_PAGINATION,
  );
  const [mmfPagination, setMmfPagination] = useState(DEFAULT_MMF_PAGINATION);

  const [localDesigns, setLocalDesigns] = useState([]);
  const [mmfItems, setMmfItems] = useState([]);
  const [mmfStatus, setMmfStatus] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setSearchTerm(submittedSearch);
  }, [submittedSearch]);

  useEffect(() => {
    async function loadTaxonomy() {
      try {
        const data = await getDesignTaxonomy();
        const payload = data.data || data;

        setTaxonomy({
          categories: payload.categories || [],
          tags: payload.tags || [],
        });
      } catch {
        setTaxonomy({ categories: [], tags: [] });
      }
    }

    loadTaxonomy();
  }, []);

  useEffect(() => {
    async function loadDesigns() {
      try {
        setIsLoading(true);
        setError("");

        const params = {
          localPage,
          localLimit,
          localSort,
        };

        if (submittedSearch) {
          params.q = submittedSearch;
          params.mmfPage = mmfPage;
          params.mmfPerPage = mmfPerPage;
          params.mmfSort = mmfSort;
          params.mmfOrder = mmfOrder;
        }

        if (categoryFilter) {
          params.category = categoryFilter;
        }

        if (tagFilter) {
          params.tag = tagFilter;
        }

        if (sourceFilter) {
          params.sourceKind = sourceFilter;
        }

        if (printReadyFilter) {
          params.printReady = printReadyFilter;
        }

        const data = await searchDesignLibrary(params);
        const payload = data.data || data;

        const localPayload = parseLocalDesignPayload(
          payload.localDesigns || [],
          localLimit,
        );

        const mmfPayload = parseMmfPaginationPayload(
          payload.mmfResults || {},
          mmfPerPage,
        );

        setLocalDesigns(localPayload.items);
        setLocalPagination(localPayload.pagination);

        setMmfItems(mmfPayload.items);
        setMmfPagination(mmfPayload.pagination);
        setMmfStatus(payload.mmfStatus || null);
      } catch (err) {
        setError(err.message);
        setLocalDesigns([]);
        setMmfItems([]);
        setMmfStatus(null);
        setLocalPagination(DEFAULT_LOCAL_PAGINATION);
        setMmfPagination(DEFAULT_MMF_PAGINATION);
      } finally {
        setIsLoading(false);
      }
    }

    loadDesigns();
  }, [
    submittedSearch,
    categoryFilter,
    tagFilter,
    sourceFilter,
    printReadyFilter,
    localSort,
    localPage,
    localLimit,
    mmfPage,
    mmfPerPage,
    mmfSort,
    mmfOrder,
  ]);

  const updateUrlFilters = (overrides = {}) => {
    const nextValues = {
      q: submittedSearch,
      category: categoryFilter,
      tag: tagFilter,
      sourceKind: sourceFilter,
      printReady: printReadyFilter,
      localSort,
      localPage,
      localLimit,
      mmfPage,
      mmfPerPage,
      mmfSort,
      mmfOrder,
      ...overrides,
    };

    const nextParams = new URLSearchParams();

    if (nextValues.q) {
      nextParams.set("q", nextValues.q);
    }

    if (nextValues.category) {
      nextParams.set("category", nextValues.category);
    }

    if (nextValues.tag) {
      nextParams.set("tag", nextValues.tag);
    }

    if (nextValues.sourceKind) {
      nextParams.set("sourceKind", nextValues.sourceKind);
    }

    if (nextValues.printReady) {
      nextParams.set("printReady", nextValues.printReady);
    }

    if (nextValues.localSort && nextValues.localSort !== "newest") {
      nextParams.set("localSort", nextValues.localSort);
    }

    if (Number(nextValues.localPage) > 1) {
      nextParams.set("localPage", String(nextValues.localPage));
    }

    if (Number(nextValues.localLimit) !== 12) {
      nextParams.set("localLimit", String(nextValues.localLimit));
    }

    if (nextValues.q) {
      if (Number(nextValues.mmfPage) > 1) {
        nextParams.set("mmfPage", String(nextValues.mmfPage));
      }

      if (Number(nextValues.mmfPerPage) !== 12) {
        nextParams.set("mmfPerPage", String(nextValues.mmfPerPage));
      }

      if (nextValues.mmfSort && nextValues.mmfSort !== "popularity") {
        nextParams.set("mmfSort", nextValues.mmfSort);
      }

      if (nextValues.mmfOrder && nextValues.mmfOrder !== "desc") {
        nextParams.set("mmfOrder", nextValues.mmfOrder);
      }
    }

    setSearchParams(nextParams);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    updateUrlFilters({
      q: searchTerm.trim(),
      localPage: 1,
      mmfPage: 1,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSearchParams(new URLSearchParams());
  };

  const goToPreviousLocalPage = () => {
    updateUrlFilters({
      localPage: Math.max(localPagination.page - 1, 1),
    });
  };

  const goToNextLocalPage = () => {
    updateUrlFilters({
      localPage: Math.min(localPagination.page + 1, localPagination.totalPages),
    });
  };

  const goToPreviousMmfPage = () => {
    updateUrlFilters({
      mmfPage: Math.max(mmfPagination.page - 1, 1),
    });
  };

  const goToNextMmfPage = () => {
    updateUrlFilters({
      mmfPage: Math.min(mmfPagination.page + 1, mmfPagination.totalPages),
    });
  };

  return (
    <PageShell size="xl">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <PageHeader
            title="Design library"
            description="Browse approved local designs and search MyMiniFactory references."
          />

          <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
            <TextInput
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search designs"
              className="w-64"
            />

            <SelectInput
              value={categoryFilter}
              onChange={(event) =>
                updateUrlFilters({
                  category: event.target.value,
                  localPage: 1,
                })
              }
              className="w-44"
            >
              <option value="">All categories</option>
              {taxonomy.categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </SelectInput>

            <SelectInput
              value={tagFilter}
              onChange={(event) =>
                updateUrlFilters({
                  tag: event.target.value,
                  localPage: 1,
                })
              }
              className="w-40"
            >
              <option value="">All tags</option>
              {taxonomy.tags.map((tag) => (
                <option key={tag.id} value={tag.slug}>
                  {tag.name}
                </option>
              ))}
            </SelectInput>

            <SelectInput
              value={sourceFilter}
              onChange={(event) =>
                updateUrlFilters({
                  sourceKind: event.target.value,
                  localPage: 1,
                })
              }
              className="w-40"
            >
              <option value="">All sources</option>
              <option value="lab">Lab designs</option>
              <option value="community">Community designs</option>
            </SelectInput>

            <SelectInput
              value={printReadyFilter}
              onChange={(event) =>
                updateUrlFilters({
                  printReady: event.target.value,
                  localPage: 1,
                })
              }
              className="w-44"
            >
              <option value="">All availability</option>
              <option value="true">Print Ready</option>
              <option value="false">Review Only</option>
            </SelectInput>

            <SelectInput
              value={localSort}
              onChange={(event) =>
                updateUrlFilters({
                  localSort: event.target.value,
                  localPage: 1,
                })
              }
              className="w-44"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title_asc">Title A-Z</option>
              <option value="title_desc">Title Z-A</option>
              <option value="print_ready">Print Ready first</option>
            </SelectInput>

            <SelectInput
              value={localLimit}
              onChange={(event) =>
                updateUrlFilters({
                  localLimit: Number(event.target.value),
                  localPage: 1,
                })
              }
              className="w-32"
            >
              <option value={6}>6 / page</option>
              <option value={12}>12 / page</option>
              <option value={24}>24 / page</option>
            </SelectInput>

            <Button type="submit">Search</Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          </form>
        </div>

        {isLoading && <p className="mt-6 text-slate-600">Loading designs...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && (
          <div className="mt-8 space-y-10">
            <section>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    Local Designs
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {localPagination.totalCount} result
                    {localPagination.totalCount === 1 ? "" : "s"} found
                  </p>
                </div>

                <p className="text-sm text-slate-500">
                  Page {localPagination.page} of {localPagination.totalPages}
                </p>
              </div>

              {localDesigns.length === 0 ? (
                <EmptyState
                  className="mt-4"
                  title="No local designs available."
                  description="Try changing your search, filters, or sorting options."
                />
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {localDesigns.map((design) => (
                      <LocalDesignCard key={design.id} design={design} />
                    ))}
                  </div>

                  {localPagination.totalPages > 1 && (
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-500">
                        Showing page {localPagination.page} of{" "}
                        {localPagination.totalPages}
                      </p>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={localPagination.page <= 1}
                          onClick={goToPreviousLocalPage}
                        >
                          Previous
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            localPagination.page >= localPagination.totalPages
                          }
                          onClick={goToNextLocalPage}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {submittedSearch && (
              <section>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">
                      MyMiniFactory Results
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {mmfPagination.totalCount} external result
                      {mmfPagination.totalCount === 1 ? "" : "s"} found ·{" "}
                      {mmfPagination.visibleCount} visible on this page
                    </p>
                  </div>

                  {mmfStatus && !mmfStatus.available && (
                    <p className="text-sm font-medium text-red-600">
                      {mmfStatus.message || "MyMiniFactory unavailable"}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <SelectInput
                    value={mmfSort}
                    onChange={(event) =>
                      updateUrlFilters({
                        mmfSort: event.target.value,
                        mmfPage: 1,
                      })
                    }
                    className="w-44"
                  >
                    <option value="popularity">Most popular</option>
                    <option value="date">Newest on MMF</option>
                    <option value="visits">Most visited</option>
                  </SelectInput>

                  <SelectInput
                    value={mmfOrder}
                    onChange={(event) =>
                      updateUrlFilters({
                        mmfOrder: event.target.value,
                        mmfPage: 1,
                      })
                    }
                    className="w-32"
                  >
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </SelectInput>

                  <SelectInput
                    value={mmfPerPage}
                    onChange={(event) =>
                      updateUrlFilters({
                        mmfPerPage: Number(event.target.value),
                        mmfPage: 1,
                      })
                    }
                    className="w-36"
                  >
                    <option value={12}>12 / page</option>
                    <option value={24}>24 / page</option>
                    <option value={36}>36 / page</option>
                  </SelectInput>
                </div>

                {mmfItems.length === 0 ? (
                  <EmptyState
                    className="mt-4"
                    title="No MyMiniFactory results found."
                    description="Try a different search term or MMF sorting option."
                  />
                ) : (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {mmfItems.map((item) => (
                        <MmfDesignCard key={item.id} item={item} />
                      ))}
                    </div>

                    {mmfPagination.totalPages > 1 && (
                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-500">
                          Showing MMF page {mmfPagination.page} of{" "}
                          {mmfPagination.totalPages}
                        </p>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={mmfPagination.page <= 1}
                            onClick={goToPreviousMmfPage}
                          >
                            Previous
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              mmfPagination.page >= mmfPagination.totalPages
                            }
                            onClick={goToNextMmfPage}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function LocalDesignCard({ design }) {
  const isPrintReady = Boolean(design.isPrintReady);
  const detailPath = `/designs/local/${design.id}`;
  const quotePath = `${detailPath}#quote`;

  return (
    <article className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <Link to={detailPath} className="block">
        <div className="h-44 overflow-hidden bg-slate-100">
          {design.thumbnailUrl ? (
            <img
              src={assetUrl(design.thumbnailUrl)}
              alt={design.title || "Design thumbnail"}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              No thumbnail
            </div>
          )}
        </div>

        <div className="p-4 pb-0">
          <h3 className="line-clamp-2 font-semibold text-slate-950">
            {design.title || "Untitled design"}
          </h3>

          {design.description ? (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {design.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No description provided.
            </p>
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 p-4">
        {isPrintReady ? (
          <>
            <StatusBadge tone="success">Print Ready</StatusBadge>
            <ButtonLink to={quotePath} size="sm">
              Instant Quote
            </ButtonLink>
          </>
        ) : (
          <>
            <StatusBadge tone="warning">Review Only</StatusBadge>
            <ButtonLink to={detailPath} size="sm" variant="secondary">
              View Details
            </ButtonLink>
          </>
        )}
      </div>
    </article>
  );
}

function MmfDesignCard({ item }) {
  const isPrintReady = Boolean(item.override?.isPrintReady);
  const isPinned = Boolean(item.override?.isPinned);
  const thumbnailUrl = getMmfThumbnailUrl(item);
  const title = item.name || item.title || `Object ${item.id}`;

  return (
    <Link
      to={`/designs/mmf/${item.id}`}
      className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isPinned
          ? "border-amber-300 ring-2 ring-amber-100 hover:border-amber-400"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="relative h-44 overflow-hidden bg-slate-100">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No thumbnail
          </div>
        )}

        {isPinned && (
          <div className="absolute left-3 top-3">
            <StatusBadge tone="warning">Pinned</StatusBadge>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">MyMiniFactory</p>

            <h3 className="mt-1 line-clamp-2 font-semibold text-slate-950">
              {title}
            </h3>
          </div>

          <StatusBadge tone={isPrintReady ? "success" : "warning"}>
            {isPrintReady ? "Ready" : "Needs review"}
          </StatusBadge>
        </div>

        {item.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
            {item.description}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No description provided.
          </p>
        )}

        {item.override?.clientNote && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
            {item.override.clientNote}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-950">
            View Details
          </span>
        </div>
      </div>
    </Link>
  );
}
