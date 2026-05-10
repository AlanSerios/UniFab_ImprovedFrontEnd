import { Link } from "react-router-dom";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const adminLinks = [
  {
    to: "/admin/print-requests",
    title: "Print requests",
    description:
      "Review submissions, update statuses, and issue payment slips.",
  },
  {
    to: "/admin/design-requests",
    title: "Design requests",
    description:
      "Review custom design briefs, update status, and link completed designs.",
  },
  {
    to: "/admin/local-designs",
    title: "Local designs",
    description: "Add and manage lab-owned printable designs for the library.",
  },
  {
    to: "/admin/community-designs",
    title: "Community designs",
    description:
      "Review user submissions, approve, reject, hide, or restore community designs.",
  },
  {
    to: "/admin/mmf-overrides",
    title: "MMF readiness",
    description:
      "Manage MyMiniFactory visibility, pinning, and print-readiness overrides.",
  },
  {
    to: "/admin/materials",
    title: "Materials",
    description:
      "Add, edit, activate, and deactivate printable materials for quotes.",
  },
  {
    to: "/admin/slicer-profiles",
    title: "Slicer profiles",
    description:
      "Upload PrusaSlicer profiles for material and quality quote readiness.",
  },
  {
    to: "/admin/pricing",
    title: "Pricing config",
    description:
      "Manage machine, electricity, markup, and base rates for future quotes.",
  },
  {
    to: "/admin/printers",
    title: "Printers",
    description:
      "Publish printer information without letting clients choose quote profiles.",
  },
  {
    to: "/admin/maintenance",
    title: "Maintenance",
    description: "Run safe cleanup tasks for expired backend-managed records.",
  },
  {
    to: "/admin/status",
    title: "Status",
    description: "Current API and database health for UniFab.",
  },
];

export default function AdminDashboard() {
  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Admin dashboard"
          description="Manage lab workflows for print requests, design requests, catalog readiness, and pricing."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adminLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <h2 className="font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
