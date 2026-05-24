import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getLocalDesignById, getMmfDesignByObjectId } from "../api/designs";
import { getActiveMaterials } from "../api/materials";
import {
  calculateLocalDesignQuote,
  calculateMmfDesignQuote,
  calculateUploadQuote,
  recalculateUploadQuote,
} from "../api/quotes";
import { createRequestDraft } from "../api/requests";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { SelectInput, TextInput } from "../components/ui/Form";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { getPathExtension } from "../utils/model-preview";
import {
  QUALITY_OPTIONS,
  buildLocalDesignQuoteSource,
  buildMmfQuoteSource,
  buildQuoteResult,
  buildUploadQuoteFormData,
  extractQuoteToken,
  formatFileSize,
  formatMoney,
} from "../utils/upload-quote";

export default function UploadQuote() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { addItem } = useCart();
  const sourceParam = searchParams.get("source");
  const objectIdParam = searchParams.get("objectId");
  const designIdParam = searchParams.get("designId");
  const fileIdParam = searchParams.get("fileId");

  const [modelFile, setModelFile] = useState(null);
  const [preloadedMmfFile, setPreloadedMmfFile] = useState(null);
  const [preloadedLocalDesignFile, setPreloadedLocalDesignFile] =
    useState(null);
  const [material, setMaterial] = useState("");
  const [materialColorId, setMaterialColorId] = useState("");
  const [quality, setQuality] = useState("standard");
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteToken, setQuoteToken] = useState("");
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [materials, setMaterials] = useState([]);
  const [error, setError] = useState("");
  const activePreloadedMmfFile =
    sourceParam === "mmf" && objectIdParam ? preloadedMmfFile : null;
  const activePreloadedLocalDesignFile =
    sourceParam === "local" && designIdParam ? preloadedLocalDesignFile : null;
  const activePreloadedFile =
    activePreloadedMmfFile || activePreloadedLocalDesignFile;
  const quoteSourceType = activePreloadedMmfFile
    ? "mmf"
    : activePreloadedLocalDesignFile
      ? "library"
      : "upload";
  const hasQuoteSource = Boolean(modelFile || activePreloadedFile);
  const selectedMaterial = materials.find(
    (item) => item.materialKey === material,
  );
  const readyQualities = useMemo(
    () => selectedMaterial?.readyQualities || [],
    [selectedMaterial],
  );
  const hasReadyQualities = readyQualities.length > 0;
  const colorOptions = selectedMaterial?.colors || [];
  const selectedColorStillExists = colorOptions.some(
    (color) => String(color.id) === String(materialColorId),
  );
  const effectiveMaterialColorId =
    colorOptions.length > 0
      ? selectedColorStillExists
        ? materialColorId
        : String(colorOptions[0].id)
      : "";
  const selectedColor = colorOptions.find(
    (color) => String(color.id) === String(effectiveMaterialColorId),
  );
  const effectiveQuality =
    hasReadyQualities && !readyQualities.includes(quality)
      ? readyQualities.includes("standard")
        ? "standard"
        : readyQualities[0]
      : quality;
  const currentQuoteKey = useMemo(() => {
    if (!modelFile && !activePreloadedFile) return "";

    return JSON.stringify({
      sourceType: quoteSourceType,
      sourceId:
        activePreloadedMmfFile?.objectId ||
        activePreloadedLocalDesignFile?.designId ||
        null,
      fileId:
        activePreloadedMmfFile?.printReadyFileId ||
        activePreloadedLocalDesignFile?.designFileId ||
        null,
      fileName: activePreloadedFile?.fileName || modelFile?.name,
      fileSize: activePreloadedFile?.fileSize || modelFile?.size || null,
      fileModifiedAt: modelFile?.lastModified || null,
      material,
      materialColorId: effectiveMaterialColorId,
      quality: effectiveQuality,
      infill,
      quantity,
    });
  }, [
    modelFile,
    activePreloadedMmfFile,
    activePreloadedLocalDesignFile,
    activePreloadedFile,
    quoteSourceType,
    material,
    effectiveMaterialColorId,
    effectiveQuality,
    infill,
    quantity,
  ]);
  const uploadAssetKey = useMemo(() => {
    if (!modelFile || activePreloadedFile) return "";

    return JSON.stringify({
      fileName: modelFile.name,
      fileSize: modelFile.size || null,
      fileModifiedAt: modelFile.lastModified || null,
    });
  }, [modelFile, activePreloadedFile]);
  const hasCurrentQuote = Boolean(
    quoteResult && quoteToken && quoteResult.quoteKey === currentQuoteKey,
  );
  const actionsDisabled =
    isLoadingSource || isSubmitting || isAddingToCart || !hasCurrentQuote;
  const quoteStatusLabel = isLoadingSource
    ? "Loading source"
    : isSubmitting
      ? "Calculating"
      : hasCurrentQuote
        ? "Quote ready"
        : hasQuoteSource
          ? "Waiting for valid settings"
          : "Needs file";
  const quoteSupportMessage = activePreloadedFile
    ? activePreloadedMmfFile
      ? "This MyMiniFactory file was cached and verified by FabLab for instant quote. Source downloads remain on MyMiniFactory."
      : "This UniFab-hosted file was verified by FabLab for instant quote."
    : "STL, OBJ, and 3MF files are accepted. Uploaded files stay tied to the generated quote token and are preserved only through the current quote workflow.";

  useEffect(() => {
    async function loadMaterials() {
      try {
        setIsLoadingMaterials(true);
        setError("");

        const data = await getActiveMaterials();
        const activeMaterials = data.data?.materials || data.materials || [];

        setMaterials(activeMaterials);

        if (activeMaterials.length > 0) {
          setMaterial((currentMaterial) =>
            currentMaterial || activeMaterials[0].materialKey,
          );
        }
      } catch (err) {
        setMaterials([]);
        setError(err.message);
      } finally {
        setIsLoadingMaterials(false);
      }
    }

    loadMaterials();
  }, []);

  useEffect(() => {
    if (sourceParam !== "mmf" || !objectIdParam) {
      return undefined;
    }

    let isMounted = true;

    async function loadMmfQuoteSource() {
      try {
        setIsLoadingSource(true);
        setError("");

        const data = await getMmfDesignByObjectId(objectIdParam);
        const mmfObject = data.data?.mmfObject || data.mmfObject || data;
        const quoteSource = buildMmfQuoteSource({
          mmfObject,
          objectId: objectIdParam,
          fileId: fileIdParam,
        });

        if (!isMounted) return;

        setModelFile(null);
        setQuoteResult(null);
        setQuoteToken("");
        setPreloadedMmfFile(quoteSource);
      } catch (err) {
        if (isMounted) {
          setPreloadedMmfFile(null);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSource(false);
        }
      }
    }

    loadMmfQuoteSource();

    return () => {
      isMounted = false;
    };
  }, [sourceParam, objectIdParam, fileIdParam]);

  useEffect(() => {
    if (sourceParam !== "local" || !designIdParam) {
      return undefined;
    }

    let isMounted = true;

    async function loadLocalDesignQuoteSource() {
      try {
        setIsLoadingSource(true);
        setError("");

        const data = await getLocalDesignById(designIdParam);
        const payload = data.data || data;
        const localDesign = payload.localDesign || data.localDesign || data;
        const quoteSource = buildLocalDesignQuoteSource({
          localDesign,
          designId: designIdParam,
          fileId: fileIdParam,
        });

        if (!isMounted) return;

        setModelFile(null);
        setQuoteResult(null);
        setQuoteToken("");
        setPreloadedLocalDesignFile(quoteSource);
      } catch (err) {
        if (isMounted) {
          setPreloadedLocalDesignFile(null);
          setError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSource(false);
        }
      }
    }

    loadLocalDesignQuoteSource();

    return () => {
      isMounted = false;
    };
  }, [sourceParam, designIdParam, fileIdParam]);

  const canQuote =
    hasQuoteSource &&
    material &&
    (!colorOptions.length || effectiveMaterialColorId) &&
    hasReadyQualities &&
    readyQualities.includes(effectiveQuality);

  function handleUploadFileChange(event) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) return;

    setModelFile(nextFile);
    setPreloadedMmfFile(null);
    setPreloadedLocalDesignFile(null);
    setQuoteResult(null);
    setQuoteToken("");
    event.target.value = "";

    if (sourceParam) {
      navigate("/quote", { replace: true });
    }
  }

  const handleViewQuote = async () => {
    if (!hasQuoteSource) {
      setError("Please choose a 3D model file first.");
      return;
    }

    if (!material) {
      setError("Please choose a material.");
      return;
    }

    if (colorOptions.length > 0 && !effectiveMaterialColorId) {
      setError("Please choose a material color.");
      return;
    }

    if (hasReadyQualities && !readyQualities.includes(effectiveQuality)) {
      setError("Please choose a material and quality pair that is quote-ready.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      let data;

      if (activePreloadedMmfFile) {
        data = await calculateMmfDesignQuote(activePreloadedMmfFile.objectId, {
          printReadyFileId: activePreloadedMmfFile.printReadyFileId,
          material,
          materialColorId: effectiveMaterialColorId || undefined,
          quality: effectiveQuality,
          infill,
          quantity,
        });
      } else if (activePreloadedLocalDesignFile) {
        data = await calculateLocalDesignQuote(
          activePreloadedLocalDesignFile.designId,
          {
            designFileId: activePreloadedLocalDesignFile.designFileId,
            material,
            materialColorId: effectiveMaterialColorId || undefined,
            quality: effectiveQuality,
            infill,
            quantity,
          },
        );
      } else {
        const payload = {
          material,
          materialColorId: effectiveMaterialColorId || undefined,
          quality: effectiveQuality,
          infill,
          quantity,
        };
        const canReuseUploadedAsset =
          quoteToken &&
          quoteResult?.sourceType === "upload" &&
          quoteResult?.uploadAssetKey === uploadAssetKey;

        if (canReuseUploadedAsset) {
          try {
            data = await recalculateUploadQuote(quoteToken, payload);
          } catch (recalculateError) {
            const message = recalculateError.message || "";

            if (
              !message.includes("expired") &&
              !message.includes("unavailable") &&
              !message.includes("no longer available")
            ) {
              throw recalculateError;
            }
          }
        }

        if (!data) {
          data = await calculateUploadQuote(
            buildUploadQuoteFormData({
              modelFile,
              material,
              materialColorId: effectiveMaterialColorId,
              quality: effectiveQuality,
              infill,
              quantity,
            }),
          );
        }
      }

      const nextQuoteToken = extractQuoteToken(data);

      if (!nextQuoteToken) {
        throw new Error(
          "Quote was calculated, but no quote token was returned.",
        );
      }

      setQuoteToken(nextQuoteToken);
      setQuoteResult(
        buildQuoteResult({
          data,
          quoteSourceType,
          activePreloadedFile,
          modelFile,
          material,
          materialColorId: effectiveMaterialColorId,
          selectedColor,
          quality: effectiveQuality,
          infill,
          quantity,
          currentQuoteKey,
          uploadAssetKey,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!canQuote) {
      return undefined;
    }

    const timer = setTimeout(() => {
      handleViewQuote();
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modelFile,
    activePreloadedMmfFile,
    activePreloadedLocalDesignFile,
    activePreloadedFile,
    quoteSourceType,
    material,
    effectiveMaterialColorId,
    effectiveQuality,
    infill,
    quantity,
  ]);

  async function addQuoteOrRedirect(nextPath = "/cart") {
    if (actionsDisabled) return;

    if (isAuthenticated && !user?.isEmailVerified) {
      navigate("/verify-required", { state: { from: nextPath } });
      return false;
    }

    if (!isAuthenticated) {
      navigate("/login", {
        state: {
          from: nextPath,
          pendingQuoteToken: quoteToken,
          pendingCartAction: nextPath === "/requests/new" ? "submit" : "cart",
        },
      });
      return false;
    }

    try {
      setIsAddingToCart(true);
      setError("");
      const result = await addItem(quoteToken);
      return result?.addedItem || true;
    } catch (err) {
      setError(err.message || "Unable to add quote to cart.");
      return false;
    } finally {
      setIsAddingToCart(false);
    }
  }

  async function handleAddToCart() {
    await addQuoteOrRedirect("/cart");
  }

  async function handleSubmitRequest() {
    if (actionsDisabled) return;
    const didAdd = await addQuoteOrRedirect("/requests/new");

    if (didAdd) {
      try {
        setIsAddingToCart(true);
        setError("");
        if (!didAdd.id) {
          throw new Error("Quote was added, but no cart item was returned.");
        }

        const data = await createRequestDraft({
          cartItemIds: [didAdd.id],
        });
        const draft = data.data?.draft || data.draft;

        if (!draft?.draftToken) {
          throw new Error("Request draft was created without a token.");
        }

        navigate(`/requests/new/${draft.draftToken}`);
      } catch (err) {
        setError(err.message || "Unable to start request submission.");
      } finally {
        setIsAddingToCart(false);
      }
    }
  }

  return (
    <PageShell size="xl">
      <div className="unifab-quote-lite space-y-5">
        <div className="unifab-quote-lite__header">
          <p>3D Printing / Instant Quote</p>
          <h1>Online 3D printing quote</h1>
        </div>

        <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="space-y-4">
            <Panel className="unifab-quote-lite__panel p-0 shadow-none">
              <div className="unifab-quote-lite__panel-head">
                <div>
                  <h2>Quote files</h2>
                  <p>
                    Upload one model, review the generated snapshot, then set
                    print options below.
                  </p>
                </div>
                <StatusPill tone={hasQuoteSource ? "ready" : "neutral"}>
                  {hasQuoteSource ? "1 file" : "No file"}
                </StatusPill>
              </div>

              <div className="unifab-quote-lite__panel-body">
                {!hasQuoteSource && (
                  <div className="unifab-quote-lite__upload">
                    <p>Add 3D file</p>
                    <span>Choose an STL, OBJ, or 3MF file to start.</span>
                    <label className="unifab-quote-lite__file-picker">
                      <span>Choose file</span>
                      <TextInput
                        type="file"
                        accept=".stl,.obj,.3mf"
                        onChange={handleUploadFileChange}
                        className="unifab-quote-lite__native-file"
                      />
                    </label>
                  </div>
                )}

                {hasQuoteSource && (
                  <div className="unifab-quote-lite__file">
                    <ModelSnapshotPreview
                      source={{
                        ...(activePreloadedFile || {}),
                        file: activePreloadedFile ? null : modelFile,
                        modelUrl: activePreloadedFile?.modelUrl,
                        snapshotUrl:
                          activePreloadedFile?.thumbnailUrl ||
                          (hasCurrentQuote ? quoteResult?.thumbnailUrl : null),
                        fileName:
                          activePreloadedFile?.fileName || modelFile?.name,
                        extension:
                          activePreloadedFile?.extension ||
                          getPathExtension(modelFile?.name),
                      }}
                      className="unifab-quote-lite__preview"
                      fallbackClassName="unifab-quote-lite__preview-fallback"
                      fallbackLabel={isSubmitting ? "Quoting" : "Preview"}
                      viewerClassName="h-80"
                    />

                    <div className="min-w-0">
                      <p className="unifab-quote-lite__file-name">
                        {activePreloadedFile?.fileName || modelFile?.name}
                      </p>
                      <p className="unifab-quote-lite__file-meta">
                        {activePreloadedFile
                          ? `${activePreloadedFile.sourceLabel} Print Ready file${
                              activePreloadedFile.fileSize
                                ? ` - ${formatFileSize(activePreloadedFile.fileSize)}`
                                : ""
                            }`
                          : formatFileSize(modelFile.size)}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setModelFile(null);
                          setPreloadedMmfFile(null);
                          setPreloadedLocalDesignFile(null);
                          setQuoteResult(null);
                          setQuoteToken("");
                          navigate("/quote", { replace: true });
                        }}
                        className="unifab-quote-lite__text-button"
                      >
                        {activePreloadedFile
                          ? "Choose another file"
                          : "Replace file"}
                      </button>
                    </div>

                    {activePreloadedFile ? (
                      <div className="unifab-quote-lite__source-note">
                        Loaded from a FabLab-verified{" "}
                        {activePreloadedFile.sourceLabel} file.
                      </div>
                    ) : (
                      <div className="unifab-quote-lite__file-actions">
                        <label className="unifab-quote-lite__file-picker">
                          <span>Choose replacement</span>
                          <TextInput
                            type="file"
                            accept=".stl,.obj,.3mf"
                            onChange={handleUploadFileChange}
                            className="unifab-quote-lite__native-file"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <div className="unifab-quote-lite__help">{quoteSupportMessage}</div>
              </div>
            </Panel>

            <Panel className="unifab-quote-lite__panel p-0 shadow-none">
              <div className="unifab-quote-lite__panel-head">
                <h2>Print parameters</h2>
                <StatusPill tone={hasCurrentQuote ? "ready" : "neutral"}>
                  {quoteStatusLabel}
                </StatusPill>
              </div>

              <div className="unifab-quote-lite__rows">
                <ParameterRow label="Material">
                  <SelectInput
                    value={material}
                    onChange={(event) => {
                      setMaterial(event.target.value);
                      setMaterialColorId("");
                    }}
                    disabled={isLoadingMaterials || materials.length === 0}
                  >
                    {isLoadingMaterials && (
                      <option value="">Loading materials...</option>
                    )}
                    {!isLoadingMaterials && materials.length === 0 && (
                      <option value="">No active materials available</option>
                    )}
                    {materials.map((item) => (
                      <option key={item.materialKey} value={item.materialKey}>
                        {item.displayName || item.materialKey}
                        {item.readyQualities?.length === 0
                          ? " (not quote-ready)"
                          : ""}
                      </option>
                    ))}
                  </SelectInput>
                </ParameterRow>

                <ParameterRow label="Color">
                  <div className="flex gap-2">
                    <SelectInput
                      value={effectiveMaterialColorId}
                      onChange={(event) =>
                        setMaterialColorId(event.target.value)
                      }
                      disabled={colorOptions.length === 0}
                    >
                      {colorOptions.length === 0 && (
                        <option value="">No color options configured</option>
                      )}
                      {colorOptions.map((color) => (
                        <option key={color.id} value={color.id}>
                          {color.name}
                        </option>
                      ))}
                    </SelectInput>
                    {selectedColor && (
                      <span
                        className="unifab-quote-lite__swatch"
                        style={{ backgroundColor: selectedColor.hexCode }}
                        title={selectedColor.name}
                      />
                    )}
                  </div>
                </ParameterRow>

                <ParameterRow label="Quality">
                  <SelectInput
                    value={effectiveQuality}
                    onChange={(event) => setQuality(event.target.value)}
                    disabled={!hasReadyQualities}
                  >
                    {QUALITY_OPTIONS.map((item) => (
                      <option
                        key={item}
                        value={item}
                        disabled={
                          hasReadyQualities && !readyQualities.includes(item)
                        }
                      >
                        {item}
                      </option>
                    ))}
                  </SelectInput>
                </ParameterRow>

                <ParameterRow label={`Infill (${infill}%)`}>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={infill}
                    onChange={(event) => setInfill(Number(event.target.value))}
                    className="unifab-quote-lite__range"
                  />
                </ParameterRow>

                <ParameterRow label="Quantity">
                  <TextInput
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  />
                </ParameterRow>
              </div>
            </Panel>

            <Alert type="error">{error}</Alert>
          </section>

          <aside className="unifab-quote-lite__summary">
            <Panel className="unifab-quote-lite__summary-panel p-0 shadow-none">
              <div className="unifab-quote-lite__summary-total">
                <p>Total price</p>
                <strong>
                  {hasCurrentQuote
                    ? formatMoney(
                        quoteResult.estimatedCost,
                        quoteResult.currency || "PHP",
                      )
                    : "--"}
                </strong>
                <span>{quoteStatusLabel}</span>
              </div>

              <div className="p-4">
                <dl className="unifab-quote-lite__summary-list">
                  <SummaryRow label="Material">
                    {selectedMaterial?.displayName || material || "-"}
                  </SummaryRow>
                  <SummaryRow label="Color">
                    {selectedColor?.name || "-"}
                  </SummaryRow>
                  <SummaryRow label="Quality">{effectiveQuality}</SummaryRow>
                  <SummaryRow label="Qty">{quantity}</SummaryRow>
                </dl>

                {quoteResult?.expiresAt && (
                  <p className="unifab-quote-lite__expires">
                    Quote expires {new Date(quoteResult.expiresAt).toLocaleString()}
                  </p>
                )}

                <div className="mt-4 grid gap-3">
                  <Button
                    type="button"
                    onClick={handleSubmitRequest}
                    disabled={actionsDisabled}
                    className="w-full"
                  >
                    {isAddingToCart ? "Adding..." : "Submit Request"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddToCart}
                    disabled={actionsDisabled}
                    className="w-full"
                  >
                    {isAddingToCart ? "Adding..." : "Add to Cart"}
                  </Button>
                </div>
              </div>
            </Panel>
          </aside>
        </form>
      </div>
    </PageShell>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="unifab-quote-lite__summary-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ParameterRow({ label, children }) {
  return (
    <div className="unifab-quote-lite__row">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

function StatusPill({ tone = "neutral", children }) {
  return (
    <span className={`unifab-quote-lite__status unifab-quote-lite__status--${tone}`}>
      {children}
    </span>
  );
}
