export function ModelPreviewModal({
  isOpen,
  onClose,
  title = "Model preview",
  children,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 p-4">
      <div className="mx-auto max-w-5xl rounded-lg bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
