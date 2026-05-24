import { useCallback, useEffect, useState } from "react";

import {
  dryRunAdminFileRegistryCleanup,
  dryRunAdminDesignFileCleanup,
  dryRunAdminRetentionCleanup,
  getAdminFileObjectDetail,
  getAdminFileObjects,
  getAdminFileRegistrySummary,
  runAdminDesignFileCleanup,
  runAdminFileRegistryCleanup,
  runAdminRetentionCleanup,
} from "../../api/adminFiles";
import { cleanupExpiredQuotes } from "../../api/quotes";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { Field, SelectInput, TextArea, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  DEFAULT_DESIGN_CLEANUP_SETTINGS,
  DEFAULT_REGISTRY_CLEANUP_SETTINGS,
  DEFAULT_REGISTRY_FILTERS,
  DEFAULT_RETENTION_CLEANUP_SETTINGS,
  buildDesignFileCleanupPayload,
  buildFileDownloadUrl,
  buildRegistryCleanupPayload,
  buildRetentionCleanupPayload,
  extractCleanupResponse,
  extractExpiredQuoteCleanupResult,
  extractFileRegistryResponse,
  formatBytes,
  formatMetricLabel,
  getCleanupSummaryEntries,
} from "../../utils/admin-maintenance";

export default function AdminMaintenance() {
  const [limit, setLimit] = useState(100);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [isCleaningRegistry, setIsCleaningRegistry] = useState(false);
  const [registrySummary, setRegistrySummary] = useState(null);
  const [registryObjects, setRegistryObjects] = useState([]);
  const [registryPagination, setRegistryPagination] = useState(null);
  const [registryDetail, setRegistryDetail] = useState(null);
  const [registryCleanupResult, setRegistryCleanupResult] = useState(null);
  const [registryFilters, setRegistryFilters] = useState(
    DEFAULT_REGISTRY_FILTERS,
  );
  const [registryCleanupSettings, setRegistryCleanupSettings] = useState(
    DEFAULT_REGISTRY_CLEANUP_SETTINGS,
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [registryMessage, setRegistryMessage] = useState("");
  const [registryError, setRegistryError] = useState("");
  const [designCleanupSettings, setDesignCleanupSettings] = useState(
    DEFAULT_DESIGN_CLEANUP_SETTINGS,
  );
  const [designCleanupResult, setDesignCleanupResult] = useState(null);
  const [isCleaningDesignFiles, setIsCleaningDesignFiles] = useState(false);
  const [retentionCleanupSettings, setRetentionCleanupSettings] = useState(
    DEFAULT_RETENTION_CLEANUP_SETTINGS,
  );
  const [retentionCleanupResult, setRetentionCleanupResult] = useState(null);
  const [isCleaningRetention, setIsCleaningRetention] = useState(false);

  async function handleCleanup(event) {
    event.preventDefault();

    setIsCleaning(true);
    setMessage("");
    setError("");

    try {
      const response = await cleanupExpiredQuotes(limit);
      setMessage(extractExpiredQuoteCleanupResult(response).message);
    } catch (err) {
      setError(err.message || "Expired quote cleanup failed.");
    } finally {
      setIsCleaning(false);
    }
  }

  const loadFileRegistry = useCallback(async () => {
    setIsLoadingRegistry(true);
    setRegistryError("");

    try {
      const [summaryResponse, objectsResponse] = await Promise.all([
        getAdminFileRegistrySummary(),
        getAdminFileObjects(registryFilters),
      ]);
      const registryData = extractFileRegistryResponse({
        summaryResponse,
        objectsResponse,
      });
      setRegistrySummary(registryData.summary);
      setRegistryObjects(registryData.fileObjects);
      setRegistryPagination(registryData.pagination);
    } catch (err) {
      setRegistryError(err.message || "Failed to load file registry.");
    } finally {
      setIsLoadingRegistry(false);
    }
  }, [registryFilters]);

  useEffect(() => {
    let ignore = false;

    async function loadInitialFileRegistry() {
      setIsLoadingRegistry(true);
      setRegistryError("");

      try {
        const [summaryResponse, objectsResponse] = await Promise.all([
          getAdminFileRegistrySummary(),
          getAdminFileObjects(registryFilters),
        ]);

        if (!ignore) {
          const registryData = extractFileRegistryResponse({
            summaryResponse,
            objectsResponse,
          });
          setRegistrySummary(registryData.summary);
          setRegistryObjects(registryData.fileObjects);
          setRegistryPagination(registryData.pagination);
        }
      } catch (err) {
        if (!ignore) {
          setRegistryError(err.message || "Failed to load file registry.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingRegistry(false);
        }
      }
    }

    loadInitialFileRegistry();

    return () => {
      ignore = true;
    };
  }, [registryFilters]);

  async function loadRegistryDetail(fileObjectId) {
    setRegistryError("");

    try {
      const response = await getAdminFileObjectDetail(fileObjectId);
      setRegistryDetail(response.data?.detail || response.detail);
    } catch (err) {
      setRegistryError(err.message || "Failed to load file detail.");
    }
  }

  async function handleRegistryCleanup({ dryRun }) {
    setIsCleaningRegistry(true);
    setRegistryMessage("");
    setRegistryError("");

    try {
      if (!dryRun && !registryCleanupSettings.reason.trim()) {
        throw new Error("Cleanup reason is required.");
      }

      const action = dryRun
        ? dryRunAdminFileRegistryCleanup
        : runAdminFileRegistryCleanup;
      const response = await action(
        buildRegistryCleanupPayload(registryCleanupSettings),
      );
      const cleanup = extractCleanupResponse(response);

      setRegistryCleanupResult(cleanup);
      setRegistryMessage(
        dryRun
          ? "File registry dry run completed."
          : "File registry cleanup completed.",
      );
      await loadFileRegistry();
    } catch (err) {
      setRegistryError(err.message || "File registry cleanup failed.");
    } finally {
      setIsCleaningRegistry(false);
    }
  }

  async function handleDesignFileCleanup({ dryRun }) {
    setIsCleaningDesignFiles(true);
    setRegistryMessage("");
    setRegistryError("");

    try {
      if (!dryRun && !designCleanupSettings.reason.trim()) {
        throw new Error("Cleanup reason is required.");
      }

      const action = dryRun
        ? dryRunAdminDesignFileCleanup
        : runAdminDesignFileCleanup;
      const response = await action(
        buildDesignFileCleanupPayload(designCleanupSettings),
      );

      setDesignCleanupResult(extractCleanupResponse(response));
      setRegistryMessage(
        dryRun
          ? "Design file cleanup dry run completed."
          : "Design file cleanup completed.",
      );
      await loadFileRegistry();
    } catch (err) {
      setRegistryError(err.message || "Design file cleanup failed.");
    } finally {
      setIsCleaningDesignFiles(false);
    }
  }

  async function handleRetentionCleanup({ dryRun }) {
    setIsCleaningRetention(true);
    setRegistryMessage("");
    setRegistryError("");

    try {
      if (!dryRun && !retentionCleanupSettings.reason.trim()) {
        throw new Error("Retention cleanup reason is required.");
      }

      const action = dryRun
        ? dryRunAdminRetentionCleanup
        : runAdminRetentionCleanup;
      const response = await action(
        buildRetentionCleanupPayload(retentionCleanupSettings),
      );

      setRetentionCleanupResult(extractCleanupResponse(response));
      setRegistryMessage(
        dryRun
          ? "Database retention cleanup dry run completed."
          : "Database retention cleanup completed.",
      );
    } catch (err) {
      setRegistryError(err.message || "Database retention cleanup failed.");
    } finally {
      setIsCleaningRetention(false);
    }
  }

  return (
    <PageShell size="lg">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-config-page unifab-admin-page--maintenance">
        <PageHeader
          title="Admin maintenance"
          description="Run safe maintenance tasks for backend-managed operational data."
        />

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="font-semibold text-slate-950">Expired quote cleanup</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Remove expired temporary quote records and associated temporary
            files. Submitted print requests keep their quote snapshots.
          </p>

          <form
            onSubmit={handleCleanup}
            className="mt-4 grid gap-4 sm:max-w-xl sm:grid-cols-[1fr_auto]"
          >
            <Field label="Cleanup limit">
              <TextInput
                type="number"
                min="1"
                max="500"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                required
              />
            </Field>

            <Button type="submit" disabled={isCleaning} className="self-end">
              {isCleaning ? "Cleaning..." : "Clean expired quotes"}
            </Button>
          </form>

          <Alert className="mt-4" type="success">
            {message}
          </Alert>
          <Alert className="mt-4" type="error">
            {error}
          </Alert>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">File registry</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Inspect backend-managed files, review references, and clean only
                files that are unreferenced and past retention.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isLoadingRegistry}
              onClick={loadFileRegistry}
            >
              {isLoadingRegistry ? "Loading..." : "Refresh registry"}
            </Button>
          </div>

          {registrySummary && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RegistryMetric
                label="Total files"
                value={registrySummary.totals?.totalCount}
                detail={formatBytes(registrySummary.totals?.totalBytes)}
              />
              <RegistryMetric
                label="Present"
                value={registrySummary.totals?.presentCount}
                detail="Available in storage"
              />
              <RegistryMetric
                label="Missing"
                value={registrySummary.totals?.missingCount}
                detail="Needs investigation"
              />
              <RegistryMetric
                label="Delete pending"
                value={registrySummary.totals?.deletePendingCount}
                detail="Awaiting cleanup"
              />
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-4">
                <Field label="Search">
                  <TextInput
                    value={registryFilters.search}
                    placeholder="Name, key, checksum"
                    onChange={(event) =>
                      setRegistryFilters((current) => ({
                        ...current,
                        search: event.target.value,
                        page: 1,
                      }))
                    }
                  />
                </Field>
                <Field label="Storage status">
                  <SelectInput
                    value={registryFilters.storageStatus}
                    onChange={(event) =>
                      setRegistryFilters((current) => ({
                        ...current,
                        storageStatus: event.target.value,
                        page: 1,
                      }))
                    }
                  >
                    <option value="">All</option>
                    <option value="present">Present</option>
                    <option value="delete_pending">Delete pending</option>
                    <option value="missing">Missing</option>
                    <option value="delete_failed">Delete failed</option>
                    <option value="deleted">Deleted</option>
                  </SelectInput>
                </Field>
                <Field label="Visibility">
                  <SelectInput
                    value={registryFilters.visibility}
                    onChange={(event) =>
                      setRegistryFilters((current) => ({
                        ...current,
                        visibility: event.target.value,
                        page: 1,
                      }))
                    }
                  >
                    <option value="">All</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </SelectInput>
                </Field>
                <Field label="Reference type">
                  <SelectInput
                    value={registryFilters.referenceType}
                    onChange={(event) =>
                      setRegistryFilters((current) => ({
                        ...current,
                        referenceType: event.target.value,
                        page: 1,
                      }))
                    }
                  >
                    <option value="">All</option>
                    <option value="quote_record">Quote</option>
                    <option value="print_request">Print request</option>
                    <option value="print_request_item">Request item</option>
                    <option value="local_design_file">Design file</option>
                    <option value="local_design_image">Design image</option>
                    <option value="mmf_print_ready_file">MMF cache</option>
                    <option value="slicer_profile">Slicer profile</option>
                  </SelectInput>
                </Field>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {registryObjects.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">
                    {isLoadingRegistry ? "Loading files..." : "No files found."}
                  </p>
                ) : (
                  registryObjects.map((fileObject) => (
                    <button
                      key={fileObject.id}
                      type="button"
                      onClick={() => loadRegistryDetail(fileObject.id)}
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {fileObject.originalFileName ||
                              fileObject.storageKey}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            {fileObject.storageKey}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {fileObject.referenceTypes.join(", ") ||
                              "No references"}{" "}
                            · {fileObject.activeReferenceCount} active
                          </p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="font-medium text-slate-950">
                            {formatBytes(fileObject.fileSize)}
                          </div>
                          <div>
                            {fileObject.visibility} /{" "}
                            {fileObject.storageStatus}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {registryPagination && (
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <span>
                    Page {registryPagination.page} ·{" "}
                    {registryPagination.totalCount} files
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={Number(registryFilters.page) <= 1}
                      onClick={() =>
                        setRegistryFilters((current) => ({
                          ...current,
                          page: Math.max(1, Number(current.page || 1) - 1),
                        }))
                      }
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        Number(registryFilters.page || 1) *
                          Number(registryFilters.limit || 10) >=
                        Number(registryPagination.totalCount || 0)
                      }
                      onClick={() =>
                        setRegistryFilters((current) => ({
                          ...current,
                          page: Number(current.page || 1) + 1,
                        }))
                      }
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Guarded cleanup
              </h3>
              <div className="mt-3 space-y-3">
                <Field label="Limit">
                  <TextInput
                    type="number"
                    min="1"
                    max="5000"
                    value={registryCleanupSettings.limit}
                    onChange={(event) =>
                      setRegistryCleanupSettings((current) => ({
                        ...current,
                        limit: Number(event.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label="Reason">
                  <TextArea
                    rows={3}
                    value={registryCleanupSettings.reason}
                    placeholder="Required for real cleanup"
                    onChange={(event) =>
                      setRegistryCleanupSettings((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <Field label="Quote days">
                    <TextInput
                      type="number"
                      min="1"
                      max="3650"
                      value={registryCleanupSettings.quoteDays}
                      onChange={(event) =>
                        setRegistryCleanupSettings((current) => ({
                          ...current,
                          quoteDays: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Design days">
                    <TextInput
                      type="number"
                      min="1"
                      max="3650"
                      value={registryCleanupSettings.designDays}
                      onChange={(event) =>
                        setRegistryCleanupSettings((current) => ({
                          ...current,
                          designDays: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Request days">
                    <TextInput
                      type="number"
                      min="1"
                      max="3650"
                      value={registryCleanupSettings.requestDays}
                      onChange={(event) =>
                        setRegistryCleanupSettings((current) => ({
                          ...current,
                          requestDays: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isCleaningRegistry}
                    onClick={() => handleRegistryCleanup({ dryRun: true })}
                  >
                    {isCleaningRegistry ? "Running..." : "Run dry run"}
                  </Button>
                  <Button
                    type="button"
                    disabled={isCleaningRegistry}
                    onClick={() => handleRegistryCleanup({ dryRun: false })}
                  >
                    {isCleaningRegistry ? "Cleaning..." : "Clean eligible"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Alert className="mt-4" type="success">
            {registryMessage}
          </Alert>
          <Alert className="mt-4" type="error">
            {registryError}
          </Alert>

          {registryCleanupResult?.run && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Registry cleanup result
              </h3>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
                <ResultMetric
                  label="Candidates"
                  value={registryCleanupResult.run.candidateCount}
                />
                <ResultMetric
                  label="Deleted"
                  value={registryCleanupResult.run.deletedCount}
                />
                <ResultMetric
                  label="Skipped"
                  value={registryCleanupResult.run.skippedCount}
                />
                <ResultMetric
                  label="Missing"
                  value={registryCleanupResult.run.missingCount}
                />
                <ResultMetric
                  label="Failed"
                  value={registryCleanupResult.run.failedCount}
                />
              </div>
              {registryCleanupResult.candidates?.length > 0 && (
                <div className="mt-3 max-h-48 overflow-auto rounded-md border border-slate-100">
                  {registryCleanupResult.candidates.slice(0, 20).map((item) => (
                    <div
                      key={item.fileObject.id}
                      className="border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"
                    >
                      <div className="font-medium text-slate-950">
                        File #{item.fileObject.id}
                      </div>
                      <div className="break-all text-slate-500">
                        {item.fileObject.storageKey}
                      </div>
                      <div className="text-slate-500">{item.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {registryDetail && (
            <FileDetailPanel
              detail={registryDetail}
              onClose={() => setRegistryDetail(null)}
            />
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-950">
              Design file cleanup
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Dry-run and remove stale Design Library files, including MMF
              cached artifacts, after retention windows.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Limit">
                <TextInput
                  type="number"
                  min="1"
                  max="5000"
                  value={designCleanupSettings.limit}
                  onChange={(event) =>
                    setDesignCleanupSettings((current) => ({
                      ...current,
                      limit: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Design days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={designCleanupSettings.retentionDays}
                  onChange={(event) =>
                    setDesignCleanupSettings((current) => ({
                      ...current,
                      retentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="MMF days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={designCleanupSettings.mmfRetentionDays}
                  onChange={(event) =>
                    setDesignCleanupSettings((current) => ({
                      ...current,
                      mmfRetentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Reason">
                <TextInput
                  value={designCleanupSettings.reason}
                  placeholder="Required for real cleanup"
                  onChange={(event) =>
                    setDesignCleanupSettings((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isCleaningDesignFiles}
                onClick={() => handleDesignFileCleanup({ dryRun: true })}
              >
                {isCleaningDesignFiles ? "Running..." : "Run dry run"}
              </Button>
              <Button
                type="button"
                disabled={isCleaningDesignFiles}
                onClick={() => handleDesignFileCleanup({ dryRun: false })}
              >
                {isCleaningDesignFiles ? "Cleaning..." : "Clean eligible"}
              </Button>
            </div>
            <CleanupSummary result={designCleanupResult} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-950">
              Database retention cleanup
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Prune older audit/event records only after a dry-run review.
              Permanent customer records and snapshots stay intact.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Limit">
                <TextInput
                  type="number"
                  min="1"
                  max="100000"
                  value={retentionCleanupSettings.limit}
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      limit: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Reason">
                <TextInput
                  value={retentionCleanupSettings.reason}
                  placeholder="Required for real cleanup"
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="File access days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={retentionCleanupSettings.fileAccessEventRetentionDays}
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      fileAccessEventRetentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Moderation days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={retentionCleanupSettings.moderationRetentionDays}
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      moderationRetentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Design audit days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={retentionCleanupSettings.designAuditRetentionDays}
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      designAuditRetentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
              <Field label="Request event days">
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={retentionCleanupSettings.printRequestEventRetentionDays}
                  onChange={(event) =>
                    setRetentionCleanupSettings((current) => ({
                      ...current,
                      printRequestEventRetentionDays: Number(event.target.value),
                    }))
                  }
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isCleaningRetention}
                onClick={() => handleRetentionCleanup({ dryRun: true })}
              >
                {isCleaningRetention ? "Running..." : "Run dry run"}
              </Button>
              <Button
                type="button"
                disabled={isCleaningRetention}
                onClick={() => handleRetentionCleanup({ dryRun: false })}
              >
                {isCleaningRetention ? "Cleaning..." : "Clean eligible"}
              </Button>
            </div>
            <CleanupSummary result={retentionCleanupResult} />
          </div>
        </div>

        </Panel>
      </PageShell>
  );
}

function RegistryMetric({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">
        {value ?? 0}
      </div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function FileDetailPanel({ detail, onClose }) {
  const fileObject = detail.fileObject;
  const downloadUrl = buildFileDownloadUrl(fileObject?.downloadUrl);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            File #{fileObject.id}
          </h3>
          <p className="mt-1 break-all text-xs text-slate-500">
            {fileObject.storageKey}
          </p>
        </div>
        <div className="flex gap-2">
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download
            </a>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <ResultMetric label="Size" value={formatBytes(fileObject.fileSize)} />
        <ResultMetric label="Status" value={fileObject.storageStatus} />
        <ResultMetric label="Visibility" value={fileObject.visibility} />
        <ResultMetric
          label="Physical file"
          value={detail.physical?.exists ? "Present" : "Missing"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">References</h4>
          <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-100">
            {detail.references.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">No references.</p>
            ) : (
              detail.references.map((reference) => (
                <div
                  key={reference.id}
                  className="border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="font-medium text-slate-950">
                    {reference.referenceType} #{reference.referenceId}
                  </div>
                  <div className="text-slate-500">
                    {reference.fileRole} · {reference.status} ·{" "}
                    {reference.ownerEmail || "No owner"}
                  </div>
                  {reference.detachReason && (
                    <div className="mt-1 text-slate-500">
                      {reference.detachReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-950">Audit events</h4>
          <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-100">
            {detail.events.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">No events.</p>
            ) : (
              detail.events.map((event) => (
                <div
                  key={event.id}
                  className="border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="font-medium text-slate-950">
                    {event.eventType}
                  </div>
                  <div className="text-slate-500">
                    {event.summary || "No summary"} ·{" "}
                    {event.actorEmail || "System"}
                  </div>
                  <div className="text-slate-400">
                    {event.createdAt
                      ? new Date(event.createdAt).toLocaleString()
                      : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultMetric({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">
        {value ?? 0}
      </div>
    </div>
  );
}

function CleanupSummary({ result }) {
  if (!result) return null;

  const entries = getCleanupSummaryEntries(result);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Latest result</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {entries.map(([key, value]) => (
          <ResultMetric key={key} label={formatMetricLabel(key)} value={value} />
        ))}
      </div>
    </div>
  );
}
