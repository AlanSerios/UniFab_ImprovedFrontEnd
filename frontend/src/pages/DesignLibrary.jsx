import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import {
  getDesignTaxonomy,
  getSavedDesigns,
  saveDesign,
  searchDesignLibrary,
  unsaveDesign,
} from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { SelectInput, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";

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

const DESIGN_TAB_VALUES = new Set(["local", "mmf"]);

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
const SAVED_MMF_STORAGE_KEY = "unifab.savedMmfDesignIds";

const MMF_SORT_VALUES = new Set(["relevance", "popularity", "date", "visits"]);
const MMF_ORDER_VALUES = new Set(["asc", "desc"]);
const MMF_LIMIT_VALUES = new Set([12, 24, 36]);

function getStoredSavedMmfDesignIds() {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(SAVED_MMF_STORAGE_KEY) || "[]",
    );

    return Array.isArray(storedIds) ? new Set(storedIds.map(Number)) : new Set();
  } catch {
    return new Set();
  }
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const activeTab = getAllowedSearchValue(
    searchParams,
    "tab",
    DESIGN_TAB_VALUES,
    "local",
  );

  const isLocalTab = activeTab === "local";
  const isMmfTab = activeTab === "mmf";

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
    "relevance",
  );

  const mmfOrder = getAllowedSearchValue(
    searchParams,
    "mmfOrder",
    MMF_ORDER_VALUES,
    "desc",
  );

  const returnTo = `${location.pathname}${location.search}`;

  const [draftSearch, setDraftSearch] = useState({
    submittedSearch,
    value: submittedSearch,
  });
  const searchTerm =
    draftSearch.submittedSearch === submittedSearch
      ? draftSearch.value
      : submittedSearch;
  const setSearchTerm = (value) =>
    setDraftSearch({ submittedSearch, value });
  const [localPagination, setLocalPagination] = useState(
    DEFAULT_LOCAL_PAGINATION,
  );
  const [mmfPagination, setMmfPagination] = useState(DEFAULT_MMF_PAGINATION);

  const [localDesigns, setLocalDesigns] = useState([]);
  const [mmfItems, setMmfItems] = useState([]);
  const [mmfStatus, setMmfStatus] = useState(null);
  const [tabAvailability, setTabAvailability] = useState({
    local: true,
    mmf: true,
  });
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [savedDesignIds, setSavedDesignIds] = useState(() => new Set());
  const [savedMmfDesignIds, setSavedMmfDesignIds] = useState(
    getStoredSavedMmfDesignIds,
  );

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
    let isMounted = true;

    async function loadSavedDesignIds() {
      if (!isAuthenticated) {
        setSavedDesignIds(new Set());
        return;
      }

      try {
        const data = await getSavedDesigns();
        const payload = data.data || data;
        const ids =
          payload.savedDesignIds ||
          (payload.savedDesigns || []).map((design) => design.id);

        if (isMounted) {
          setSavedDesignIds(new Set(ids.map(Number)));
        }
      } catch {
        if (isMounted) {
          setSavedDesignIds(new Set());
        }
      }
    }

    loadSavedDesignIds();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    async function loadDesigns() {
      try {
        setIsLoading(true);
        setError("");

        const params = {
          tab: activeTab,
          localPage,
          localLimit,
          localSort,
        };

        if (submittedSearch) {
          params.q = submittedSearch;
        }

        if (isMmfTab && submittedSearch) {
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
        setTabAvailability(
          payload.tabAvailability || {
            local: localPayload.pagination.totalCount > 0,
            mmf: mmfPayload.pagination.totalCount > 0,
          },
        );
      } catch (err) {
        setError(err.message);
        setLocalDesigns([]);
        setMmfItems([]);
        setMmfStatus(null);
        setTabAvailability({ local: true, mmf: true });
        setLocalPagination(DEFAULT_LOCAL_PAGINATION);
        setMmfPagination(DEFAULT_MMF_PAGINATION);
      } finally {
        setIsLoading(false);
      }
    }

    loadDesigns();
  }, [
    activeTab,
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
    isMmfTab,
  ]);

  const updateUrlFilters = (overrides = {}) => {
    const nextValues = {
      tab: activeTab,
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

    if (nextValues.tab && nextValues.tab !== "local") {
      nextParams.set("tab", nextValues.tab);
    }

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

    if (nextValues.tab === "mmf" && nextValues.q) {
      if (Number(nextValues.mmfPage) > 1) {
        nextParams.set("mmfPage", String(nextValues.mmfPage));
      }

      if (Number(nextValues.mmfPerPage) !== 12) {
        nextParams.set("mmfPerPage", String(nextValues.mmfPerPage));
      }

      if (nextValues.mmfSort && nextValues.mmfSort !== "relevance") {
        nextParams.set("mmfSort", nextValues.mmfSort);
      }

      if (
        nextValues.mmfSort !== "relevance" &&
        nextValues.mmfOrder &&
        nextValues.mmfOrder !== "desc"
      ) {
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

    const nextParams = new URLSearchParams();

    if (activeTab !== "local") {
      nextParams.set("tab", activeTab);
    }

    setSearchParams(nextParams);
  };

  const handleTabChange = (tab) => {
    updateUrlFilters({ tab });
  };

  const handleCategoryChip = (categorySlug) => {
    updateUrlFilters({
      tab: "local",
      category: categorySlug,
      localPage: 1,
    });
  };

  const showLocalTabButton = Boolean(tabAvailability.local);
  const showMmfTabButton = Boolean(tabAvailability.mmf);
  const showCatalogTabs = showLocalTabButton || showMmfTabButton;

  const toggleSavedDesign = async (designId) => {
    if (!isAuthenticated) {
      navigate("/login", {
        state: { from: location.pathname + location.search },
      });
      return;
    }

    const normalizedId = Number(designId);
    const isSaved = savedDesignIds.has(normalizedId);

    setSavedDesignIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (isSaved) {
        nextIds.delete(normalizedId);
      } else {
        nextIds.add(normalizedId);
      }
      return nextIds;
    });

    try {
      if (isSaved) {
        await unsaveDesign(normalizedId);
      } else {
        await saveDesign(normalizedId);
      }
    } catch (err) {
      setError(err.message);
      setSavedDesignIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isSaved) {
          nextIds.add(normalizedId);
        } else {
          nextIds.delete(normalizedId);
        }
        return nextIds;
      });
    }
  };

  const toggleSavedMmfDesign = (objectId) => {
    const normalizedId = Number(objectId);

    setSavedMmfDesignIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(normalizedId)) {
        nextIds.delete(normalizedId);
      } else {
        nextIds.add(normalizedId);
      }

      window.localStorage.setItem(
        SAVED_MMF_STORAGE_KEY,
        JSON.stringify([...nextIds]),
      );

      return nextIds;
    });
  };

  const shareDesignLink = async ({ url, title }) => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Could not share this design right now.");
      }
    }
  };

  const goToPreviousLocalPage = () => {
    updateUrlFilters({
      tab: "local",
      localPage: Math.max(localPagination.page - 1, 1),
    });
  };

  const goToNextLocalPage = () => {
    updateUrlFilters({
      tab: "local",
      localPage: Math.min(localPagination.page + 1, localPagination.totalPages),
    });
  };

  const goToPreviousMmfPage = () => {
    updateUrlFilters({
      tab: "mmf",
      mmfPage: Math.max(mmfPagination.page - 1, 1),
    });
  };

  const goToNextMmfPage = () => {
    updateUrlFilters({
      tab: "mmf",
      mmfPage: Math.min(mmfPagination.page + 1, mmfPagination.totalPages),
    });
  };

  return (
    <PageShell size="xl">
      <Panel>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <PageHeader
            title="Design library"
            description="Browse approved UniFab-hosted designs and search MyMiniFactory references."
          />

          <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
            <TextInput
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={
                isMmfTab
                  ? "Search MyMiniFactory designs"
                  : "Search UniFab designs"
              }
              className="w-64"
            />

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

        {showCatalogTabs && (
          <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            {showLocalTabButton && (
              <CatalogTabButton
                isActive={isLocalTab}
                onClick={() => handleTabChange("local")}
              >
                UniFab Designs
              </CatalogTabButton>
            )}

            {showMmfTabButton && (
              <CatalogTabButton
                isActive={isMmfTab}
                onClick={() => handleTabChange("mmf")}
              >
                MyMiniFactory Designs
              </CatalogTabButton>
            )}
          </div>
        )}

        {isLocalTab && (
          <div className="mt-5 space-y-4">
            {taxonomy.categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Button
                  type="button"
                  size="sm"
                  variant={!categoryFilter ? "primary" : "secondary"}
                  onClick={() => updateUrlFilters({ tab: "local", category: "", localPage: 1 })}
                >
                  All categories
                </Button>
                {taxonomy.categories.slice(0, 10).map((category) => (
                  <Button
                    key={category.id}
                    type="button"
                    size="sm"
                    variant={
                      categoryFilter === category.slug ? "primary" : "secondary"
                    }
                    onClick={() => handleCategoryChip(category.slug)}
                    className="whitespace-nowrap"
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-6 sm:gap-y-3">
            {/* Filter group */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Category
                </span>
                <SelectInput
                  value={categoryFilter}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      category: event.target.value,
                      localPage: 1,
                    })
                  }
                  className="w-40 text-sm"
                >
                  <option value="">All categories</option>
                  {taxonomy.categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </SelectInput>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Tag
                </span>
                <SelectInput
                  value={tagFilter}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      tag: event.target.value,
                      localPage: 1,
                    })
                  }
                  className="w-36 text-sm"
                >
                  <option value="">All tags</option>
                  {taxonomy.tags.map((tag) => (
                    <option key={tag.id} value={tag.slug}>
                      {tag.name}
                    </option>
                  ))}
                </SelectInput>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Source
                </span>
                <SelectInput
                  value={sourceFilter}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      sourceKind: event.target.value,
                      localPage: 1,
                    })
                  }
                  className="w-40 text-sm"
                >
                  <option value="">All sources</option>
                  <option value="lab">Lab designs</option>
                  <option value="community">Community designs</option>
                </SelectInput>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Availability
                </span>
                <SelectInput
                  value={printReadyFilter}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      printReady: event.target.value,
                      localPage: 1,
                    })
                  }
                  className="w-40 text-sm"
                >
                  <option value="">All availability</option>
                  <option value="true">Print Ready</option>
                  <option value="false">Review Only</option>
                </SelectInput>
              </label>
            </div>

            {/* Divider */}
            <div className="hidden self-stretch border-l border-slate-200 sm:block" />

            {/* Sort & display group */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Sort by
                </span>
                <SelectInput
                  value={localSort}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      localSort: event.target.value,
                      localPage: 1,
                    })
                  }
                  className="w-44 text-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title_asc">Title A-Z</option>
                  <option value="title_desc">Title Z-A</option>
                  <option value="print_ready">Print Ready first</option>
                </SelectInput>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Per page
                </span>
                <SelectInput
                  value={localLimit}
                  onChange={(event) =>
                    updateUrlFilters({
                      tab: "local",
                      localLimit: Number(event.target.value),
                      localPage: 1,
                    })
                  }
                  className="w-28 text-sm"
                >
                  <option value={6}>6 / page</option>
                  <option value={12}>12 / page</option>
                  <option value={24}>24 / page</option>
                </SelectInput>
              </label>
            </div>
          </div>
          </div>
        )}

        {isMmfTab && submittedSearch && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Sort by
              </span>
              <SelectInput
                value={mmfSort}
                onChange={(event) =>
                  updateUrlFilters({
                    tab: "mmf",
                    mmfSort: event.target.value,
                    mmfPage: 1,
                  })
                }
                className="w-44 text-sm"
              >
                <option value="relevance">Best match</option>
                <option value="popularity">Most popular</option>
                <option value="date">Newest on MMF</option>
                <option value="visits">Most visited</option>
              </SelectInput>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Order
              </span>
              <SelectInput
                value={mmfOrder}
                onChange={(event) =>
                  updateUrlFilters({
                    tab: "mmf",
                    mmfOrder: event.target.value,
                    mmfPage: 1,
                  })
                }
                disabled={mmfSort === "relevance"}
                className="w-32 text-sm"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </SelectInput>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Per page
              </span>
              <SelectInput
                value={mmfPerPage}
                onChange={(event) =>
                  updateUrlFilters({
                    tab: "mmf",
                    mmfPerPage: Number(event.target.value),
                    mmfPage: 1,
                  })
                }
                className="w-28 text-sm"
              >
                <option value={12}>12 / page</option>
                <option value={24}>24 / page</option>
                <option value={36}>36 / page</option>
              </SelectInput>
            </label>
          </div>
        )}

        {isLoading && <p className="mt-6 text-slate-600">Loading designs...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && (
          <div className="mt-8">
            {isLocalTab && (
              <section>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">
                      UniFab Designs
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
                    title="No UniFab designs available."
                    description="Try changing your search, filters, or sorting options."
                  />
                ) : (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {localDesigns.map((design) => (
                        <LocalDesignCard
                          key={design.id}
                          design={design}
                          returnTo={returnTo}
                          isSaved={savedDesignIds.has(Number(design.id))}
                          onToggleSaved={toggleSavedDesign}
                          onShare={shareDesignLink}
                        />
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
            )}

            {isMmfTab && (
              <section>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">
                      MyMiniFactory Designs
                    </h2>

                    {submittedSearch ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {mmfPagination.totalCount} external result
                        {mmfPagination.totalCount === 1 ? "" : "s"} found -{" "}
                        {mmfPagination.visibleCount} visible on this page
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">
                        Pinned and Print Ready MyMiniFactory references curated
                        by UniFab.
                      </p>
                    )}
                  </div>

                  {mmfStatus && !mmfStatus.available && (
                    <p className="text-sm font-medium text-red-600">
                      {mmfStatus.message || "MyMiniFactory unavailable"}
                    </p>
                  )}
                </div>

                {mmfItems.length === 0 ? (
                  <EmptyState
                    className="mt-4"
                    title={
                      submittedSearch
                        ? "No MyMiniFactory results found."
                        : "No curated MyMiniFactory designs yet."
                    }
                    description={
                      submittedSearch
                        ? "Try a different search term or MMF sorting option."
                        : "Pinned or Print Ready MMF designs will appear here once admins curate them."
                    }
                  />
                ) : (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {mmfItems.map((item) => (
                        <MmfDesignCard
                          key={item.id}
                          item={item}
                          returnTo={returnTo}
                          isSaved={savedMmfDesignIds.has(Number(item.id))}
                          onToggleSaved={toggleSavedMmfDesign}
                          onShare={shareDesignLink}
                        />
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

function CatalogTabButton({ isActive, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
        isActive
          ? "bg-slate-950 text-white shadow-sm"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function getSourceLabel(sourceKind) {
  return sourceKind === "community" ? "Community" : "Official Lab";
}

function DesignCardThumbnail({
  src,
  alt,
  fallback = "No thumbnail",
  badge = null,
}) {
  return (
    <div className="relative flex h-36 items-center justify-center overflow-hidden border-b border-slate-200 bg-slate-100">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-contain p-2 transition duration-200 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          {fallback}
        </div>
      )}

      {badge && <div className="absolute left-3 top-3">{badge}</div>}
    </div>
  );
}

function CardAvailabilityBadge({ isReady, readyLabel = "Print Ready", reviewLabel = "Review Only" }) {
  return (
    <StatusBadge tone={isReady ? "success" : "warning"}>
      {isReady ? readyLabel : reviewLabel}
    </StatusBadge>
  );
}

function IconActionButton({ children, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

function LocalDesignCard({
  design,
  returnTo,
  isSaved = false,
  onToggleSaved,
  onShare,
}) {
  const isPrintReady = Boolean(design.isPrintReady);
  const encodedReturnTo = encodeURIComponent(returnTo || "/designs");
  const detailPath = `/designs/local/${design.id}?returnTo=${encodedReturnTo}`;
  const quotePath = `${detailPath}#quote`;
  const shareUrl = `${window.location.origin}${detailPath}`;

  return (
    <article className="group flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <Link to={detailPath} className="block">
        <DesignCardThumbnail
          src={assetUrl(design.thumbnailUrl)}
          alt={design.title || "Design thumbnail"}
          badge={
            design.isFeatured ? (
              <StatusBadge tone="success">Featured</StatusBadge>
            ) : null
          }
        />

        <div className="p-4 pb-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <StatusBadge>{getSourceLabel(design.sourceKind)}</StatusBadge>
            {design.category?.name && (
              <StatusBadge tone="neutral">{design.category.name}</StatusBadge>
            )}
          </div>

          <h3 className="line-clamp-2 font-semibold text-slate-950">
            {design.title || "Untitled design"}
          </h3>

          <p className="mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6 text-slate-600">
            {design.description || "No description provided."}
          </p>
        </div>
      </Link>

      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <CardAvailabilityBadge isReady={isPrintReady} />
          <div className="flex gap-2">
            <IconActionButton
              label={isSaved ? "Remove from saved designs" : "Save design"}
              onClick={(event) => {
                event.preventDefault();
                onToggleSaved?.(design.id);
              }}
            >
              {isSaved ? (
                <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden="true" />
              )}
            </IconActionButton>

            <IconActionButton
              label="Share design"
              onClick={(event) => {
                event.preventDefault();
                onShare?.({
                  url: shareUrl,
                  title: design.title || "UniFab design",
                });
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </IconActionButton>
          </div>
        </div>

        <div className="mt-3">
          <ButtonLink
            to={isPrintReady ? quotePath : detailPath}
            size="md"
            variant={isPrintReady ? "primary" : "secondary"}
            className="w-full"
          >
            {isPrintReady ? "Instant Quote" : "View Details"}
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

function MmfDesignCard({
  item,
  returnTo,
  isSaved = false,
  onToggleSaved,
  onShare,
}) {
  const isPrintReady = Boolean(item.override?.isPrintReady);
  const thumbnailUrl = getMmfThumbnailUrl(item);
  const title = item.name || item.title || `Object ${item.id}`;
  const encodedReturnTo = encodeURIComponent(returnTo || "/designs");
  const detailPath = `/designs/mmf/${item.id}?returnTo=${encodedReturnTo}`;
  const shareUrl = `${window.location.origin}${detailPath}`;

  return (
    <article className="group flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <DesignCardThumbnail src={thumbnailUrl} alt={title} />

      <Link to={detailPath} className="block p-4 pb-0">
        <div className="mb-2 flex flex-wrap gap-2">
          <StatusBadge>MyMiniFactory</StatusBadge>
        </div>

        <h3 className="line-clamp-2 font-semibold text-slate-950">{title}</h3>

        <p className="mt-2 line-clamp-2 min-h-[3rem] text-sm leading-6 text-slate-600">
          {item.description || "No description provided."}
        </p>

        {item.override?.clientNote && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
            {item.override.clientNote}
          </p>
        )}
      </Link>

      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <CardAvailabilityBadge
            isReady={isPrintReady}
            readyLabel="Print Ready"
            reviewLabel="Needs Review"
          />
          <div className="flex gap-2">
            <IconActionButton
              label={isSaved ? "Remove saved MMF design" : "Save MMF design"}
              onClick={() => onToggleSaved?.(item.id)}
            >
              {isSaved ? (
                <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Bookmark className="h-4 w-4" aria-hidden="true" />
              )}
            </IconActionButton>

            <IconActionButton
              label="Share design"
              onClick={() =>
                onShare?.({
                  url: shareUrl,
                  title,
                })
              }
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </IconActionButton>
          </div>
        </div>

        <Link
          to={detailPath}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
