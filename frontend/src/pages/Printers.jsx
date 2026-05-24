import { useEffect, useState } from "react";
import { getPublicPrinters } from "../api/printers";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

export default function Printers() {
  const [printers, setPrinters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPrinters() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getPublicPrinters();
        setPrinters(data.data?.printers || data.printers || []);
      } catch (err) {
        setError(err.message);
        setPrinters([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPrinters();
  }, []);

  return (
    <PageShell size="xl">
      <Panel className="unifab-support unifab-support--printers">
        <PageHeader
          title="Lab printers"
          description="Printer information is provided for visibility. Quote generation still uses backend-managed slicer profiles."
        />

        {isLoading && <p className="mt-6 text-slate-600">Loading printers...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && printers.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No public printer information yet."
            description="The lab can publish printer details from the admin area."
          />
        )}

        {printers.length > 0 && (
          <div className="unifab-printers__grid mt-6 grid gap-4 md:grid-cols-2">
            {printers.map((printer) => (
              <article
                key={printer.id}
                className="unifab-support__card unifab-printers__card rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {printer.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {[printer.model, printer.technology]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                  </div>
                  <StatusBadge
                    tone={printer.status === "active" ? "success" : "warning"}
                  >
                    {printer.status}
                  </StatusBadge>
                </div>

                <dl className="unifab-printers__facts mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <PrinterFact label="Build volume">
                    {printer.buildVolume || "-"}
                  </PrinterFact>
                  <PrinterFact label="Nozzle">{printer.nozzleSize || "-"}</PrinterFact>
                  <PrinterFact label="Materials">
                    {(printer.supportedMaterials || []).join(", ") || "-"}
                  </PrinterFact>
                </dl>

                {printer.notes && (
                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {printer.notes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function PrinterFact({ label, children }) {
  return (
    <div>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{children}</dd>
    </div>
  );
}
