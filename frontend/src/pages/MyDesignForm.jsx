import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FilePlus,
  ImagePlus,
  RefreshCw,
  Save,
  Send,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createMyDesignDraft,
  deleteMyDesign,
  getDesignTaxonomy,
  getMyDesigns,
  publishMyDesign,
  updateMyDesign,
} from "../api/designs";
import { API_BASE_URL } from "../api/client";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { TextArea, TextInput } from "../components/ui/Form";
import {
  getModerationStatusLabel,
  getOwnerModerationMessage,
  getPublishResultMessage,
  getSaveResultMessage,
} from "../utils/moderation-display";

const PUBLISHABLE_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
]);
const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}

function buildFormData({ form, designFiles, thumbnailImages, assetState }) {
  const fd = new FormData();
  fd.append("title", form.title);
  fd.append("description", form.description);
  fd.append("categoryId", form.categoryId);
  fd.append("tagIds", form.tagIds.join(","));
  fd.append("licenseType", form.licenseType);
  fd.append("ownershipConfirmed", String(form.ownershipConfirmed));
  fd.append("policyAcknowledged", String(form.policyAcknowledged));
  fd.append("removeFileIds", assetState.removeFileIds.join(","));
  fd.append("removeImageIds", assetState.removeImageIds.join(","));
  fd.append("fileOrder", JSON.stringify(assetState.fileOrder));
  fd.append("imageOrder", JSON.stringify(assetState.imageOrder));
  if (assetState.primaryFileId)
    fd.append("primaryFileId", String(assetState.primaryFileId));
  if (assetState.primaryImageId)
    fd.append("primaryImageId", String(assetState.primaryImageId));
  if (assetState.replaceFileId && assetState.replacementFile) {
    fd.append("replaceFileId", String(assetState.replaceFileId));
    fd.append("designFiles", assetState.replacementFile);
  }
  if (assetState.replaceImageId && assetState.replacementImage) {
    fd.append("replaceImageId", String(assetState.replaceImageId));
    fd.append("thumbnailImages", assetState.replacementImage);
  }
  for (const f of designFiles) fd.append("designFiles", f);
  for (const f of thumbnailImages) fd.append("thumbnailImages", f);
  return fd;
}

function activeFiles(design) {
  return (design?.files || []).filter(
    (f) =>
      (f.status || "active") === "active" &&
      (f.storageStatus || "present") === "present",
  );
}
function activeImages(design) {
  return (design?.images || []).filter(
    (i) =>
      (i.status || "active") === "active" &&
      (i.storageStatus || "present") === "present",
  );
}
function toAssetState(design) {
  const files = activeFiles(design);
  const images = activeImages(design);
  return {
    removeFileIds: [],
    removeImageIds: [],
    replaceFileId: "",
    replaceImageId: "",
    replacementFile: null,
    replacementImage: null,
    primaryFileId: files.find((f) => f.isPrimary)?.id || files[0]?.id || "",
    primaryImageId: images.find((i) => i.isPrimary)?.id || images[0]?.id || "",
    fileOrder: files.map((f) => Number(f.id)).filter(Boolean),
    imageOrder: images.map((i) => Number(i.id)).filter(Boolean),
  };
}
function toFormState(design) {
  return {
    title: design?.title === "Untitled draft" ? "" : design?.title || "",
    description: design?.description || "",
    categoryId: design?.category?.id ? String(design.category.id) : "",
    tagIds: (design?.tags || []).map((t) => String(t.id)),
    licenseType: design?.licenseType || "",
    ownershipConfirmed: Boolean(design?.ownershipConfirmed),
    policyAcknowledged: Boolean(design?.policyAcknowledged),
  };
}
function formatFileSize(bytes) {
  const v = Number(bytes);
  if (!v || Number.isNaN(v)) return "";
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} kB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}
function getOrderIndex(order, id, fallbackIndex) {
  const i = order.findIndex((x) => Number(x) === Number(id));
  return i < 0 ? fallbackIndex + 1000 : i;
}

