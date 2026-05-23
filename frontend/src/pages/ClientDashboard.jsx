import { Link } from "react-router-dom";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";

const dashboardLinks = [
  {
    to: "/quote",
    title: "Get a quote",
    description: "Upload a model and calculate a slicer-based estimate.",
  },
  {
    to: "/requests",
    title: "Print requests",
    description: "View submitted requests, statuses, and quote snapshots.",
  },
  {
    to: "/designs",
    title: "Design Library",
    description: "Browse approved designs and start quotes from Print Ready files.",
  },
  {
    to: "/my-designs",
    title: "My Designs",
    description: "Manage your drafts, submissions, moderation feedback, and visibility.",
  },
  {
    to: "/saved-designs",
    title: "Saved Designs",
    description: "Return to private bookmarks from the public library.",
  },
];

export default function ClientDashboard() {
  const { user } = useAuth();

  return (
    <PageShell size="lg">
      <Panel>
        <PageHeader
          title={`Welcome, ${user?.firstName || user?.name || "Client"}`}
          description="Start a quote, review submitted print requests, or manage your library designs."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {dashboardLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <h2 className="font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}
