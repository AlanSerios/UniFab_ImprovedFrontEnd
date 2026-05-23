import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { cancelPrintRequest, getPrintRequestById } from "../api/requests";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { Stepper } from "../components/ui/Stepper";
import { assetUrl } from "../utils/model-preview";

function getSnapshotCurrency(printRequest) {
  return (
    printRequest?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    printRequest?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

function formatMoney(amount, currency) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

export default function PrintRequestDetail() {
  const { requestId } = useParams();

  const PRINT_STEPS = [
    { id: "pending_review", name: "Submitted" },
    { id: "payment_slip_issued", name: "Awaiting Payment" },
    { id: "payment_verified", name: "Payment Verified" },
    { id: "printing", name: "Printing" },
    { id: "completed", name: "Completed" },
    { id: "cancelled", name: "Cancelled" },
  ];

  const getMappedStatus = (status) => {
    if (status === "approved") return "pending_review";
    return status;
  };

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
  const paymentSlipUrl = assetUrl(printRequest?.paymentSlipUrl);

  useEffect(() => {
    async function loadPrintRequest() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getPrintRequestById(requestId);

        setPrintRequest(
          data.data?.printRequest || data.printRequest || data.request || data,
        );
        setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
        setItems(data.data?.items || data.items || []);
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
      setPrintRequest(data.data?.printRequest || data.printRequest);
      setItems(data.data?.items || data.items || []);
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setCancelReason("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-4xl p-8 print:hidden">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold">Print Request Detail</h1>

          {isLoading && (
            <p className="mt-6 text-slate-600">Loading print request...</p>
          )}

          {error && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {printRequest && (
            <div className="mt-6 space-y-6">
              <div className="py-4">
                <Stepper
                  steps={PRINT_STEPS}
                  currentStatus={
                    printRequest.status === "rejected"
                      ? "rejected"
                      : printRequest.status === "cancelled"
                        ? "cancelled"
                      : getMappedStatus(printRequest.status)
                  }
                />
              </div>

              <section className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Reference number
                  </p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.referenceNumber || `#${printRequest.id}`}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Status</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.status}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">File</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.fileOriginalName || "Model file"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Material</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.material}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Color</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.materialColorName || "Not specified"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Quality</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.printQuality}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Quantity</p>
                  <p className="font-semibold text-slate-950">
                    {printRequest.quantity}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-lg font-semibold">Quote snapshot</h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Estimated cost
                    </p>
                    <p className="font-semibold text-slate-950">
                      {formatMoney(printRequest.estimatedCost, currency)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Print time
                    </p>
                    <p className="font-semibold text-slate-950">
                      {Math.round(quoteMetrics?.estimatedPrintTimeMinutes || 0)}{" "}
                      minutes
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      Filament
                    </p>
                    <p className="font-semibold text-slate-950">
                      {Number(quoteMetrics?.filamentWeightGrams || 0).toFixed(
                        2,
                      )}{" "}
                      g
                    </p>
                  </div>
                </div>
              </section>

              {items.length > 0 && (
                <section className="rounded-lg border border-slate-200 p-4">
                  <h2 className="text-lg font-semibold">Request items</h2>
                  <div className="mt-4 grid gap-4">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-4 rounded-md bg-slate-50 p-3 text-sm"
                      >
                        <ModelSnapshotPreview
                          source={{
                            ...item,
                            snapshotUrl: item.thumbnailUrl,
                            fileName:
                              item.fileOriginalName ||
                              item.originalFileName ||
                              item.designSnapshot?.title ||
                              "Model item",
                          }}
                          className="h-20 w-20 shrink-0 rounded border border-slate-200 bg-white"
                          fallbackClassName="flex h-full w-full items-center justify-center px-1 text-center text-xs text-slate-500"
                          fallbackLabel="Preview"
                          viewerClassName="h-80"
                        />
                        <div>
                          <p className="font-semibold text-slate-950">
                            {item.fileOriginalName ||
                              item.designSnapshot?.title ||
                              "Model item"}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {[item.material, item.materialColorName]
                              .filter(Boolean)
                              .join(" / ")}{" "}
                            · {item.printQuality} · {item.infill}% · Qty{" "}
                            {item.quantity}
                          </p>
                          <p className="mt-1 font-semibold tabular-nums text-slate-950">
                            {formatMoney(item.estimatedCost, currency)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {["pending_review", "design_in_progress"].includes(
                printRequest.status,
              ) && (
                <section className="rounded-lg border border-slate-200 p-4">
                  <h2 className="text-lg font-semibold">Cancel request</h2>
                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={3}
                    className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Reason for cancellation"
                  />
                  <button
                    type="button"
                    onClick={handleCancelRequest}
                    disabled={isCancelling}
                    className="mt-3 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {isCancelling ? "Cancelling..." : "Cancel request"}
                  </button>
                </section>
              )}

              <section className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-lg font-semibold">Payment Instructions</h2>

                {printRequest.status === "payment_slip_issued" ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                      <h3 className="font-semibold text-amber-800">
                        Action Required: Pay at Cashier
                      </h3>
                      <p className="mt-2 text-sm text-amber-700">
                        Your print request has been approved. Please follow
                        these steps to proceed:
                      </p>
                      <ol className="mt-2 list-decimal pl-5 text-sm text-amber-700 space-y-1">
                        <li>
                          Open and print the payment slip generated by the
                          FabLab admin.
                        </li>
                        <li>
                          Proceed to the University Cashier (Building A, Room
                          102) to make the payment.
                        </li>
                        <li>
                          Bring the official physical receipt back to the FabLab
                          for in-person verification during service hours.
                        </li>
                      </ol>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.open(paymentSlipUrl, "_blank")}
                      disabled={!paymentSlipUrl}
                      className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Open Payment Slip
                    </button>
                    </div>
                    ) : ["payment_verified", "printing", "completed"].includes(printRequest.status) ? (
                    <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-green-200 bg-green-50 p-4">
                      <p className="text-sm font-semibold text-green-800">Payment Verified</p>
                      <p className="mt-1 text-sm text-green-700">
                        Your physical receipt was verified by the FabLab staff.
                      </p>
                      {printRequest.receiptReferenceNumber && (
                        <p className="mt-2 text-sm text-green-700">
                          Receipt/reference no.:{" "}
                          <strong>{printRequest.receiptReferenceNumber}</strong>
                        </p>
                      )}
                      {printRequest.receiptVerifiedAt && (
                        <p className="mt-1 text-sm text-green-700">
                          Verified on{" "}
                          {new Date(
                            printRequest.receiptVerifiedAt,
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(paymentSlipUrl, "_blank")}
                      disabled={!paymentSlipUrl}
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open Payment Slip
                    </button>
                    </div>
                    ) : (
                    <p className="mt-3 text-sm text-slate-500">
                    Payment instructions will be available here once a lab admin reviews and approves your request.
                    </p>
                    )}
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-lg font-semibold">Status history</h2>

                {statusHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No status history yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {statusHistory.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md bg-slate-50 p-3 text-sm"
                      >
                        <p className="font-semibold text-slate-950">
                          {item.status}
                        </p>
                        {item.note && (
                          <p className="mt-1 text-slate-600">{item.note}</p>
                        )}
                        {item.createdAt && (
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(item.createdAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

    </>
  );
}
