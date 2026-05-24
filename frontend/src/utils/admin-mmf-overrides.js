export const FILTERS = [
  { key: "all", label: "All" },
  { key: "print_ready", label: "Print Ready" },
  { key: "hidden", label: "Hidden" },
  { key: "pinned", label: "Pinned" },
  { key: "needs_file", label: "Needs Cached File" },
];

export const EMPTY_OVERRIDE_EDIT_FORM = {
  isHidden: false,
  isPinned: false,
  isPrintReady: false,
  clientNote: "",
  verificationConfirmed: false,
  verificationNote: "",
};

export function getClientNotePreview(note) {
  if (!note) return "-";

  const normalizedNote = String(note).trim();
  if (normalizedNote.length <= 80) return normalizedNote;

  return `${normalizedNote.slice(0, 77)}...`;
}

export function getFiltersFromSearchParams(searchParams) {
  return {
    filter: searchParams.get("filter") || "all",
    search: searchParams.get("search") || "",
    page: Number(searchParams.get("page") || 1),
    limit: Number(searchParams.get("limit") || 20),
  };
}

export function applyOverrideFilterParams({
  searchParams,
  nextValues,
  setSearchParams,
}) {
  const next = new URLSearchParams(searchParams);

  Object.entries(nextValues).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") {
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

export function extractOverridesPayload(data) {
  const payload = data.data || data;

  return {
    designOverrides: payload.designOverrides || [],
    counts: payload.counts || null,
    pagination: payload.pagination || null,
  };
}

export function overrideToEditForm(override) {
  return {
    isHidden: Boolean(override.isHidden),
    isPinned: Boolean(override.isPinned),
    isPrintReady: Boolean(override.isPrintReady),
    clientNote: override.clientNote || "",
    verificationConfirmed: false,
    verificationNote: "",
  };
}

export function hasMeaningfulOverride(editForm) {
  return (
    editForm.isHidden ||
    editForm.isPinned ||
    editForm.isPrintReady ||
    editForm.clientNote.trim() !== ""
  );
}

export function buildOverrideUpdatePayload({ editForm, override }) {
  return {
    isHidden: editForm.isHidden,
    isPinned: editForm.isPinned,
    isPrintReady: editForm.isPrintReady,
    clientNote: editForm.clientNote.trim(),
    verificationConfirmed:
      editForm.isPrintReady && !override.isPrintReady ? true : undefined,
    verificationNote:
      editForm.isPrintReady && !override.isPrintReady
        ? editForm.verificationNote
        : undefined,
  };
}

export function extractUpdatedOverride(data) {
  return data.data?.designOverride || data.designOverride || data.override || data;
}

export function getFilterCount(counts, key) {
  if (!counts) return null;
  if (key === "all") return counts.total ?? null;
  if (key === "print_ready") return counts.printReady ?? null;
  if (key === "hidden") return counts.hidden ?? null;
  if (key === "pinned") return counts.pinned ?? null;
  if (key === "needs_file") return counts.needsFile ?? null;
  return null;
}
