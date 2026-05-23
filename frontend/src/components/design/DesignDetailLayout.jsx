import { ButtonLink } from "../ui/Button";

export function ModelDetailShell({
  backTo,
  backLabel = "Back to designs",
  children,
}) {
  return (
    <div className="space-y-6">
      <ButtonLink to={backTo} variant="secondary" size="sm">
        {backLabel}
      </ButtonLink>
      {children}
    </div>
  );
}

export function ModelDetailHero({ media, summary, joined = false }) {
  if (joined) {
    return (
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,760px)_360px] lg:items-stretch">
        <div className="min-w-0 lg:border-r lg:border-slate-200">{media}</div>
        <aside className="min-w-0">{summary}</aside>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,760px)_360px] lg:items-start">
      <div className="min-w-0">{media}</div>
      <aside className="min-w-0 lg:sticky lg:top-24">{summary}</aside>
    </div>
  );
}

export function ModelMedia({
  imageUrl,
  alt,
  fallback,
  caption,
  onPreview,
  previewLabel = "Open 3D preview",
}) {
  const hasPreview = Boolean(onPreview);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onPreview}
        disabled={!hasPreview}
        className={`group relative flex aspect-[4/3] min-h-80 w-full items-center justify-center bg-slate-100 text-left ${
          hasPreview ? "cursor-zoom-in" : "cursor-default"
        }`}
        aria-label={previewLabel}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={alt}
            className="h-full w-full object-contain transition duration-200 group-enabled:group-hover:scale-[1.01]"
          />
        ) : (
          <p className="px-6 text-center text-sm text-slate-500">{fallback}</p>
        )}

        {hasPreview && (
          <span className="absolute bottom-4 right-4 rounded-md bg-slate-950/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
            Open 3D preview
          </span>
        )}
      </button>
      {caption && (
        <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
          {caption}
        </div>
      )}
    </section>
  );
}

export function SummaryPanel({
  eyebrow,
  title,
  badges,
  children,
  embedded = false,
}) {
  return (
    <section
      className={
        embedded
          ? "h-full bg-white p-5 sm:p-6"
          : "rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-slate-950">
        {title}
      </h1>
      {badges && <div className="mt-4 flex flex-wrap gap-2">{badges}</div>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function DetailColumn({ children }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,760px)_360px]">
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-5 shadow-sm sm:px-6">
        {children}
      </div>
      <div className="hidden lg:block" />
    </div>
  );
}

export function DetailTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex border-b border-slate-200 bg-slate-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`min-h-14 flex-1 border-b-2 px-4 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "border-slate-950 bg-white text-slate-950"
                : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <span>{tab.label}</span>
            {tab.meta && (
              <span className="ml-2 text-xs font-medium text-slate-400">
                {tab.meta}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="px-6 sm:px-8 lg:px-10">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}

export function DetailSection({ title, description, children }) {
  return (
    <section className="border-b border-slate-200 py-8 last:border-b-0">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function MetadataGrid({ items }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="font-medium text-slate-500">{item.label}</dt>
          <dd className="mt-1 font-semibold text-slate-950">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FileSummaryRow({ label, description, action, status = null }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-950">{label}</p>
          {status}
        </div>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
