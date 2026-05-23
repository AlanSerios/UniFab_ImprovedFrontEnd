import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRequestDraft } from "../api/requests";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { PageShell, Panel } from "../components/ui/Page";
import { useCart } from "../context/CartContext";

function isExpired(item) {
  return item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
}

export default function Cart() {
  const navigate = useNavigate();
  const { cartError, isCartLoading, items, removeItem, subtotal } = useCart();
  const [checkoutError, setCheckoutError] = useState("");
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  const expiredItems = useMemo(() => items.filter(isExpired), [items]);
  const currency = items[0]?.currency || "PHP";

  async function handleCheckout() {
    if (expiredItems.length > 0) {
      return;
    }

    try {
      setIsCreatingDraft(true);
      setCheckoutError("");
      const data = await createRequestDraft();
      const draft = data.data?.draft || data.draft;

      if (!draft?.draftToken) {
        throw new Error("Request draft was created without a token.");
      }

      navigate(`/requests/new/${draft.draftToken}`);
    } catch (err) {
      setCheckoutError(err.message || "Unable to start request submission.");
    } finally {
      setIsCreatingDraft(false);
    }
  }

  return (
    <PageShell size="xl">
      <div className="unifab-cart space-y-4">
        <h1 className="unifab-cart__title">
          Shopping cart
        </h1>
        <Alert type="error">{cartError}</Alert>
        <Alert type="error">{checkoutError}</Alert>

        <div className="unifab-cart__layout">
          <Panel className="unifab-cart__panel min-h-[32rem] p-0 shadow-none">
            <div className="unifab-cart__panel-head">
              <h2>
                Quoted items ({items.length})
              </h2>
            </div>

            <div className="unifab-cart__table-head">
              <span>Item</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Price</span>
              <span />
            </div>

            {isCartLoading ? (
              <div className="unifab-cart__loading">
                Loading cart...
              </div>
            ) : items.length === 0 ? (
              <div className="unifab-cart__empty">
                <div className="unifab-cart__empty-mark">
                  0
                </div>
                <p>
                  Your cart is empty
                </p>
                <ButtonLink to="/quote" className="mt-4" size="sm">
                  Order Now
                </ButtonLink>
              </div>
            ) : (
              <div className="unifab-cart__rows">
                {items.map((item) => {
                  const expired = isExpired(item);
                  return (
                    <div
                      key={item.id}
                      className={`unifab-cart__row ${
                        expired ? "is-expired" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <ModelSnapshotPreview
                          source={{
                            ...item,
                            snapshotUrl: item.thumbnailUrl,
                            fileName:
                              item.fileOriginalName ||
                              item.originalFileName ||
                              item.label,
                          }}
                          className="unifab-cart__preview"
                          fallbackClassName="unifab-cart__preview-fallback"
                          fallbackLabel="Preview"
                          viewerClassName="h-80"
                        />
                        <div className="min-w-0">
                          <p className="unifab-cart__item-title">
                            {item.label}
                          </p>
                          <p className="unifab-cart__item-meta">
                            {[item.material, item.materialColorName]
                              .filter(Boolean)
                              .join(" / ")}{" "}
                            / {item.printQuality} / {item.infill}% infill
                          </p>
                          {expired && (
                            <div className="unifab-cart__expired">
                              <span>Quote expired.</span>
                              <ButtonLink
                                to={getRequotePath(item)}
                                size="sm"
                                variant="secondary"
                              >
                                {item.sourceType === "upload"
                                  ? "Quote again"
                                  : "Recalculate quote"}
                              </ButtonLink>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <span className="unifab-cart__price">
                        {item.currency || "PHP"}{" "}
                        {Number(item.estimatedCost || 0).toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="unifab-cart__remove"
                        aria-label={`Remove ${item.label}`}
                      >
                        X
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <aside className="unifab-cart__side">
            <Panel className="unifab-cart__summary-panel p-0 shadow-none">
              <div className="unifab-cart__summary-head">
                <h2>
                  Summary
                </h2>
              </div>

              <div className="unifab-cart__summary-body">
              <div className="space-y-4 text-sm">
                <SummaryLine label="Merchandise Total">
                  {currency} {Number(subtotal || 0).toFixed(2)}
                </SummaryLine>
                <SummaryLine label="Review Estimated">--</SummaryLine>
                <SummaryLine label="Subtotal" strong>
                  <span className="text-orange-600">
                    {currency} {Number(subtotal || 0).toFixed(2)}
                  </span>
                </SummaryLine>
              </div>

              <div className="unifab-cart__summary-extra">
                <SummaryLine label="Est. completion">--</SummaryLine>
                <SummaryLine label="Weight">--</SummaryLine>
              </div>

              {expiredItems.length > 0 && (
                <p className="mt-5 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  Remove expired quote items before submitting the request.
                </p>
              )}

              <Button
                type="button"
                onClick={handleCheckout}
                disabled={
                  items.length === 0 ||
                  expiredItems.length > 0 ||
                  isCreatingDraft
                }
                className="mt-5 w-full rounded-full"
              >
                {isCreatingDraft ? "Preparing..." : "Submit Request"}
              </Button>

              <ButtonLink
                to="/quote"
                variant="secondary"
                className="mt-3 w-full rounded-full"
              >
                + Add new item
              </ButtonLink>
              </div>
            </Panel>

            <Panel className="unifab-cart__note p-4 shadow-none">
              <p>
                Payment after approval
              </p>
              <p>
                UniFab issues a payment slip after admin review. Physical
                receipt verification is handled in person at the lab.
              </p>
              <p>
                SSL ENCRYPTED REQUEST
              </p>
            </Panel>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

function getRequotePath(item) {
  if (item.sourceType === "library" && item.designId) {
    const params = new URLSearchParams({
      source: "local",
      designId: String(item.designId),
    });
    const designFileId =
      item.designSnapshot?.designFileId || item.quoteSnapshot?.designFile?.id;

    if (designFileId) {
      params.set("fileId", String(designFileId));
    }

    return `/quote?${params.toString()}`;
  }

  if (item.sourceType === "mmf") {
    const objectId =
      item.designSnapshot?.id ||
      item.quoteSnapshot?.mmfObject?.id ||
      item.quoteSnapshot?.mmfObject?.mmfObjectId;
    const printReadyFileId =
      item.designSnapshot?.override?.printReadyFileId ||
      item.quoteSnapshot?.mmfObject?.printReadyFile?.id;

    if (objectId) {
      const params = new URLSearchParams({
        source: "mmf",
        objectId: String(objectId),
      });

      if (printReadyFileId) {
        params.set("fileId", String(printReadyFileId));
      }

      return `/quote?${params.toString()}`;
    }
  }

  return "/quote";
}

function SummaryLine({ label, children, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-semibold text-slate-950" : ""}>
        {label}
      </span>
      <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>
        {children}
      </span>
    </div>
  );
}
