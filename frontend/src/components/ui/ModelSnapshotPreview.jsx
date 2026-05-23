import { useMemo, useState } from "react";
import { normalizeModelPreview } from "../../utils/model-preview";
import { ModelPreviewModal } from "./ModelPreviewModal";
import { ModelViewer } from "./ModelViewer";

export function ModelSnapshotPreview({
  source,
  className = "",
  imageClassName = "h-full w-full object-contain",
  fallbackClassName = "flex h-full w-full items-center justify-center text-xs text-slate-500",
  fallbackLabel = "Open 3D preview",
  modalTitle = "Model preview",
  viewerClassName = "h-64",
  disabledTitle,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const descriptor = useMemo(() => normalizeModelPreview(source), [source]);
  const title =
    descriptor.canPreview
      ? `Open ${descriptor.fileName || "model"} preview`
      : disabledTitle || descriptor.errorReason;

  const content = descriptor.snapshotUrl ? (
    <img
      src={descriptor.snapshotUrl}
      alt={descriptor.fileName || "Model snapshot"}
      className={imageClassName}
    />
  ) : (
    <div className={fallbackClassName}>
      {descriptor.canPreview ? fallbackLabel : "No preview"}
    </div>
  );

  if (!descriptor.canPreview) {
    return (
      <div
        className={`${className} cursor-not-allowed overflow-hidden opacity-75`}
        title={title}
        aria-label={title}
      >
        {content}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${className} overflow-hidden text-left`}
        title={title}
        aria-label={title}
      >
        {content}
      </button>

      <ModelPreviewModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={modalTitle}
      >
        <ModelViewer
          file={descriptor.file}
          url={descriptor.modelUrl}
          fileName={descriptor.fileName}
          extension={descriptor.extension}
          className={viewerClassName}
        />
      </ModelPreviewModal>
    </>
  );
}
