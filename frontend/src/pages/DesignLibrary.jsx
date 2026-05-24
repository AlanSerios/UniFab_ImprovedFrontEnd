import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import {
  DEFAULT_LOCAL_PAGINATION,
  DEFAULT_MMF_PAGINATION,
  DESIGN_TAB_VALUES,
  LOCAL_SORT_VALUES,
  MMF_ORDER_VALUES,
  MMF_SORT_VALUES,
  PRINT_READY_FILTER_VALUES,
  SAVED_MMF_STORAGE_KEY,
  SOURCE_FILTER_VALUES,
  assetUrl,
  getAllowedSearchValue,
  getLocalLimitSearchValue,
  getMmfLimitSearchValue,
  getMmfThumbnailUrl,
  getPositiveIntegerSearchValue,
  getSearchValue,
  getStoredSavedMmfDesignIds,
  parseLocalDesignPayload,
  parseMmfPaginationPayload,
} from "../utils/design-library";

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
      <Panel className="unifab-library">
        <div className="unifab-library__hero">
          <div>
            <p className="unifab-library__eyebrow">Design Library</p>
            <PageHeader
              title="Find a model to print"
              description="Browse UniFab-hosted designs or search external MyMiniFactory references curated by the lab."
            />
          </div>

          <form onSubmit={handleSubmit} className="unifab-library__search">
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
          <div className="unifab-library__tabs">
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
          <div className="unifab-library__filters">
            {taxonomy.categories.length > 0 && (
              <div className="unifab-library__chips">
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

          <div className="unifab-library__filter-row">
            <div className="unifab-library__filter-group">
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

            <div className="unifab-library__filter-group unifab-library__filter-group--compact">
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
          <div className="unifab-library__filters unifab-library__filter-row">
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
          <div className="unifab-library__results">
            {isLocalTab && (
              <section>
                <div className="unifab-library__section-head">
                  <div>
                    <h2>
                      UniFab Designs
                    </h2>
                    <p>
                      {localPagination.totalCount} result
                      {localPagination.totalCount === 1 ? "" : "s"} found
                    </p>
                  </div>

                  <p>
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
                    <div className="unifab-library__grid">
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
                <div className="unifab-library__section-head">
                  <div>
                    <h2>
                      MyMiniFactory Designs
                    </h2>

                    {submittedSearch ? (
                      <p>
                        {mmfPagination.totalCount} external result
                        {mmfPagination.totalCount === 1 ? "" : "s"} found -{" "}
                        {mmfPagination.visibleCount} visible on this page
                      </p>
                    ) : (
                      <p>
                        Pinned and Print Ready MyMiniFactory references curated
                        by UniFab.
                      </p>
                    )}
                  </div>

                  {mmfStatus && !mmfStatus.available && (
                    <p className="unifab-library__warning">
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
                    <div className="unifab-library__grid">
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
      className={`unifab-library__tab rounded-md px-4 py-2 text-sm font-semibold transition ${
        isActive
          ? "is-active bg-slate-950 text-white shadow-sm"
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
    <div className="unifab-design-card__media unifab-library-card__thumb">
      {src ? (
        <img
          src={src}
          alt={alt}
          className="transition duration-300 group-hover:scale-[1.025]"
        />
      ) : (
        <div className="unifab-design-card__empty-thumb">
          {fallback}
        </div>
      )}

      {badge && <div className="unifab-design-card__media-badge">{badge}</div>}
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
      className="unifab-library-card__icon-button inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
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
    <article className="unifab-design-card unifab-library-card group">
      <Link to={detailPath} className="unifab-design-card__link">
        <DesignCardThumbnail
          src={assetUrl(design.thumbnailUrl)}
          alt={design.title || "Design thumbnail"}
          badge={
            design.isFeatured ? (
              <StatusBadge tone="success">Featured</StatusBadge>
            ) : null
          }
        />

        <div className="unifab-design-card__body">
          <div className="unifab-design-card__meta">
            <StatusBadge>{getSourceLabel(design.sourceKind)}</StatusBadge>
            {design.category?.name && (
              <StatusBadge tone="neutral">{design.category.name}</StatusBadge>
            )}
          </div>

          <h3 className="unifab-design-card__title line-clamp-2">
            {design.title || "Untitled design"}
          </h3>

          <p className="unifab-design-card__description line-clamp-2">
            {design.description || "No description provided."}
          </p>
        </div>
      </Link>

      <div className="unifab-design-card__footer unifab-library-card__footer">
        <div className="unifab-design-card__status-row">
          <CardAvailabilityBadge isReady={isPrintReady} />
          <div className="unifab-design-card__icon-actions">
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

        <div className="unifab-design-card__primary-action">
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
    <article className="unifab-design-card unifab-library-card group">
      <DesignCardThumbnail src={thumbnailUrl} alt={title} />

      <Link to={detailPath} className="unifab-design-card__body">
        <div className="unifab-design-card__meta">
          <StatusBadge>MyMiniFactory</StatusBadge>
        </div>

        <h3 className="unifab-design-card__title line-clamp-2">{title}</h3>

        <p className="unifab-design-card__description line-clamp-2">
          {item.description || "No description provided."}
        </p>

        {item.override?.clientNote && (
          <p className="unifab-design-card__note line-clamp-2">
            {item.override.clientNote}
          </p>
        )}
      </Link>

      <div className="unifab-design-card__footer unifab-library-card__footer">
        <div className="unifab-design-card__status-row">
          <CardAvailabilityBadge
            isReady={isPrintReady}
            readyLabel="Print Ready"
            reviewLabel="Needs Review"
          />
          <div className="unifab-design-card__icon-actions">
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
          className="unifab-design-card__secondary-link"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}
