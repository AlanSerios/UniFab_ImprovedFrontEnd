import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { cancelPrintRequest, getPrintRequestById } from "../api/requests";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import {
  PRINT_REQUEST_STEPS,
  buildRequestItemPreviewSource,
  canClientCancelPrintRequest,
  extractCancelledPrintRequest,
  extractPrintRequestDetail,
  formatDateTime,
  formatMoney,
  getPaymentSlipUrl,
  getPrintRequestStepperStatus,
  getRequestItemTitle,
  getSnapshotCurrency,
  hasVerifiedPayment,
} from "../utils/print-request-detail";

export default function PrintRequestDetail() {
  const { requestId } = useParams();

  const [printRequest, setPrintRequest] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const quoteSnapshot = printRequest?.quoteSnapshot;
  const quoteMetrics = quoteSnapshot?.quote || quoteSnapshot;
  const currency = getSnapshotCurrency(printRequest);
  const paymentSlipUrl = getPaymentSlipUrl(printRequest);
  const requestReference =
    printRequest?.referenceNumber || (printRequest ? `#${printRequest.id}` : "");
  const currentStepIndex = PRINT_REQUEST_STEPS.findIndex(
    (step) => step.id === getPrintRequestStepperStatus(printRequest?.status),
  );

  useEffect(() => {
    async function loadPrintRequest() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getPrintRequestById(requestId);
        const detail = extractPrintRequestDetail(data);

        setPrintRequest(detail.printRequest);
        setStatusHistory(detail.statusHistory);
        setItems(detail.items);
      } catch (err) {
        setError(err.message);
        setPrintRequest(null);
        setStatusHistory([]);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPrintRequest();
  }, [requestId]);

  async function handleCancelRequest() {
    if (!cancelReason.trim()) {
      setError("Please enter a cancellation reason.");
      return;
    }

    try {
      setIsCancelling(true);
      setError("");
      const data = await cancelPrintRequest(requestId, {
        cancellationReason: cancelReason,
      });
      const detail = extractCancelledPrintRequest(data);
      setPrintRequest(detail.printRequest);
      setItems(detail.items);
      setStatusHistory(detail.statusHistory);
      setCancelReason("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="unifab-client unifab-request-detail print:hidden">
      <div className="unifab-request-detail__shell">
        <Link to="/requests" className="unifab-request-detail__back">
          Back to requests
        </Link>

        <section className="unifab-request-detail__hero">
          <div>
            <p className="unifab-request-detail__eyebrow">Print request</p>
            <h1>{requestReference || "Request detail"}</h1>
          </div>

          {printRequest && (
            <div className="unifab-request-detail__hero-total">
              <span>Estimated total</span>
              <strong>
                {formatMoney(printRequest.estimatedCost, currency)}
              </strong>
              <em>{printRequest.status}</em>
            </div>
          )}
        </section>

        {isLoading && (
          <div className="unifab-request-detail__panel">
            <p className="unifab-request-detail__muted">
              Loading print request...
            </p>
          </div>
        )}

        {error && (
          <div className="unifab-request-detail__alert" role="alert">
            {error}
          </div>
        )}

        {printRequest && (
          <div className="unifab-request-detail__content is-relaxed">
            <section className="unifab-request-detail__panel unifab-request-detail__timeline">
              <ol aria-label="Progress">
                {PRINT_REQUEST_STEPS.map((step, index) => {
                  const isCurrent = index === currentStepIndex;
                  const isComplete = index < currentStepIndex;

                  return (
                    <li
                      key={step.id}
                      className={
                        isCurrent
                          ? "is-current"
                          : isComplete
                            ? "is-complete"
                            : ""
                      }
                    >
                      <span>{index + 1}</span>
                      <p>{step.name}</p>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="unifab-request-detail__main">
              <section className="unifab-request-detail__panel">
                <div className="unifab-request-detail__section-head">
                  <p className="unifab-request-detail__eyebrow">Payment</p>
                  <h2>Payment and receipt</h2>
                </div>

                {printRequest.status === "payment_slip_issued" ? (
                  <div className="unifab-request-detail__payment-state is-warning">
                    <h3>Payment slip issued</h3>
                    <p>Pay through the University Cashier, then bring the physical receipt to the FabLab.</p>
                  </div>
                ) : hasVerifiedPayment(printRequest.status) ? (
                  <div className="unifab-request-detail__payment-state is-success">
                    <h3>Payment verified</h3>
                    <p>Your physical receipt was verified by FabLab staff.</p>
                    {printRequest.receiptReferenceNumber && (
                      <p>
                        Receipt/reference no.:{" "}
                        <strong>
                          {printRequest.receiptReferenceNumber}
                        </strong>
                      </p>
                    )}
                    {printRequest.receiptVerifiedAt && (
                      <p>
                        Verified on{" "}
                        {formatDateTime(printRequest.receiptVerifiedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="unifab-request-detail__muted">
                    Payment instructions will appear after lab review and
                    approval.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => window.open(paymentSlipUrl, "_blank")}
                  disabled={!paymentSlipUrl}
                  className="unifab-request-detail__slip-button is-inline"
                >
                  Open payment slip
                </button>
              </section>

              <section className="unifab-request-detail__panel">
                <div className="unifab-request-detail__section-head">
                  <p className="unifab-request-detail__eyebrow">
                    Request snapshot
                  </p>
                  <h2>Submitted details</h2>
                </div>

                <dl className="unifab-request-detail__facts">
                  <div>
                    <dt>Reference number</dt>
                    <dd>{requestReference}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{printRequest.status}</dd>
                  </div>
                  <div>
                    <dt>File</dt>
                    <dd>{printRequest.fileOriginalName || "Model file"}</dd>
                  </div>
                  <div>
                    <dt>Material</dt>
                    <dd>{printRequest.material || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Color</dt>
                    <dd>{printRequest.materialColorName || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Quality</dt>
                    <dd>{printRequest.printQuality || "Not specified"}</dd>
                  </div>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{printRequest.quantity}</dd>
                  </div>
                </dl>
              </section>

              <section className="unifab-request-detail__panel">
                <div className="unifab-request-detail__section-head">
                  <p className="unifab-request-detail__eyebrow">
                    Quote snapshot
                  </p>
                  <h2>Slicer metrics</h2>
                </div>

                <div className="unifab-request-detail__metrics">
                  <div>
                    <span>Estimated cost</span>
                    <strong>
                      {formatMoney(printRequest.estimatedCost, currency)}
                    </strong>
                  </div>
                  <div>
                    <span>Print time</span>
                    <strong>
                      {Math.round(
                        quoteMetrics?.estimatedPrintTimeMinutes || 0,
                      )}{" "}
                      min
                    </strong>
                  </div>
                  <div>
                    <span>Filament</span>
                    <strong>
                      {Number(quoteMetrics?.filamentWeightGrams || 0).toFixed(
                        2,
                      )}{" "}
                      g
                    </strong>
                  </div>
                </div>
              </section>

              {items.length > 0 && (
                <section className="unifab-request-detail__panel">
                  <div className="unifab-request-detail__section-head">
                    <p className="unifab-request-detail__eyebrow">
                      Request items
                    </p>
                    <h2>Models in this request</h2>
                  </div>

                  <div className="unifab-request-detail__items">
                    {items.map((item) => (
                      <article
                        key={item.id}
                        className="unifab-request-detail__item"
                      >
                        <ModelSnapshotPreview
                          source={buildRequestItemPreviewSource(item)}
                          className="unifab-request-detail__preview"
                          fallbackClassName="unifab-request-detail__preview-fallback"
                          fallbackLabel="Preview"
                          viewerClassName="h-80"
                        />

                        <div>
                          <h3>{getRequestItemTitle(item)}</h3>
                          <p>
                            {[item.material, item.materialColorName]
                              .filter(Boolean)
                              .join(" / ")}{" "}
                            / {item.printQuality} / {item.infill}% / Qty{" "}
                            {item.quantity}
                          </p>
                          <strong>
                            {formatMoney(item.estimatedCost, currency)}
                          </strong>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="unifab-request-detail__panel">
                <div className="unifab-request-detail__section-head">
                  <p className="unifab-request-detail__eyebrow">Audit trail</p>
                  <h2>Status history</h2>
                </div>

                {statusHistory.length === 0 ? (
                  <p className="unifab-request-detail__muted">
                    No status history yet.
                  </p>
                ) : (
                  <div className="unifab-request-detail__history">
                    {statusHistory.map((item) => (
                      <article
                        key={item.id}
                        className="unifab-request-detail__history-item"
                      >
                        <strong>{item.status}</strong>
                        {item.note && <p>{item.note}</p>}
                        {item.createdAt && (
                          <span>{formatDateTime(item.createdAt)}</span>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </section>

            <aside className="unifab-request-detail__side">
              {canClientCancelPrintRequest(printRequest.status) && (
                <section className="unifab-request-detail__side-card">
                  <p className="unifab-request-detail__eyebrow">
                    Client action
                  </p>
                  <h2>Cancel request</h2>
                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={4}
                    className="unifab-request-detail__textarea"
                    placeholder="Reason for cancellation"
                  />
                  <button
                    type="button"
                    onClick={handleCancelRequest}
                    disabled={isCancelling}
                    className="unifab-request-detail__cancel-button"
                  >
                    {isCancelling ? "Cancelling..." : "Cancel request"}
                  </button>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
