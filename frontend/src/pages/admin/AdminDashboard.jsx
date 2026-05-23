import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getAdminDashboardMetrics } from "../../api/admin";
import { Alert, StatusBadge } from "../../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import { ADMIN_NAV_GROUPS } from "./adminNavigation";

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    getAdminDashboardMetrics()
      .then((response) => {
        if (!ignore) {
          setMetrics(response.data?.metrics || response.metrics || null);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || "Failed to load admin dashboard metrics.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const summary = useMemo(() => buildSummary(metrics), [metrics]);
  const workItems = useMemo(() => buildWorkItems(metrics), [metrics]);
  const systemSignals = useMemo(() => buildSystemSignals(metrics), [metrics]);

  return (
    <PageShell size="xl">
      <div className="space-y-6">
        <Panel className="border-slate-200 bg-white shadow-none">
          <PageHeader
            title="Admin workspace"
            description="A practical view of today’s print queue, Design Library review, quote readiness, and system health."
            meta={
              metrics?.checkedAt
                ? `Updated ${new Date(metrics.checkedAt).toLocaleString()}`
                : "Live admin metrics"
            }
          />
          <Alert className="mt-4" type="error">
            {error}
          </Alert>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((item) => (
              <MetricCard
                key={item.label}
                label={item.label}
                value={isLoading ? "..." : item.value}
                tone={item.tone}
                detail={item.detail}
              />
            ))}
          </div>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
          <Panel className="border-slate-200 bg-white shadow-none">
            <SectionHeader
              title="Today’s work"
              description="Queues that usually need admin attention before clients can move forward."
            />
            <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {workItems.map((item) => (
                <WorkItem key={item.to} item={item} isLoading={isLoading} />
              ))}
            </div>
          </Panel>

          <Panel className="border-slate-200 bg-white shadow-none">
            <SectionHeader
              title="System signals"
              description="Operational blockers and readiness checks."
            />
            <div className="mt-5 space-y-3">
              {systemSignals.map((signal) => (
                <SignalRow
                  key={signal.label}
                  signal={signal}
                  isLoading={isLoading}
                />
              ))}
            </div>
          </Panel>
        </div>

        <Panel className="border-slate-200 bg-white shadow-none">
          <SectionHeader
            title="Admin areas"
            description="Grouped controls for operations, catalog management, configuration, and platform health."
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {ADMIN_NAV_GROUPS.map((group) => (
              <AdminAreaGroup key={group.title} group={group} />
            ))}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

function buildSummary(metrics) {
  const printCounts = toCountMap(metrics?.printRequests, "status");
  const designCounts = toCountMap(metrics?.communityDesigns, "status");
  const urgentRequests =
    Number(printCounts.pending_review || 0) +
    Number(printCounts.payment_slip_issued || 0) +
    Number(printCounts.payment_verified || 0);
  const moderationQueue =
    Number(designCounts.needs_admin_review || 0) +
    Number(designCounts.screening || 0);
  const fileIssues =
    Number(metrics?.files?.missingCount || 0) +
    Number(metrics?.files?.deleteFailedCount || 0);
  const quoteFailures = Number(metrics?.quoteAttempts24h?.failedCount || 0);

  return [
    {
      label: "Request queue",
      value: urgentRequests,
      tone: urgentRequests > 0 ? "warning" : "success",
      detail: "Pending review, awaiting payment, and payment verified",
    },
    {
      label: "Design review",
      value: moderationQueue,
      tone: moderationQueue > 0 ? "warning" : "success",
      detail: "Screening and admin review submissions",
    },
    {
      label: "Quote failures",
      value: quoteFailures,
      tone: quoteFailures > 0 ? "danger" : "success",
      detail: "Failed quote attempts in the last 24 hours",
    },
    {
      label: "Storage issues",
      value: fileIssues,
      tone: fileIssues > 0 ? "danger" : "success",
      detail: "Missing files and failed deletion events",
    },
  ];
}

function buildWorkItems(metrics) {
  const printCounts = toCountMap(metrics?.printRequests, "status");
  const designCounts = toCountMap(metrics?.communityDesigns, "status");
  const moderationQueue =
    Number(designCounts.needs_admin_review || 0) +
    Number(designCounts.screening || 0);

  return [
    {
      to: "/admin/print-requests?status=pending_review",
      title: "Review new print requests",
      description: "Check submitted models, pricing snapshots, and approval state.",
      count: Number(printCounts.pending_review || 0),
      tone: "warning",
    },
    {
      to: "/admin/print-requests?status=payment_slip_issued",
      title: "Awaiting payment",
      description: "Requests with issued slips waiting for physical receipt checks.",
      count: Number(printCounts.payment_slip_issued || 0),
      tone: "warning",
    },
    {
      to: "/admin/print-requests?status=payment_verified",
      title: "Ready for printing",
      description: "Paid requests ready to move into active production.",
      count: Number(printCounts.payment_verified || 0),
      tone: "success",
    },
    {
      to: "/admin/community-designs",
      title: "Moderate community designs",
      description: "Review submissions that need admin decision or screening follow-up.",
      count: moderationQueue,
      tone: "warning",
    },
    {
      to: "/admin/mmf-overrides?filter=needs_file",
      title: "Resolve MMF cache issues",
      description: "Print Ready MMF overrides that still need cached file mapping.",
      count: Number(metrics?.mmf?.needsFileCount || 0),
      tone: "danger",
    },
  ];
}

function buildSystemSignals(metrics) {
  return [
    {
      label: "Active materials",
      value: Number(metrics?.readiness?.activeMaterials || 0),
      detail: "Materials available for quote configuration",
      tone: "neutral",
    },
    {
      label: "Valid slicer profiles",
      value: Number(metrics?.readiness?.activeValidProfiles || 0),
      detail: "Active profiles with passed validation",
      tone: "success",
    },
    {
      label: "Failed profiles",
      value: Number(metrics?.readiness?.failedProfiles || 0),
      detail: "Profiles that need admin correction",
      tone: Number(metrics?.readiness?.failedProfiles || 0) > 0 ? "danger" : "success",
    },
    {
      label: "Unverified users",
      value: Number(metrics?.users?.unverifiedCount || 0),
      detail: "Registered accounts not yet email verified",
      tone: Number(metrics?.users?.unverifiedCount || 0) > 0 ? "warning" : "success",
    },
  ];
}

function MetricCard({ label, value, tone, detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfbfa] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <StatusBadge tone={tone}>{toneLabel(tone)}</StatusBadge>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function WorkItem({ item, isLoading }) {
  return (
    <Link
      to={item.to}
      className="flex items-start justify-between gap-4 bg-white px-4 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    >
      <div>
        <h3 className="font-semibold text-slate-950">{item.title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          {item.description}
        </p>
      </div>
      <StatusBadge tone={item.tone}>
        {isLoading ? "..." : item.count}
      </StatusBadge>
    </Link>
  );
}

function SignalRow({ signal, isLoading }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfbfa] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{signal.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {signal.detail}
          </p>
        </div>
        <StatusBadge tone={signal.tone}>
          {isLoading ? "..." : signal.value}
        </StatusBadge>
      </div>
    </div>
  );
}

function AdminAreaGroup({ group }) {
  const items = group.items.filter((item) => item.to !== "/admin");

  return (
    <div className="rounded-lg border border-slate-200 bg-[#fbfbfa] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {group.title}
      </h3>
      <div className="mt-3 divide-y divide-slate-100">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="block py-3 first:pt-0 last:pb-0"
          >
            <p className="font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {item.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function toCountMap(rows = [], key) {
  return Object.fromEntries(
    rows.map((item) => [item[key], Number(item.count || 0)]),
  );
}

function toneLabel(tone) {
  if (tone === "danger") return "Needs work";
  if (tone === "warning") return "Open";
  if (tone === "success") return "Clear";
  return "Tracked";
}
