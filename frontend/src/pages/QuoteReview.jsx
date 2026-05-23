import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getQuoteByToken } from "../api/quotes";
import { createRequestDraft } from "../api/requests";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { normalizeModelPreview } from "../utils/model-preview";

export default function QuoteReview() {
  const { quoteToken } = useParams();

  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { addItem } = useCart();

  const [quote, setQuote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const quoteSnapshot = quote?.quoteSnapshot;
  const currency =
    quote?.pricingConfigSnapshot?.currency || quoteSnapshot?.currency || "PHP";
  const preview = useMemo(
    () => normalizeModelPreview(getPreviewSource(quote)),
    [quote],
  );

  async function addQuoteOrRedirect(nextPath = "/cart") {
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
      setSubmitMessage("Quote added to cart.");
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

  useEffect(() => {
    async function loadQuote() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getQuoteByToken(quoteToken);
        setQuote(data.data?.quote || data.quote || data);
      } catch (err) {
        setError(err.message);
        setQuote(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadQuote();
  }, [quoteToken]);

  return (
    <PageShell size="lg">
      <Panel className="unifab-quote-lite unifab-quote-lite__panel">
        <PageHeader
          title="Quote review"
          description="Review this slicer-backed quote. Submit Request sends it to the print request submission page."
        />

        <div className="unifab-quote-lite__token">
          <p>Quote token</p>
          <code>{quoteToken}</code>
        </div>

        {isLoading && <p className="mt-6 text-slate-600">Loading quote...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {quote && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="unifab-quote-lite__review-card">
              {(preview.canPreview || preview.snapshotUrl) && (
                <div>
                  <p className="unifab-quote-lite__field-label">
                    Model snapshot
                  </p>
                  <ModelSnapshotPreview
                    source={preview}
                    className="unifab-quote-lite__review-preview"
                    fallbackClassName="unifab-quote-lite__preview-fallback"
                    fallbackLabel="Open full model preview"
                  />
                </div>
              )}

              <div>
                <p className="unifab-quote-lite__field-label">Source</p>
                <p className="unifab-quote-lite__field-value">
                  {getQuoteSourceLabel(quote)}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryItem label="Material" value={quote.material} />
                <SummaryItem
                  label="Color"
                  value={quote.materialColorName || "Not specified"}
                />
                <SummaryItem label="Quality" value={quote.printQuality} />
                <SummaryItem label="Infill" value={`${quote.infill}%`} />
                <div>
                  <p className="unifab-quote-lite__field-label">Quantity</p>
                  <p className="unifab-quote-lite__field-value">
                    {quote.quantity}
                  </p>
                  {quote.quantity > 1 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Slicing is validated per copy; pricing is multiplied by
                      quantity.
                    </p>
                  )}
                </div>
              </div>

              {quoteSnapshot && (
                <div className="unifab-quote-lite__metrics">
                  <SummaryItem
                    label="Print time"
                    value={`${Math.round(
                      quoteSnapshot.estimatedPrintTimeMinutes || 0,
                    )} minutes`}
                  />
                  <SummaryItem
                    label="Filament weight"
                    value={`${Number(
                      quoteSnapshot.filamentWeightGrams || 0,
                    ).toFixed(2)} g`}
                  />
                  <SummaryItem
                    label="Filament length"
                    value={`${Number(
                      quoteSnapshot.filamentLengthMeters || 0,
                    ).toFixed(2)} m`}
                  />
                </div>
              )}

              {quoteSnapshot?.warnings?.length > 0 && (
                <div className="unifab-quote-lite__warning">
                  <h3>Pre-flight warnings</h3>
                  <ul>
                    {quoteSnapshot.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <aside className="unifab-quote-lite__review-summary">
              <div className="unifab-quote-lite__summary-total">
                <p>Estimated cost</p>
                <strong>
                  {currency} {Number(quote.estimatedCost || 0).toFixed(2)}
                </strong>
              </div>

              {quote.expiresAt && (
                <p className="unifab-quote-lite__expires">
                  Quote expires {new Date(quote.expiresAt).toLocaleString()}
                </p>
              )}

              <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5">
                <Button
                  type="button"
                  onClick={handleSubmitRequest}
                  disabled={isAddingToCart}
                  className="w-full"
                >
                  {isAddingToCart ? "Adding..." : "Submit Request"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddToCart}
                  disabled={isAddingToCart}
                  className="w-full"
                >
                  {isAddingToCart ? "Adding..." : "Add to cart"}
                </Button>
              </div>
            </aside>
          </div>
        )}

        <Alert className="mt-6" type="success">
          {submitMessage}
        </Alert>
      </Panel>
    </PageShell>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="unifab-quote-lite__field-label">{label}</p>
      <p className="unifab-quote-lite__field-value">{value || "-"}</p>
    </div>
  );
}

function getQuoteSourceLabel(quote) {
  if (!quote) {
    return "Quote source";
  }

  if (quote.fileOriginalName) {
    return quote.fileOriginalName;
  }

  if (quote.sourceType === "library") {
    return quote.designSnapshot?.title || "Local design";
  }

  if (quote.sourceType === "mmf") {
    return quote.designSnapshot?.name || "MyMiniFactory design";
  }

  return "Uploaded model";
}

function getPreviewSource(quote) {
  if (!quote) {
    return { modelUrl: null, fileName: null, extension: null };
  }

  const fileUrl =
    quote.fileUrl ||
    quote.quoteSnapshot?.file?.url ||
    quote.designSnapshot?.fileUrl ||
    quote.quoteSnapshot?.design?.fileUrl ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.cachedFileUrl ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.fileUrl;
  const fileName =
    quote.fileOriginalName ||
    quote.quoteSnapshot?.file?.originalName ||
    quote.designSnapshot?.fileOriginalName ||
    quote.designSnapshot?.primaryFile?.originalFileName ||
    quote.quoteSnapshot?.design?.fileOriginalName ||
    quote.quoteSnapshot?.design?.primaryFile?.originalFileName ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.originalFileName ||
    quote.designSnapshot?.title ||
    quote.quoteSnapshot?.design?.title ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.title ||
    fileUrl;
  const extension =
    getExtension(quote.fileOriginalName) ||
    getExtension(quote.quoteSnapshot?.file?.originalName) ||
    quote.designSnapshot?.extension ||
    quote.designSnapshot?.primaryFile?.extension ||
    quote.quoteSnapshot?.design?.extension ||
    quote.quoteSnapshot?.design?.primaryFile?.extension ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.extension ||
    getExtension(fileName) ||
    getExtension(fileUrl);

  const snapshotUrl =
    quote.thumbnailUrl ||
    quote.modelSnapshotUrl ||
    quote.quoteSnapshot?.file?.thumbnailUrl ||
    quote.quoteSnapshot?.file?.modelSnapshotUrl ||
    quote.designSnapshot?.thumbnailUrl ||
    quote.designSnapshot?.modelSnapshotUrl ||
    quote.quoteSnapshot?.design?.thumbnailUrl ||
    quote.quoteSnapshot?.design?.modelSnapshotUrl ||
    quote.quoteSnapshot?.mmfObject?.printReadyFile?.modelSnapshotUrl ||
    quote.quoteSnapshot?.mmfObject?.linkedLocalDesign?.thumbnailUrl ||
    null;

  return {
    modelUrl: fileUrl,
    fileUrl,
    snapshotUrl,
    fileName,
    extension,
    fileObjectId:
      quote.fileObjectId ||
      quote.file_object_id ||
      quote.quoteSnapshot?.file?.fileObjectId ||
      quote.designSnapshot?.fileObjectId ||
      quote.designSnapshot?.primaryFile?.fileObjectId ||
      quote.quoteSnapshot?.design?.fileObjectId ||
      quote.quoteSnapshot?.design?.primaryFile?.fileObjectId ||
      quote.quoteSnapshot?.mmfObject?.printReadyFile?.fileObjectId ||
      null,
  };
}

function getExtension(value) {
  if (!value) {
    return null;
  }

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}
