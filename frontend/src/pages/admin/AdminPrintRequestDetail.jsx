import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  archiveAdminPrintRequest,
  deleteAdminPrintRequest,
  fetchAdminPrintRequestModel,
  fetchAdminPrintRequestItemModel,
  getPrintRequestById,
  updateAdminPrintRequestStatus,
  undoAdminPrintRequestStatus,
} from "../../api/requests";
import { API_BASE_URL } from "../../api/client";
import { ModelSnapshotPreview } from "../../components/ui/ModelSnapshotPreview";
import { ModelViewer } from "../../components/ui/ModelViewer";

const STATUS_LABELS = {
  pending_review: "Pending Review",
  design_in_progress: "Design in Progress",
  approved: "Approved",
  payment_slip_issued: "Payment Slip Issued",
  payment_verified: "Payment Verified",
  printing: "Printing",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function assetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

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

function getPathExtension(value) {
  if (!value) return null;

  const match = String(value).split(/[?#]/)[0].toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || null;
}

function eventLabel(event) {
  if (event.eventType === "correction") {
    return `Correction: ${STATUS_LABELS[event.fromStatus] || event.fromStatus} to ${
      STATUS_LABELS[event.toStatus] || event.toStatus
    }`;
  }

  return `${STATUS_LABELS[event.fromStatus] || event.fromStatus || "Created"} to ${
    STATUS_LABELS[event.toStatus] || event.toStatus
  }`;
}

export default function AdminPrintRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [printRequest, setPrintRequest] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [events, setEvents] = useState([]);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [modelPreviewUrl, setModelPreviewUrl] = useState("");
  const [modelPreviewError, setModelPreviewError] = useState("");
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);

  const [statusForm, setStatusForm] = useState({
    status: "",
    note: "",
    rejectionReason: "",
    confirmedCost: "",
    itemCosts: {},
    receiptReferenceNumber: "",
    receiptVerificationNote: "",
  });
  const [correctionReason, setCorrectionReason] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUndoingStatus, setIsUndoingStatus] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const quoteSnapshot = printRequest?.quoteSnapshot;
  const quoteMetrics = quoteSnapshot?.quote || quoteSnapshot;
  const currency = getSnapshotCurrency(printRequest);

  const canArchive =
    printRequest?.status === "rejected" && !printRequest?.archivedAt;
  const canDelete =
    printRequest?.status === "rejected" && Boolean(printRequest?.archivedAt);
  const isFinalStatus =
    printRequest?.status === "completed" || printRequest?.status === "rejected";

  const availableStatusOptions = printRequest?.availableTransitions || [];
  const primaryModelItem = items[0] || null;

  useEffect(() => {
    async function loadPrintRequest() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getPrintRequestById(requestId);
        const loadedPrintRequest =
          data.data?.printRequest || data.printRequest || data.request || data;

        setPrintRequest(loadedPrintRequest);
        setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
        setEvents(data.data?.events || data.events || []);
        setItems(data.data?.items || data.items || []);
        setStatusForm((current) => ({
          ...current,
          status: "",
          confirmedCost:
            loadedPrintRequest?.confirmedCost ||
            loadedPrintRequest?.estimatedCost ||
            "",
        }));
      } catch (err) {
        setError(err.message);
        setPrintRequest(null);
        setStatusHistory([]);
        setEvents([]);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPrintRequest();
  }, [requestId]);

  useEffect(() => {
    if (!printRequest?.id) {
      return undefined;
    }

    let objectUrl = "";
    let isCancelled = false;

    async function loadModelPreview() {
      try {
        setModelPreviewError("");
        const result = primaryModelItem
          ? await fetchAdminPrintRequestItemModel(
              printRequest.id,
              primaryModelItem.id,
            )
          : await fetchAdminPrintRequestModel(printRequest.id);

        if (isCancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(result.blob);
        setModelPreviewUrl(objectUrl);
      } catch (err) {
        if (!isCancelled) {
          setModelPreviewUrl("");
          setModelPreviewError(err.message);
        }
      }
    }

    loadModelPreview();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [printRequest?.id, primaryModelItem]);

  const handleStatusChange = async (event) => {
    event.preventDefault();

    if (!statusForm.status) {
      setError("Please choose a new status.");
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setError("");
      setSuccessMessage("");

      const payload = {
        status: statusForm.status,
        note: statusForm.note,
      };

      if (statusForm.status === "rejected") {
        payload.rejectionReason = statusForm.rejectionReason;
      }

      if (statusForm.confirmedCost !== "") {
        payload.confirmedCost = statusForm.confirmedCost;
      }

      if (statusForm.status === "payment_slip_issued" && items.length > 0) {
        payload.items = items.map((item) => ({
          itemId: item.id,
          confirmedCost:
            statusForm.itemCosts[item.id] ??
            item.confirmedCost ??
            item.estimatedCost,
        }));
      }

      if (statusForm.status === "payment_verified") {
        payload.receiptReferenceNumber = statusForm.receiptReferenceNumber;
        payload.receiptVerificationNote = statusForm.receiptVerificationNote;
      }

      const data = await updateAdminPrintRequestStatus(requestId, payload);

      setPrintRequest(
        data.data?.printRequest || data.printRequest || data.request || data,
      );
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setEvents(data.data?.events || data.events || []);
      setItems(data.data?.items || data.items || []);
      setStatusForm({
        status: "",
        note: "",
        rejectionReason: "",
        confirmedCost: data.data?.printRequest?.confirmedCost || "",
        itemCosts: {},
        receiptReferenceNumber: "",
        receiptVerificationNote: "",
      });
      setSuccessMessage("Print request status updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleUndoStatus = async () => {
    if (!correctionReason.trim()) {
      setError("Please enter a correction reason.");
      return;
    }

    const confirmed = window.confirm(
      "Correct the latest status transition? This restores the previous request state and records an audit event.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsUndoingStatus(true);
      setError("");
      setSuccessMessage("");

      const data = await undoAdminPrintRequestStatus(requestId, {
        correctionReason,
      });

      setPrintRequest(
        data.data?.printRequest || data.printRequest || data.request || data,
      );
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setEvents(data.data?.events || data.events || []);
      setCorrectionReason("");
      setSuccessMessage("Latest status transition corrected.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUndoingStatus(false);
    }
  };

  const handleDownloadModel = async () => {
    try {
      setIsDownloadingModel(true);
      setError("");
      const result = primaryModelItem
        ? await fetchAdminPrintRequestItemModel(requestId, primaryModelItem.id, {
            download: true,
          })
        : await fetchAdminPrintRequestModel(requestId, {
            download: true,
          });
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        result.fileName ||
        primaryModelItem?.fileOriginalName ||
        printRequest.fileOriginalName ||
        "model";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDownloadingModel(false);
    }
  };

  const handleDownloadItemModel = async (item) => {
    try {
      setIsDownloadingModel(true);
      setError("");
      const result = await fetchAdminPrintRequestItemModel(requestId, item.id, {
        download: true,
      });
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = result.fileName || item.fileOriginalName || "model";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDownloadingModel(false);
    }
  };

  const handleArchive = async () => {
    const confirmed = window.confirm(
      "Archive this rejected print request? It will be hidden from the default admin queue.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsArchiving(true);
      setError("");
      setSuccessMessage("");

      const data = await archiveAdminPrintRequest(requestId);

      setPrintRequest(
        data.data?.printRequest || data.printRequest || data.request || data,
      );
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setSuccessMessage("Print request archived.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Permanently delete this archived print request? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      setError("");
      setSuccessMessage("");

      await deleteAdminPrintRequest(requestId);
      navigate("/admin/print-requests?archived=true");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          to="/admin/print-requests"
          className="text-sm font-semibold text-slate-700 underline"
        >
          Back to print requests
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Admin Print Request Detail</h1>

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
            <section className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-500">Reference</p>
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
                <p className="text-sm font-medium text-slate-500">Client</p>
                <p className="font-semibold text-slate-950">
                  {printRequest.clientName || "Client"}
                </p>
                {printRequest.clientEmail && (
                  <p className="text-sm text-slate-500">
                    {printRequest.clientEmail}
                  </p>
                )}
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
                <p className="text-sm font-medium text-slate-500">Infill</p>
                <p className="font-semibold text-slate-950">
                  {printRequest.infill}%
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
              <h2 className="text-lg font-semibold">Quote Snapshot</h2>

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
                    Confirmed cost
                  </p>
                  <p className="font-semibold text-slate-950">
                    {formatMoney(printRequest.confirmedCost, currency)}
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
                  <p className="text-sm font-medium text-slate-500">Filament</p>
                  <p className="font-semibold text-slate-950">
                    {Number(quoteMetrics?.filamentWeightGrams || 0).toFixed(2)}{" "}
                    g
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Model Inspection</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Admin-only preview and download for local slicer checks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadModel}
                  disabled={isDownloadingModel}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDownloadingModel
                    ? "Downloading..."
                    : items.length > 1
                      ? "Download First Model"
                      : "Download Model"}
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                {modelPreviewUrl ? (
                  <ModelViewer
                    url={modelPreviewUrl}
                    fileName={
                      primaryModelItem?.fileOriginalName ||
                      printRequest.fileOriginalName ||
                      "model-file"
                    }
                    extension={
                      primaryModelItem?.extension ||
                      printRequest.extension ||
                      getPathExtension(
                        primaryModelItem?.fileOriginalName ||
                          printRequest.fileOriginalName,
                      )
                    }
                  />
                ) : (
                  <div className="flex min-h-72 items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
                    {modelPreviewError ||
                      "Loading secure model preview..."}
                  </div>
                )}
              </div>
            </section>

            {items.length > 0 && (
              <section className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-lg font-semibold">Request Items</h2>
                <div className="mt-4 grid gap-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-4 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-[5rem_1fr_auto]"
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
                        className="h-20 w-20 rounded border border-slate-200 bg-white"
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
                      <button
                        type="button"
                        onClick={() => handleDownloadItemModel(item)}
                        disabled={isDownloadingModel}
                        className="h-fit rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">Payment Verification</h2>

              <p className="mt-3 text-sm text-slate-600">
                Verify payment from the official physical receipt presented at
                the FabLab. After checking it in person, move the request from
                Payment Slip Issued to Payment Verified.
              </p>

              {printRequest.receiptReferenceNumber && (
                <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-500">
                      Receipt/reference no.
                    </dt>
                    <dd className="font-semibold text-slate-950">
                      {printRequest.receiptReferenceNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Verified at</dt>
                    <dd className="font-semibold text-slate-950">
                      {printRequest.receiptVerifiedAt
                        ? new Date(
                            printRequest.receiptVerifiedAt,
                          ).toLocaleString()
                        : "Recorded"}
                    </dd>
                  </div>
                  {printRequest.receiptVerificationNote && (
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-slate-500">Note</dt>
                      <dd className="text-slate-700">
                        {printRequest.receiptVerificationNote}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              {printRequest.paymentSlipUrl && (
                <a
                  href={assetUrl(printRequest.paymentSlipUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open Payment Slip
                </a>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">Admin Actions</h2>

              {successMessage && (
                <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  {successMessage}
                </div>
              )}

              {isFinalStatus ? (
                <div className="mt-3 space-y-4">
                  <p className="text-sm text-slate-500">
                    This request is already in a final status.
                  </p>

                  {canArchive && (
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={isArchiving}
                      className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isArchiving ? "Archiving..." : "Archive Request"}
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeleting ? "Deleting..." : "Delete Permanently"}
                    </button>
                  )}

                  {!printRequest.archivedAt && (
                    <div className="max-w-xl rounded-md border border-slate-200 p-4">
                      <h3 className="font-semibold text-slate-950">
                        Correct Last Status Change
                      </h3>
                      <textarea
                        value={correctionReason}
                        onChange={(event) =>
                          setCorrectionReason(event.target.value)
                        }
                        rows={3}
                        className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Reason for correction"
                      />
                      <button
                        type="button"
                        onClick={handleUndoStatus}
                        disabled={isUndoingStatus}
                        className="mt-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isUndoingStatus
                          ? "Correcting..."
                          : "Correct Last Status Change"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                  <form onSubmit={handleStatusChange} className="space-y-4">
                    <h3 className="font-semibold text-slate-950">
                      Update Status
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        New status
                      </label>
                      <select
                        value={statusForm.status}
                        onChange={(event) =>
                          setStatusForm((current) => ({
                            ...current,
                            status: event.target.value,
                          }))
                        }
                        className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Choose status</option>
                        {availableStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {statusForm.status === "rejected" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Rejection reason
                        </label>
                        <textarea
                          value={statusForm.rejectionReason}
                          onChange={(event) =>
                            setStatusForm((current) => ({
                              ...current,
                              rejectionReason: event.target.value,
                            }))
                          }
                          rows={3}
                          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    )}

                    {statusForm.status === "payment_slip_issued" && (
                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-slate-700">
                          Confirmed total ({currency})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={statusForm.confirmedCost}
                          onChange={(event) =>
                            setStatusForm((current) => ({
                              ...current,
                              confirmedCost: event.target.value,
                            }))
                          }
                          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          required
                        />
                        {items.length > 0 && (
                          <div className="space-y-2 rounded-md border border-slate-200 p-3">
                            <p className="text-sm font-semibold text-slate-700">
                              Itemized confirmed costs
                            </p>
                            {items.map((item) => (
                              <label
                                key={item.id}
                                className="grid gap-2 text-sm sm:grid-cols-[1fr_9rem]"
                              >
                                <span className="text-slate-600">
                                  {item.fileOriginalName ||
                                    item.designSnapshot?.title ||
                                    `Item #${item.id}`}
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    statusForm.itemCosts[item.id] ??
                                    item.confirmedCost ??
                                    item.estimatedCost ??
                                    ""
                                  }
                                  onChange={(event) =>
                                    setStatusForm((current) => ({
                                      ...current,
                                      itemCosts: {
                                        ...current.itemCosts,
                                        [item.id]: event.target.value,
                                      },
                                      confirmedCost: String(
                                        items.reduce((sum, currentItem) => {
                                          const value =
                                            currentItem.id === item.id
                                              ? event.target.value
                                              : current.itemCosts[
                                                  currentItem.id
                                                ] ??
                                                currentItem.confirmedCost ??
                                                currentItem.estimatedCost ??
                                                0;
                                          return sum + Number(value || 0);
                                        }, 0),
                                      ),
                                    }))
                                  }
                                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  required
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {statusForm.status === "payment_verified" && (
                      <div className="space-y-4 rounded-md border border-slate-200 p-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700">
                            Receipt/reference number
                          </label>
                          <input
                            type="text"
                            value={statusForm.receiptReferenceNumber}
                            onChange={(event) =>
                              setStatusForm((current) => ({
                                ...current,
                                receiptReferenceNumber: event.target.value,
                              }))
                            }
                            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700">
                            Verification note
                          </label>
                          <textarea
                            value={statusForm.receiptVerificationNote}
                            onChange={(event) =>
                              setStatusForm((current) => ({
                                ...current,
                                receiptVerificationNote: event.target.value,
                              }))
                            }
                            rows={3}
                            className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Note
                      </label>
                      <textarea
                        value={statusForm.note}
                        onChange={(event) =>
                          setStatusForm((current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                        rows={3}
                        className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={isUpdatingStatus || isUndoingStatus}
                        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {isUpdatingStatus ? "Updating..." : "Update Status"}
                      </button>
                    </div>
                  </form>

                  <div className="space-y-4 rounded-md border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-950">
                      Correct Last Status Change
                    </h3>
                    <p className="text-sm text-slate-600">
                      Restores the request from the latest unreverted transition
                      snapshot and records a correction event.
                    </p>
                    <textarea
                      value={correctionReason}
                      onChange={(event) =>
                        setCorrectionReason(event.target.value)
                      }
                      rows={4}
                      className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Reason for correction"
                    />
                    <button
                      type="button"
                      onClick={handleUndoStatus}
                      disabled={isUndoingStatus || isUpdatingStatus}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUndoingStatus
                        ? "Correcting..."
                        : "Correct Last Status Change"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">Audit Events</h2>

              {events.length > 0 && (
                <div className="mt-4 space-y-3">
                  {events.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md bg-slate-50 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-950">
                          {eventLabel(item)}
                        </p>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {item.eventType}
                        </span>
                      </div>
                      {item.note && (
                        <p className="mt-1 text-slate-600">{item.note}</p>
                      )}
                      {item.revertedAt && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Corrected on{" "}
                          {new Date(item.revertedAt).toLocaleString()}
                        </p>
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

              <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Legacy status history
              </h3>

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
  );
}
