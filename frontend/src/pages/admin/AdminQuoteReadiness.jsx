import { useEffect, useMemo, useState } from "react";

import {
  getQuoteDiagnostics,
  getQuoteReadiness,
} from "../../api/quotes";
import { Alert, StatusBadge } from "../../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  DataTable,
  TableBody,
  TableHead,
  TableWrap,
} from "../../components/ui/Table";

function getReadinessData(response) {
  return response.data || response;
}

function getDiagnostics(response) {
  return response.data?.attempts || response.attempts || [];
}

export default function AdminQuoteReadiness() {
  const [readiness, setReadiness] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const summary = useMemo(() => {
    const qualities =
      readiness?.materials?.flatMap((material) => material.qualities) || [];
    const readyCount = qualities.filter((item) => item.isReady).length;

    return {
      readyCount,
      totalCount: qualities.length,
      failedAttempts: attempts.filter((attempt) => attempt.status === "failed")
        .length,
    };
  }, [attempts, readiness]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadPageData() {
      try {
        setIsLoading(true);
        setError("");

        const [readinessResponse, diagnosticsResponse] = await Promise.all([
          getQuoteReadiness(),
          getQuoteDiagnostics({ limit: 25 }),
        ]);

        if (!shouldIgnore) {
          setReadiness(getReadinessData(readinessResponse));
          setAttempts(getDiagnostics(diagnosticsResponse));
        }
      } catch (err) {
        if (!shouldIgnore) {
          setError(err.message || "Failed to load quote readiness.");
        }
      } finally {
        if (!shouldIgnore) {
          setIsLoading(false);
        }
      }
    }

    loadPageData();

    return () => {
      shouldIgnore = true;
    };
  }, []);

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Quote readiness"
          description="Check whether public quote paths have active materials, profiles, profile files, dry-run validation, and pricing."
          meta={
            readiness
              ? `${summary.readyCount}/${summary.totalCount} material-quality pairs ready`
              : undefined
          }
        />

        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        {isLoading && (
          <p className="mt-6 text-sm text-slate-600">
            Loading quote readiness...
          </p>
        )}

        {readiness && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Pricing config"
                value={readiness.pricingConfigReady ? "Ready" : "Missing"}
                tone={readiness.pricingConfigReady ? "success" : "danger"}
              />
              <MetricCard
                label="Ready pairs"
                value={`${summary.readyCount}/${summary.totalCount}`}
                tone={summary.readyCount === summary.totalCount ? "success" : "warning"}
              />
              <MetricCard
                label="Recent failures"
                value={summary.failedAttempts}
                tone={summary.failedAttempts > 0 ? "danger" : "success"}
              />
            </div>

            <section className="mt-6">
              <h2 className="font-semibold text-slate-950">
                Material and quality readiness
              </h2>
              <TableWrap>
                <DataTable>
                  <TableHead>
                    <tr>
                      <th className="px-4 py-3">Material</th>
                      <th className="px-4 py-3">Quality</th>
                      <th className="px-4 py-3">Profile</th>
                      <th className="px-4 py-3">Validation</th>
                      <th className="px-4 py-3">Readiness</th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {readiness.materials.flatMap((material) =>
                      material.qualities.map((quality) => (
                        <tr key={`${material.materialKey}-${quality.quality}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-950">
                              {material.displayName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {material.materialKey}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {quality.quality}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {quality.profile
                              ? `v${quality.profile.versionNumber} ${quality.profile.printerName}`
                              : "No active profile"}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              tone={getValidationTone(
                                quality.profile?.validationStatus,
                              )}
                            >
                              {quality.profile?.validationStatus || "missing"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              tone={quality.isReady ? "success" : "warning"}
                            >
                              {quality.isReady ? "Ready" : "Needs attention"}
                            </StatusBadge>
                            {quality.reasons?.length > 0 && (
                              <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
                                {quality.reasons.join(" ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      )),
                    )}
                  </TableBody>
                </DataTable>
              </TableWrap>
            </section>

            <section className="mt-6">
              <h2 className="font-semibold text-slate-950">
                Recent quote diagnostics
              </h2>
              <TableWrap>
                <DataTable>
                  <TableHead>
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Settings</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Message</th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {attempts.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={5}>
                          No quote attempts recorded yet.
                        </td>
                      </tr>
                    )}
                    {attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td className="px-4 py-3 text-slate-500">
                          {attempt.created_at
                            ? new Date(attempt.created_at).toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {attempt.source_type}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {attempt.material || "-"} /{" "}
                          {attempt.print_quality || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={
                              attempt.status === "success"
                                ? "success"
                                : "danger"
                            }
                          >
                            {attempt.status}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {attempt.error_message || "Quote calculated"}
                        </td>
                      </tr>
                    ))}
                  </TableBody>
                </DataTable>
              </TableWrap>
            </section>
          </>
        )}
      </Panel>
    </PageShell>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-2">
        <StatusBadge tone={tone}>{value}</StatusBadge>
      </div>
    </div>
  );
}

function getValidationTone(status) {
  if (status === "passed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
}
