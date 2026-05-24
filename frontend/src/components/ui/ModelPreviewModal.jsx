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
    <div className="unifab-model-preview-modal fixed inset-0 z-50 bg-slate-950/70 p-4">
      <div
        className="unifab-model-preview-modal__panel mx-auto rounded-lg bg-white p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="unifab-model-preview-modal__header mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="unifab-model-preview-modal__close rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold"
          >
            Close
          </button>
        </div>
        <div className="unifab-model-preview-modal__body">{children}</div>
      </div>
    </div>
  );
}
