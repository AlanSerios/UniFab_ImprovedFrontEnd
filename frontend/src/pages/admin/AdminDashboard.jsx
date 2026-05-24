import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getAdminDashboardMetrics } from "../../api/admin";
import { Alert } from "../../components/ui/Feedback";
import { PageShell, Panel } from "../../components/ui/Page";

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
      <div className="unifab-admin-page unifab-admin-dashboard unifab-admin-page--dashboard">
        <Panel className="unifab-admin-command">
          <div className="unifab-admin-command__header">
            <div>
              <p className="unifab-admin-command__eyebrow">Operations</p>
              <h1>Admin workspace</h1>
              <p>
                Monitor the queues, checks, and blockers that need lab action.
              </p>
            </div>
            <div className="unifab-admin-command__meta">
              <span>Metrics</span>
              <strong>
                {metrics?.checkedAt
                  ? new Date(metrics.checkedAt).toLocaleString()
                  : "Live"}
              </strong>
            </div>
          </div>

          <Alert className="mt-4" type="error">
            {error}
          </Alert>

          <div className="unifab-admin-summary-rail">
            {summary.map((item) => (
              <SummaryMetric
                key={item.label}
                label={item.label}
                value={isLoading ? "..." : item.value}
                tone={item.tone}
                detail={item.detail}
              />
            ))}
          </div>
        </Panel>

        <div className="unifab-admin-dashboard__grid">
          <Panel className="unifab-admin-panel">
            <SectionHeader
              title="Today's work"
              description="Queues that usually need admin attention before clients can move forward."
            />
            <div className="unifab-admin-queue">
              {workItems.map((item) => (
                <QueueRow key={item.to} item={item} isLoading={isLoading} />
              ))}
            </div>
          </Panel>

          <Panel className="unifab-admin-panel">
            <SectionHeader
              title="System signals"
            />
            <div className="unifab-admin-signal-list">
              {systemSignals.map((signal) => (
                <SignalLine
                  key={signal.label}
                  signal={signal}
                  isLoading={isLoading}
                />
              ))}
            </div>
          </Panel>
        </div>
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
      detail: "Pending review, awaiting payment, payment verified",
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

function SummaryMetric({ label, value, tone, detail }) {
  return (
    <div className={`unifab-admin-summary unifab-admin-summary--${tone}`} title={detail}>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function QueueRow({ item, isLoading }) {
  return (
    <Link
      to={item.to}
      className={`unifab-admin-queue-row unifab-admin-queue-row--${item.tone}`}
      title={item.description}
    >
      <div>
        <h3>{item.title}</h3>
      </div>
      <span>{isLoading ? "..." : item.count}</span>
    </Link>
  );
}

function SignalLine({ signal, isLoading }) {
  return (
    <div
      className={`unifab-admin-signal-line unifab-admin-signal-line--${signal.tone}`}
    >
      <div>
        <p>{signal.label}</p>
      </div>
      <strong>{isLoading ? "..." : signal.value}</strong>
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div className="unifab-admin-section-head">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

function toCountMap(rows = [], key) {
  return Object.fromEntries(
    rows.map((item) => [item[key], Number(item.count || 0)]),
  );
}
