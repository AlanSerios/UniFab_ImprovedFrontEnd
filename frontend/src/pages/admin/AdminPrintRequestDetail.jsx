import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  archiveAdminPrintRequest,
  deleteAdminPrintRequest,
  getPrintRequestById,
  updateAdminPrintRequestStatus,
  undoAdminPrintRequestStatus,
} from "../../api/requests";

const STATUS_TRANSITIONS = {
  pending_review: ["approved", "rejected"],
  design_in_progress: ["approved", "rejected"],
  approved: ["payment_slip_issued", "rejected"],
  payment_slip_issued: ["payment_verified", "rejected"],
  payment_verified: ["printing", "rejected"],
  printing: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

const STATUS_LABELS = {
  pending_review: "Pending Review",
  design_in_progress: "Design in Progress",
  approved: "Approved",
  payment_slip_issued: "Payment Slip Issued",
  payment_verified: "Payment Verified",
  printing: "Printing",
  completed: "Completed",
  rejected: "Rejected",
};

export default function AdminPrintRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [printRequest, setPrintRequest] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusForm, setStatusForm] = useState({
    status: "",
    note: "",
    rejectionReason: "",
    confirmedCost: "",
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUndoingStatus, setIsUndoingStatus] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const quoteSnapshot = printRequest?.quoteSnapshot;
  const quoteMetrics = quoteSnapshot?.quote || quoteSnapshot;

  const canArchive =
    printRequest?.status === "rejected" && !printRequest?.archivedAt;
  const canDelete =
    printRequest?.status === "rejected" && Boolean(printRequest?.archivedAt);
  const isFinalStatus =
    printRequest?.status === "completed" || printRequest?.status === "rejected";

  const availableStatusOptions = printRequest
    ? STATUS_TRANSITIONS[printRequest.status] || []
    : [];

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
      } finally {
        setIsLoading(false);
      }
    }

    loadPrintRequest();
  }, [requestId]);

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

      const data = await updateAdminPrintRequestStatus(requestId, payload);

      setPrintRequest(
        data.data?.printRequest || data.printRequest || data.request || data,
      );
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setStatusForm({
        status: "",
        note: "",
        rejectionReason: "",
        confirmedCost: data.data?.printRequest?.confirmedCost || "",
      });
      setSuccessMessage("Print request status updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleUndoStatus = async () => {
    if (statusHistory.length < 2) {
      setError("Cannot undo: No previous status found.");
      return;
    }

    const confirmed = window.confirm(
      "Revert this request to its previous status? This will add a record to the history.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsUndoingStatus(true);
      setError("");
      setSuccessMessage("");

      const data = await undoAdminPrintRequestStatus(requestId);

      setPrintRequest(
        data.data?.printRequest || data.printRequest || data.request || data,
      );
      setStatusHistory(data.data?.statusHistory || data.statusHistory || []);
      setSuccessMessage("Last status change undone.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUndoingStatus(false);
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
                <p className="font-semibold text-slate-950">{"Client"}</p>
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
                    PHP {Number(printRequest.estimatedCost || 0).toFixed(2)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Confirmed cost
                  </p>
                  <p className="font-semibold text-slate-950">
                    PHP {Number(printRequest.confirmedCost || 0).toFixed(2)}
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
              <h2 className="text-lg font-semibold">Payment Verification</h2>

              <p className="mt-3 text-sm text-slate-600">
                Verify payment from the official physical receipt presented at
                the FabLab. After checking it in person, move the request from
                Payment Slip Issued to Payment Verified.
              </p>
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
                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Confirmed cost (PHP)
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

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={isUpdatingStatus || isUndoingStatus}
                        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {isUpdatingStatus ? "Updating..." : "Update Status"}
                      </button>

                      {statusHistory.length >= 2 && (
                        <button
                          type="button"
                          onClick={handleUndoStatus}
                          disabled={isUndoingStatus || isUpdatingStatus}
                          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUndoingStatus ? "Undoing..." : "Undo Last Status"}
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">Status History</h2>

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