const T = {
  bg: "#f8fafc",
  panel: "#ffffff",
  border: "#e2e8f0",
  borderSub: "#f1f5f9",
  accent: "#0f172a",
  accentHov: "#1e293b",
  text: "#020617",
  textMid: "#475569",
  textDim: "#64748b",
  danger: "#dc2626",
  green: "#047857",
  inputBg: "#ffffff",
  infoBg: "#eff6ff",
  infoBorder: "#bfdbfe",
  infoText: "#1d4ed8",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
  warningText: "#92400e",
};

const inputStyle = {
  width: "100%",
  background: T.inputBg,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.text,
  fontSize: 14,
  padding: "8px 10px",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: T.textMid,
  marginBottom: 6,
  textTransform: "uppercase",
};

function Section({ title, children }) {
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div
        style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: T.text,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ padding: "18px 20px" }}>{children}</div>
    </div>
  );
}

function UploadZone({
  accept,
  description,
  icon: Icon,
  inputId,
  onChange,
  selectedFiles,
  title,
}) {
  const [hover, setHover] = useState(false);
  return (
    <div>
      <label
        htmlFor={inputId}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          minHeight: 150,
          border: `1px dashed ${hover ? T.textMid : T.border}`,
          borderRadius: 6,
          background: hover ? "#f1f5f9" : "#f8fafc",
          cursor: "pointer",
          padding: "20px 16px",
          textAlign: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 8,
            background: "#ffffff",
            color: T.accent,
            border: `1px solid ${T.border}`,
          }}
        >
          <Icon size={20} />
        </span>
        <span>
          <span
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: T.text,
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: T.textMid,
              marginTop: 2,
              maxWidth: 220,
            }}
          >
            {description}
          </span>
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: T.accent,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            padding: "6px 16px",
            borderRadius: 3,
            textTransform: "uppercase",
          }}
        >
          <Upload size={13} /> Browse
        </span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple
          style={{ display: "none" }}
          onChange={onChange}
        />
      </label>
      {selectedFiles.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}
        >
          {selectedFiles.map((file) => (
            <span
              key={`${file.name}-${file.size}`}
              style={{
                background: T.border,
                color: T.textMid,
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 2,
              }}
            >
              {file.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetRow({
  accept,
  canMoveDown,
  canMoveUp,
  isPrimary,
  isPrintReady,
  kind,
  meta,
  name,
  onMoveDown,
  onMoveUp,
  onPrimary,
  onRemove,
  onReplace,
  previewUrl,
  previewSource,
  replacementName,
}) {
  const isImage = kind === "image";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "54px 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        background: "#ffffff",
        border: `1px solid ${T.border}`,
        borderRadius: 6,
      }}
    >
      {/* Thumb */}
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 6,
          background: "#f8fafc",
          border: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {!isImage && previewSource ? (
          <ModelSnapshotPreview
            source={previewSource}
            className="h-full w-full"
            imageClassName="h-full w-full object-contain"
            fallbackClassName="flex h-full w-full items-center justify-center text-slate-500"
            fallbackLabel="Preview"
            viewerClassName="h-80"
          />
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : isImage ? (
          <ImagePlus size={18} color={T.textDim} />
        ) : (
          <FilePlus size={18} color={T.textDim} />
        )}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        {(isPrimary || isPrintReady) && (
          <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
            {isPrimary && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  background: T.accent,
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  borderRadius: 2,
                  textTransform: "uppercase",
                }}
              >
                <Star size={8} /> Primary
              </span>
            )}
            {isPrintReady && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  background: "#ecfdf5",
                  color: T.green,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "2px 6px",
                  borderRadius: 2,
                  textTransform: "uppercase",
                }}
              >
                <Check size={8} /> Print Ready
              </span>
            )}
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: T.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </p>
        {meta && (
          <p style={{ margin: "2px 0 0", fontSize: 11, color: T.textDim }}>
            {meta}
          </p>
        )}
        {replacementName && (
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 11,
              color: T.infoText,
              fontStyle: "italic",
            }}
          >
            Replacement queued: {replacementName}
          </p>
        )}
      </div>

      {/* Actions */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}
      >
        <IconBtn onClick={onPrimary} active={isPrimary} title="Set primary">
          <Star size={12} />
        </IconBtn>
        <IconBtn onClick={onMoveUp} disabled={!canMoveUp} title="Move up">
          <ArrowUp size={12} />
        </IconBtn>
        <IconBtn onClick={onMoveDown} disabled={!canMoveDown} title="Move down">
          <ArrowDown size={12} />
        </IconBtn>
        <label
          title="Replace"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            color: T.textMid,
            cursor: "pointer",
            background: "#ffffff",
          }}
        >
          <RefreshCw size={12} />
          <input
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={onReplace}
          />
        </label>
        <IconBtn onClick={onRemove} danger title="Remove">
          <Trash2 size={12} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, active, danger, title }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        padding: 0,
        border: `1px solid ${active ? T.accent : hover && !disabled ? (danger ? "#fecaca" : "#cbd5e1") : T.border}`,
        borderRadius: 6,
        background: active ? "#f1f5f9" : hover && !disabled ? "#f8fafc" : "#ffffff",
        color: danger
          ? hover && !disabled
            ? "#ff8080"
            : T.danger
          : active
            ? T.accent
            : hover && !disabled
              ? T.text
              : T.textMid,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
        transition: "all 0.12s",
        lineHeight: 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function OrangeBtn({
  children,
  onClick,
  type = "button",
  disabled,
  fullWidth,
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: fullWidth ? "100%" : undefined,
        background: disabled ? "#5a3020" : hover ? T.accentHov : T.accent,
        color: disabled ? "#a06050" : "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "9px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        textTransform: "uppercase",
        transition: "background 0.15s",
        boxSizing: "border-box",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function OutlineBtn({
  children,
  onClick,
  type = "button",
  disabled,
  fullWidth,
  danger,
}) {
  const [hover, setHover] = useState(false);
  const base = danger ? T.danger : T.textDim;
  const hov = danger ? "#ff8080" : T.text;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: fullWidth ? "100%" : undefined,
        background: "transparent",
        color: disabled ? T.textDim : hover ? hov : base,
        border: `1px solid ${disabled ? T.border : hover ? hov : base}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        padding: "8px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        textTransform: "uppercase",
        transition: "all 0.12s",
        boxSizing: "border-box",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
  );
}

function FormField({ label, hint, required, children }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: T.accent, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: T.textDim }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function EmptySlot({ children }) {
  return (
    <div
      style={{
        border: `1px dashed ${T.border}`,
        borderRadius: 6,
        padding: "18px 14px",
        textAlign: "center",
        fontSize: 12,
        color: T.textDim,
      }}
    >
      {children}
    </div>
  );
}

function DarkRadio({ label, sublabel, checked, onChange, name, value }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
        padding: "11px 0",
        borderBottom: `1px solid ${T.borderSub}`,
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 2, accentColor: T.accent, flexShrink: 0 }}
      />
      <span>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: checked ? T.text : T.text,
          }}
        >
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: T.textDim,
              marginTop: 1,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
    </label>
  );
}

function DarkCheckbox({ label, sublabel, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: "pointer",
        padding: "9px 0",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{
          marginTop: 2,
          accentColor: T.accent,
          flexShrink: 0,
          width: 14,
          height: 14,
        }}
      />
      <span>
        <span style={{ display: "block", fontSize: 13, color: T.text }}>
          {label}
        </span>
        {sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: T.textDim,
              marginTop: 1,
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
    </label>
  );
}

export default function MyDesignForm() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(designId);

  const [form, setForm] = useState(() => toFormState(null));
  const [currentDesign, setCurrentDesign] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [designFiles, setDesignFiles] = useState([]);
  const [thumbnailImages, setThumbnailImages] = useState([]);
  const [assetState, setAssetState] = useState({
    removeFileIds: [],
    removeImageIds: [],
    replaceFileId: "",
    replaceImageId: "",
    replacementFile: null,
    replacementImage: null,
    primaryFileId: "",
    primaryImageId: "",
    fileOrder: [],
    imageOrder: [],
  });
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDesign = useCallback(async () => {
    if (!isEditing) return;
    try {
      setError("");
      const data = await getMyDesigns();
      const payload = data.data || data;
      const match = (payload.localDesigns || []).find(
        (d) => Number(d.id) === Number(designId),
      );
      if (!match) throw new Error("Design not found.");
      setCurrentDesign(match);
      setForm(toFormState(match));
      setAssetState(toAssetState(match));
    } catch (err) {
      setError(err.message);
      setCurrentDesign(null);
    } finally {
      setIsLoading(false);
    }
  }, [designId, isEditing]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await getDesignTaxonomy();
        const p = data.data || data;
        if (live)
          setTaxonomy({ categories: p.categories || [], tags: p.tags || [] });
      } catch {
        if (live) setTaxonomy({ categories: [], tags: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!isEditing) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await getMyDesigns();
        const p = data.data || data;
        const match = (p.localDesigns || []).find(
          (d) => Number(d.id) === Number(designId),
        );
        if (!match) throw new Error("Design not found.");
        if (live) {
          setCurrentDesign(match);
          setForm(toFormState(match));
          setAssetState(toAssetState(match));
        }
      } catch (err) {
        if (live) {
          setError(err.message);
          setCurrentDesign(null);
        }
      } finally {
        if (live) setIsLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [designId, isEditing]);

  const canPublish = useMemo(
    () =>
      currentDesign && PUBLISHABLE_STATUSES.has(currentDesign.moderationStatus),
    [currentDesign],
  );

  const updateField = (field, value) =>
    setForm((f) => ({ ...f, [field]: value }));
  const updateSelectedTags = (e) =>
    updateField(
      "tagIds",
      Array.from(e.target.selectedOptions).map((o) => o.value),
    );
  const updateAssetState = (patch) =>
    setAssetState((s) => ({ ...s, ...patch }));

  const markFileForRemoval = (fileId) => {
    const id = Number(fileId);
    updateAssetState({
      removeFileIds: [...new Set([...assetState.removeFileIds, id])],
      fileOrder: assetState.fileOrder.filter((x) => Number(x) !== id),
      primaryFileId:
        Number(assetState.primaryFileId) === id ? "" : assetState.primaryFileId,
    });
  };
  const markImageForRemoval = (imageId) => {
    const id = Number(imageId);
    updateAssetState({
      removeImageIds: [...new Set([...assetState.removeImageIds, id])],
      imageOrder: assetState.imageOrder.filter((x) => Number(x) !== id),
      primaryImageId:
        Number(assetState.primaryImageId) === id
          ? ""
          : assetState.primaryImageId,
    });
  };
  const moveInOrder = (kind, id, dir) => {
    const key = kind === "file" ? "fileOrder" : "imageOrder";
    const order = [...assetState[key]];
    const i = order.findIndex((x) => Number(x) === Number(id));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    updateAssetState({ [key]: order });
  };

  const handleDeleteDesign = async () => {
    if (
      !window.confirm(
        "Delete this design? It will be hidden from public browsing. Audit history is retained.",
      )
    )
      return;
    try {
      setIsDeleting(true);
      setError("");
      await deleteMyDesign(designId);
      navigate("/my-designs");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const saveDesign = async () => {
    const fd = buildFormData({
      form,
      designFiles,
      thumbnailImages,
      assetState,
    });
    if (isEditing) {
      const data = await updateMyDesign(designId, fd);
      const saved = data.data?.localDesign || data.localDesign;
      setCurrentDesign(saved || currentDesign);
      setAssetState(toAssetState(saved || currentDesign));
      return saved || currentDesign;
    }
    const data = await createMyDesignDraft(fd);
    return data.data?.localDesign || data.localDesign;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      setError("");
      setSuccessMessage("");
      const saved = await saveDesign();
      if (!isEditing && saved?.id) {
        navigate(`/my-designs/${saved.id}`);
        return;
      }
      setDesignFiles([]);
      setThumbnailImages([]);
      setSuccessMessage(getSaveResultMessage(saved));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!currentDesign?.id) return;
    if (!form.categoryId) {
      setError("Select a category before publishing.");
      return;
    }
    try {
      setIsPublishing(true);
      setError("");
      setSuccessMessage("");
      const saved = await saveDesign();
      const data = await publishMyDesign(saved?.id || currentDesign.id);
      const p = data.data || data;
      const updated = p.localDesign || p.design;
      await loadDesign();
      setDesignFiles([]);
      setThumbnailImages([]);
      setSuccessMessage(getPublishResultMessage(updated));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const visibleModelFiles = useMemo(
    () =>
      activeFiles(currentDesign)
        .filter((f) => !assetState.removeFileIds.includes(Number(f.id)))
        .map((f, i) => ({ file: f, index: i }))
        .sort(
          (a, b) =>
            getOrderIndex(assetState.fileOrder, a.file.id, a.index) -
            getOrderIndex(assetState.fileOrder, b.file.id, b.index),
        )
        .map(({ file }) => file),
    [assetState.fileOrder, assetState.removeFileIds, currentDesign],
  );

  const visiblePreviewImages = useMemo(
    () =>
      activeImages(currentDesign)
        .filter((i) => !assetState.removeImageIds.includes(Number(i.id)))
        .map((img, idx) => ({ image: img, index: idx }))
        .sort(
          (a, b) =>
            getOrderIndex(assetState.imageOrder, a.image.id, a.index) -
            getOrderIndex(assetState.imageOrder, b.image.id, b.index),
        )
        .map(({ image }) => image),
    [assetState.imageOrder, assetState.removeImageIds, currentDesign],
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
        fontSize: 14,
      }}
    >
      <div
        style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 60px" }}
      >
        {/* Page title */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 22,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: T.text,
                letterSpacing: "-0.02em",
              }}
            >
              {isEditing
                ? `Edit Model${currentDesign?.title ? `: ${currentDesign.title}` : ""}`
                : "New Design"}
            </h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: T.textDim }}>
              Fill in each section, save as a draft, then publish for review.
            </p>
          </div>
          <a
            href="/my-designs"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.textMid,
              textDecoration: "none",
              letterSpacing: "0.04em",
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "6px 12px",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Back to My Designs
          </a>
        </div>

        {/* Alerts */}
        {isLoading && (
          <p style={{ color: T.textDim, fontSize: 13, marginBottom: 14 }}>
            Loading...
          </p>
        )}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 13,
              color: T.danger,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}
        {successMessage && (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 13,
              color: T.green,
              marginBottom: 14,
            }}
          >
            {successMessage}
          </div>
        )}
        {currentDesign && getOwnerModerationMessage(currentDesign) && (
          <div
            style={{
              background: T.infoBg,
              border: `1px solid ${T.infoBorder}`,
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 13,
              color: T.infoText,
              marginBottom: 14,
            }}
          >
            {getOwnerModerationMessage(currentDesign)}
          </div>
        )}
        {currentDesign &&
          APPROVED_STATUSES.has(currentDesign.moderationStatus) && (
            <div
              style={{
                background: T.warningBg,
                border: `1px solid ${T.warningBorder}`,
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 13,
                color: T.warningText,
                marginBottom: 14,
              }}
            >
              Editing an approved design runs automated screening again. Only
              flagged edits need FabLab review.
            </div>
          )}

        {/* Two-column form */}
        {!isLoading && (
          <form
            onSubmit={handleSave}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 256px",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Basic information */}
              <Section title="Basic information">
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <FormField label="Model name" required>
                    <TextInput
                      value={form.title}
                      onChange={(e) => updateField("title", e.target.value)}
                      placeholder="e.g. Sensor bracket"
                      style={inputStyle}
                    />
                  </FormField>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <FormField label="Main category" required>
                      <select
                        value={form.categoryId}
                        onChange={(e) =>
                          updateField("categoryId", e.target.value)
                        }
                        style={{ ...inputStyle }}
                      >
                        <option value="">Select category</option>
                        {taxonomy.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField
                      label="Additional tags"
                      hint="Hold Ctrl/Shift for multiple"
                    >
                      <select
                        multiple
                        value={form.tagIds}
                        onChange={updateSelectedTags}
                        style={{ ...inputStyle, height: 74 }}
                      >
                        {taxonomy.tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>

                  {/* Model origin */}
                  <div>
                    <p style={{ ...labelStyle, marginBottom: 2 }}>
                      Model origin - this is a...
                    </p>
                    <DarkRadio
                      name="origin"
                      value="original"
                      checked={form.licenseType === "Original work"}
                      onChange={() =>
                        updateField("licenseType", "Original work")
                      }
                      label="Original model - I made it"
                      sublabel="I am uploading a new model."
                    />
                    <DarkRadio
                      name="origin"
                      value="remix"
                      checked={form.licenseType === "Permitted remix"}
                      onChange={() =>
                        updateField("licenseType", "Permitted remix")
                      }
                      label="Remix or variation of another model."
                      sublabel="I am uploading a significant modification."
                    />
                    <DarkRadio
                      name="origin"
                      value="reupload"
                      checked={form.licenseType === "Public/open license"}
                      onChange={() =>
                        updateField("licenseType", "Public/open license")
                      }
                      label="Reupload of another model - respecting original license."
                      sublabel="I am reuploading from another website."
                    />
                  </div>

                  {/* Checkboxes */}
                  <div
                    style={{
                      borderTop: `1px solid ${T.border}`,
                      paddingTop: 12,
                    }}
                  >
                    <DarkCheckbox
                      label="I confirm I own this design or have permission to share it."
                      checked={form.ownershipConfirmed}
                      onChange={(e) =>
                        updateField("ownershipConfirmed", e.target.checked)
                      }
                    />
                    <DarkCheckbox
                      label="I acknowledge the FabLab policy review before public visibility."
                      checked={form.policyAcknowledged}
                      onChange={(e) =>
                        updateField("policyAcknowledged", e.target.checked)
                      }
                    />
                  </div>
                </div>
              </Section>

              {/* Description */}
              <Section title="Description">
                <TextArea
                  rows={8}
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Introduce your model, create build instructions and add print tips..."
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    lineHeight: 1.65,
                  }}
                />
              </Section>

              {/* Add files */}
              <Section title="Add files">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <UploadZone
                    inputId="design-model-files"
                    icon={FilePlus}
                    title="Add model files"
                    description="STL, OBJ, 3MF - stored as separate model assets."
                    accept=".stl,.obj,.3mf"
                    selectedFiles={designFiles}
                    onChange={(e) =>
                      setDesignFiles(Array.from(e.target.files || []))
                    }
                  />
                  <UploadZone
                    inputId="design-preview-images"
                    icon={ImagePlus}
                    title="Add preview images"
                    description="JPG, PNG, WEBP - becomes the public gallery."
                    accept=".jpg,.jpeg,.png,.webp"
                    selectedFiles={thumbnailImages}
                    onChange={(e) =>
                      setThumbnailImages(Array.from(e.target.files || []))
                    }
                  />
                </div>
              </Section>

              {/* Photos */}
              <Section title="Photos">
                {visiblePreviewImages.length > 0 ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 7 }}
                  >
                    {visiblePreviewImages.map((image, index) => (
                      <AssetRow
                        key={image.id}
                        kind="image"
                        accept=".jpg,.jpeg,.png,.webp"
                        previewUrl={assetUrl(image.imageUrl)}
                        name={
                          image.originalFileName ||
                          image.imageUrl?.split("/").pop() ||
                          "Preview image"
                        }
                        meta="Gallery image"
                        isPrimary={
                          Number(assetState.primaryImageId) === Number(image.id)
                        }
                        replacementName={
                          Number(assetState.replaceImageId) === Number(image.id)
                            ? assetState.replacementImage?.name
                            : ""
                        }
                        canMoveUp={index > 0}
                        canMoveDown={index < visiblePreviewImages.length - 1}
                        onPrimary={() =>
                          updateAssetState({ primaryImageId: image.id })
                        }
                        onMoveUp={() => moveInOrder("image", image.id, -1)}
                        onMoveDown={() => moveInOrder("image", image.id, 1)}
                        onReplace={(e) =>
                          updateAssetState({
                            replaceImageId: image.id,
                            replacementImage: e.target.files?.[0] || null,
                          })
                        }
                        onRemove={() => markImageForRemoval(image.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptySlot>No preview images yet - add one above.</EmptySlot>
                )}
              </Section>

              {/* Model Files */}
              <Section title="Model Files">
                {visibleModelFiles.length > 0 ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 7 }}
                  >
                    {visibleModelFiles.map((file, index) => (
                      <AssetRow
                        key={file.id}
                        kind="model"
                        accept=".stl,.obj,.3mf"
                        previewUrl={assetUrl(file.modelSnapshotUrl)}
                        previewSource={{
                          fileUrl: file.fileUrl,
                          fileObjectId: file.fileObjectId,
                          snapshotUrl: file.modelSnapshotUrl,
                          fileName:
                            file.originalFileName ||
                            file.fileUrl?.split("/").pop() ||
                            "Model file",
                          extension: file.extension,
                        }}
                        name={
                          file.originalFileName ||
                          file.fileUrl?.split("/").pop() ||
                          "Model file"
                        }
                        meta={[
                          formatFileSize(file.fileSize),
                          file.isPrintReady
                            ? "Verified for Instant Quote"
                            : "Needs Print Ready review",
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                        isPrimary={
                          Number(assetState.primaryFileId) === Number(file.id)
                        }
                        isPrintReady={file.isPrintReady}
                        replacementName={
                          Number(assetState.replaceFileId) === Number(file.id)
                            ? assetState.replacementFile?.name
                            : ""
                        }
                        canMoveUp={index > 0}
                        canMoveDown={index < visibleModelFiles.length - 1}
                        onPrimary={() =>
                          updateAssetState({ primaryFileId: file.id })
                        }
                        onMoveUp={() => moveInOrder("file", file.id, -1)}
                        onMoveDown={() => moveInOrder("file", file.id, 1)}
                        onReplace={(e) =>
                          updateAssetState({
                            replaceFileId: file.id,
                            replacementFile: e.target.files?.[0] || null,
                          })
                        }
                        onRemove={() => markFileForRemoval(file.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptySlot>
                    No model files yet. Drafts can be saved without a model, but
                    publishing requires at least one.
                  </EmptySlot>
                )}
              </Section>

            </div>

            <aside
              style={{
                position: "sticky",
                top: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Status + actions */}
              <div
                style={{
                  background: T.panel,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 14px",
                    borderBottom: `1px solid ${T.border}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.text,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {isEditing ? "Design status" : "Draft setup"}
                  </span>
                  {currentDesign && (
                    <span
                      style={{
                        background: "#f1f5f9",
                        color: T.accent,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        padding: "3px 7px",
                        borderRadius: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {getModerationStatusLabel(currentDesign.moderationStatus)}
                    </span>
                  )}
                </div>

                {currentDesign &&
                  APPROVED_STATUSES.has(currentDesign.moderationStatus) && (
                    <div style={{ padding: "12px 14px" }}>
                      <p
                        style={{
                          margin: 0,
                          padding: "7px 9px",
                          background: T.warningBg,
                          border: `1px solid ${T.warningBorder}`,
                          borderRadius: 6,
                          fontSize: 11,
                          color: T.warningText,
                          lineHeight: 1.55,
                        }}
                      >
                        Updating runs automated screening again. Only flagged
                        edits need FabLab review.
                      </p>
                    </div>
                  )}

                {/* Buttons */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderTop: `1px solid ${T.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                  }}
                >
                  <OrangeBtn
                    type="submit"
                    fullWidth
                    disabled={isSaving || isPublishing}
                  >
                    <Save size={13} />
                    {isSaving
                      ? "Saving..."
                      : isEditing
                        ? "Update Design"
                        : "Save Draft"}
                  </OrangeBtn>
                  {canPublish && (
                    <OutlineBtn
                      type="button"
                      fullWidth
                      disabled={isSaving || isPublishing}
                      onClick={handlePublish}
                    >
                      <Send size={13} />
                      {isPublishing ? "Publishing..." : "Publish for Review"}
                    </OutlineBtn>
                  )}
                  <OutlineBtn
                    type="button"
                    fullWidth
                    onClick={() => navigate("/my-designs")}
                  >
                    Cancel
                  </OutlineBtn>
                </div>
              </div>

              {/* Delete */}
              {isEditing && currentDesign && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 3px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.danger,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Delete design
                  </p>
                  <p
                    style={{
                      margin: "0 0 9px",
                      fontSize: 11,
                      color: "#991b1b",
                      lineHeight: 1.5,
                    }}
                  >
                    Hides from public browsing. Audit history is preserved.
                  </p>
                  <OutlineBtn
                    type="button"
                    fullWidth
                    danger
                    disabled={isSaving || isPublishing || isDeleting}
                    onClick={handleDeleteDesign}
                  >
                    <Trash2 size={13} />
                    {isDeleting ? "Deleting..." : "Delete Design"}
                  </OutlineBtn>
                </div>
              )}
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}
