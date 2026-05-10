import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPrintRequestById } from "../api/requests";
import { Stepper } from "../components/ui/Stepper";

export default function PrintRequestDetail() {
  const { requestId } = useParams();

  const PRINT_STEPS = [
    { id: "pending_review", name: "Submitted" },
    { id: "payment_slip_issued", name: "Awaiting Payment" },
    { id: "payment_verified", name: "Payment Verified" },
    { id: "printing", name: "Printing" },
    { id: "completed", name: "Completed" },
  ];

  const getMappedStatus = (status) => {
    if (status === "approved") return "pending_review";
    return status;
  };

  const [printRequest, setPrintRequest] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const quoteSnapshot = printRequest?.quoteSnapshot;
  const quoteMetrics = quoteSnapshot?.quote || quoteSnapshot;
  const paymentSlipAmount =
    printRequest?.confirmedCost ?? printRequest?.estimatedCost ?? 0;

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
                      PHP {Number(printRequest.estimatedCost || 0).toFixed(2)}
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
                          Generate and print your payment slip using the button
                          below.
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
                      onClick={() => window.print()}
                      className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Print Payment Slip
                    </button>
                    </div>
                    ) : ["payment_verified", "printing", "completed"].includes(printRequest.status) ? (
                    <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-green-200 bg-green-50 p-4">
                      <p className="text-sm font-semibold text-green-800">Payment Verified</p>
                      <p className="mt-1 text-sm text-green-700">
                        Your physical receipt was verified by the FabLab staff.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View/Print Payment Slip
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

      {/* Printable Payment Slip (Hidden on screen, shown on print) */}
      {printRequest &&
        ["payment_slip_issued", "payment_verified", "printing", "completed"].includes(printRequest.status) && (
        <div className="print-only p-12 max-w-3xl mx-auto text-black bg-white min-h-screen font-sans">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-widest text-slate-900">
                UniFab
              </h1>
              <p className="text-sm font-semibold text-slate-600 tracking-wide mt-1">
                USTP-CDO FABRICATION LABORATORY
              </p>
              <p className="text-xs text-slate-500 mt-1">
                C.M. Recto Avenue, Lapasan, Cagayan de Oro City
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-slate-800 uppercase tracking-widest">
                Payment Slip
              </h2>
              <p className="text-sm font-medium mt-1">
                Ref No:{" "}
                <span className="font-bold text-slate-900">
                  {printRequest.referenceNumber || `#${printRequest.id}`}
                </span>
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Date:{" "}
                {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Client Details */}
          <div className="mb-10">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Billed To
            </h3>
            <p className="font-bold text-lg text-slate-900">
              {printRequest.clientName ||
                printRequest.userName ||
                "Student / Client"}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Status: Approved for Printing
            </p>
          </div>

          {/* Order Details Table */}
          <table className="w-full text-left border-collapse mb-10">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/2">
                  Description
                </th>
                <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                  Material
                </th>
                <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">
                  Qty
                </th>
                <th className="pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                  Total (PHP)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-4 text-sm font-medium text-slate-900">
                  {printRequest.fileOriginalName || "3D Model Printing Service"}
                </td>
                <td className="py-4 text-sm text-slate-600 text-center">
                  {printRequest.material}
                </td>
                <td className="py-4 text-sm text-slate-600 text-center">
                  {printRequest.quantity}
                </td>
                <td className="py-4 text-lg font-bold text-slate-900 text-right">
                  {Number(paymentSlipAmount || 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-12">
            <div className="w-1/2">
              <div className="flex justify-between border-t-2 border-slate-800 pt-3">
                <p className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  Amount Due
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  PHP {Number(paymentSlipAmount || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded border border-slate-300 p-6 mb-12 bg-slate-50">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3">
              Payment Instructions
            </h4>
            <ol className="list-decimal pl-5 text-sm text-slate-700 space-y-2">
              <li>
                Present this printed slip to the University Cashier (Building A,
                Room 102).
              </li>
              <li>Pay the exact amount shown above.</li>
              <li>
                Bring the official physical receipt to the FabLab for in-person
                verification.
              </li>
            </ol>
          </div>

          {/* Signatures */}
          <div className="mt-16 pt-8 border-t border-slate-200 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
                Student / Client Signature
              </p>
            </div>
            <div className="text-center">
              <div className="border-b border-slate-400 w-48 mx-auto mb-2"></div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">
                Cashier Verification
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-12 text-center text-xs text-slate-400 uppercase tracking-widest">
            <p>Generated securely by the UniFab System</p>
          </div>
        </div>
      )}
    </>
  );
}
