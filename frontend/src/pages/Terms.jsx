import { PageHeader, PageShell, Panel } from "../components/ui/Page";

const TERMS = [
  {
    title: "Quote and model review",
    body: "Quotes are generated from backend-managed slicer profiles and are estimates until the lab reviews the submitted request.",
  },
  {
    title: "Payment and verification",
    body: "Payment is made through the university cashier. Lab staff verify physical receipts in person before a request moves to printing.",
  },
  {
    title: "Print outcomes",
    body: "The FabLab may contact the requester when a model needs scale, orientation, support, material, or geometry adjustments before printing.",
  },
  {
    title: "Turnaround",
    body: "Print timing depends on queue volume, print duration, material availability, equipment condition, and administrative review.",
  },
  {
    title: "Files and snapshots",
    body: "Submitted print requests keep a quote snapshot so later pricing, material, or profile changes do not silently affect the request.",
  },
];

export default function Terms() {
  return (
    <PageShell size="lg">
      <Panel>
        <PageHeader
          title="Terms and Conditions"
          description="These terms apply when a quote is submitted as a UniFab print request."
        />

        <div className="mt-8 grid gap-4">
          {TERMS.map((item) => (
            <section
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <h2 className="font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.body}
              </p>
            </section>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
