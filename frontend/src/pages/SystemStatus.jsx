import { useEffect, useState } from "react";
import { getDatabaseHealthMetrics, getHealthcheck } from "../api/health";
import { Button } from "../components/ui/Button";
import { Alert, StatusBadge } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

export default function SystemStatus() {
  const [health, setHealth] = useState(null);
  const [databaseMetrics, setDatabaseMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHealthcheck() {
    try {
      setIsLoading(true);
      setError("");

      const [healthResponse, databaseResponse] = await Promise.all([
        getHealthcheck(),
        getDatabaseHealthMetrics(),
      ]);

      setHealth(healthResponse.data || healthResponse);
      setDatabaseMetrics(
        databaseResponse.data?.metrics || databaseResponse.metrics || null,
      );
    } catch (err) {
      setError(err.message || "Failed to load system status.");
      setHealth(null);
      setDatabaseMetrics(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadInitialHealthcheck() {
      try {
        setIsLoading(true);
        setError("");

        const [healthResponse, databaseResponse] = await Promise.all([
          getHealthcheck(),
          getDatabaseHealthMetrics(),
        ]);

        if (!ignore) {
          setHealth(healthResponse.data || healthResponse);
          setDatabaseMetrics(
            databaseResponse.data?.metrics || databaseResponse.metrics || null,
          );
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load system status.");
          setHealth(null);
          setDatabaseMetrics(null);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadInitialHealthcheck();

    return () => {
      ignore = true;
    };
  }, []);

  const quoteFailureRate = databaseMetrics?.quoteAttempts
    ? `${(
        Number(databaseMetrics.quoteAttempts.failureRate || 0) * 100
      ).toFixed(1)}%`
    : "-";

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="System status"
          description="Current API, database, quote, cleanup, and file-reference health for UniFab."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={loadHealthcheck}
              disabled={isLoading}
            >
              {isLoading ? "Checking..." : "Refresh"}
            </Button>
          }
        />

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {isLoading && <p className="mt-6 text-slate-600">Checking system...</p>}

        {health && (
          <div className="mt-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatusItem label="API">
              <StatusBadge tone={health.status === "ok" ? "success" : "danger"}>
                {health.status || "unknown"}
              </StatusBadge>
            </StatusItem>
            <StatusItem label="Database">
              <StatusBadge
                tone={health.database === "ok" ? "success" : "danger"}
              >
                {health.database || "unknown"}
              </StatusBadge>
            </StatusItem>
            <StatusItem label="Latency">{health.latencyMs ?? "-"} ms</StatusItem>
            <StatusItem label="Uptime">
              {formatSeconds(health.uptimeSeconds)}
            </StatusItem>
            <StatusItem label="Checked">
              {formatDateTime(health.checkedAt)}
            </StatusItem>
          </div>
        )}

        {databaseMetrics && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Database size"
                value={formatBytes(databaseMetrics.databaseSize?.totalBytes)}
                detail={`Data ${formatBytes(
                  databaseMetrics.databaseSize?.dataBytes,
                )}, index ${formatBytes(databaseMetrics.databaseSize?.indexBytes)}`}
              />
              <MetricCard
                label="Quote failures"
                value={quoteFailureRate}
                detail={`${databaseMetrics.quoteAttempts?.failedCount || 0} of ${
                  databaseMetrics.quoteAttempts?.totalCount || 0
                } attempts in 24h`}
                tone={
                  Number(databaseMetrics.quoteAttempts?.failedCount || 0) > 0
                    ? "warning"
                    : "success"
                }
              />
              <MetricCard
                label="Cleanup failures"
                value={
                  Number(
                    databaseMetrics.cleanupFailures?.designCleanupFailures || 0,
                  ) +
                  Number(databaseMetrics.cleanupFailures?.fileDeleteFailures || 0)
                }
                detail="Design cleanup failures plus failed file deletes"
                tone={
                  Number(
                    databaseMetrics.cleanupFailures?.designCleanupFailures || 0,
                  ) +
                    Number(
                      databaseMetrics.cleanupFailures?.fileDeleteFailures || 0,
                    ) >
                  0
                    ? "danger"
                    : "success"
                }
              />
              <MetricCard
                label="File references"
                value={
                  Number(databaseMetrics.fileReferences?.missingFileObjects || 0) +
                  Number(
                    databaseMetrics.fileReferences?.activeUnavailableFiles || 0,
                  )
                }
                detail="Missing file objects or active unavailable files"
                tone={
                  Number(databaseMetrics.fileReferences?.missingFileObjects || 0) +
                    Number(
                      databaseMetrics.fileReferences?.activeUnavailableFiles || 0,
                    ) >
                  0
                    ? "danger"
                    : "success"
                }
              />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Table</th>
                      <th className="px-4 py-3 font-medium">Rows</th>
                      <th className="px-4 py-3 font-medium">Data</th>
                      <th className="px-4 py-3 font-medium">Index</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(databaseMetrics.tables || []).map((table) => (
                      <tr key={table.tableName}>
                        <td className="px-4 py-3 font-medium text-slate-950">
                          {table.tableName}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {Number(table.estimatedRows || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatBytes(table.dataBytes)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatBytes(table.indexBytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h2 className="font-semibold text-slate-950">
                  Production gates
                </h2>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <Gate
                    label="Slow query counter"
                    value={
                      databaseMetrics.slowQueries === null
                        ? "Unavailable"
                        : databaseMetrics.slowQueries
                    }
                    ok={databaseMetrics.slowQueries !== null}
                  />
                  <Gate
                    label="Quote failure rate"
                    value={quoteFailureRate}
                    ok={Number(databaseMetrics.quoteAttempts?.failedCount || 0) === 0}
                  />
                  <Gate
                    label="File-reference consistency"
                    value={
                      Number(
                        databaseMetrics.fileReferences?.missingFileObjects || 0,
                      ) +
                      Number(
                        databaseMetrics.fileReferences?.activeUnavailableFiles ||
                          0,
                      )
                    }
                    ok={
                      Number(
                        databaseMetrics.fileReferences?.missingFileObjects || 0,
                      ) +
                        Number(
                          databaseMetrics.fileReferences
                            ?.activeUnavailableFiles || 0,
                        ) ===
                      0
                    }
                  />
                  <Gate
                    label="Last checked"
                    value={formatDateTime(databaseMetrics.checkedAt)}
                    ok
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </Panel>
    </PageShell>
  );
}

function StatusItem({ label, children }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-1 font-semibold text-slate-950">{children}</div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "neutral" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-2">
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function Gate({ label, value, ok }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <StatusBadge tone={ok ? "success" : "warning"}>{value}</StatusBadge>
    </div>
  );
}

function formatBytes(value) {
  const bytes = Number(value || 0);

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatSeconds(value) {
  const seconds = Number(value || 0);

  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  return `${(seconds / 3600).toFixed(1)} hours`;
}
