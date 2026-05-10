import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE_URL } from "../../api/client";
import {
  getAdminLocalDesignById,
  moderateAdminLocalDesign,
  updateAdminLocalDesignPrintReady,
} from "../../api/designs";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Alert, StatusBadge } from "../../components/ui/Feedback";
import {
  Field,
  FormSection,
  SelectInput,
  TextArea,
} from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  getDecisionSourceLabel,
  getDecisionSourceTone,
  getModerationStatusLabel,
  getModerationStatusTone,
  getSeverityTone,
  parseModerationFlags,
} from "../../utils/moderation-display";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);

function assetUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function AdminCommunityDesignDetail() {
  const { designId } = useParams();

  const [design, setDesign] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [auditEvents, setAuditEvents] = useState([]);

  const isApproved = useMemo(
    () => APPROVED_STATUSES.has(design?.moderationStatus),
    [design],
  );
  const moderationFlags = useMemo(
    () => parseModerationFlags(design?.moderationFlags),
    [design?.moderationFlags],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadInitialDesign() {
      try {
        const data = await getAdminLocalDesignById(designId);
        const payload = data.data || data;
        const localDesign = payload.localDesign || payload.design;

        if (localDesign?.sourceKind !== "community") {
          throw new Error(
            "This page only reviews community-submitted designs.",
          );
        }

        if (isMounted) {
          setDesign(localDesign);
          setAuditEvents(payload.auditEvents || []);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setDesign(null);
          setAuditEvents([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialDesign();

    return () => {
      isMounted = false;
    };
  }, [designId]);

  const handleModerationSubmit = async (event) => {
    event.preventDefault();

    if (!action) {
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage("");
      setError("");

      const data = await moderateAdminLocalDesign(designId, {
        action,
        feedback,
      });
      const payload = data.data || data;

      setDesign(payload.localDesign || payload.design);
      setAction("");
      setFeedback("");
      setMessage("Moderation action applied successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePrintReady = async () => {
    const nextPrintReady = !design?.isPrintReady;

    if (
      nextPrintReady &&
      !window.confirm(
        "Mark this design as Print Ready only after downloading and verifying the file locally in PrusaSlicer.",
      )
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage("");
      setError("");

      const data = await updateAdminLocalDesignPrintReady(designId, {
        isPrintReady: nextPrintReady,
      });
      const payload = data.data || data;

      setDesign(payload.localDesign || payload.design);
      setMessage("Print Ready status updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title={design?.title || "Community Design Review"}
          description="Review user-submitted design metadata, moderation results, public visibility, and separate Print Ready status."
          action={
            <ButtonLink to="/admin/community-designs" variant="secondary">
              Back to Community Designs
            </ButtonLink>
          }
          meta={
            design ? (
              <StatusBadge
                tone={getModerationStatusTone(design.moderationStatus)}
              >
                {getModerationStatusLabel(design.moderationStatus)}
              </StatusBadge>
            ) : null
          }
        />

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading design details...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        <Alert className="mt-6" type="success">
          {message}
        </Alert>

        {!isLoading && design && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <Panel className="bg-slate-50 shadow-none">
                <h2 className="text-lg font-semibold text-slate-950">
                  Submission
                </h2>

                {design.thumbnailUrl && (
                  <img
                    src={assetUrl(design.thumbnailUrl)}
                    alt=""
                    className="mt-4 max-h-80 w-full rounded-md border border-slate-200 object-cover"
                  />
                )}

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {design.description || "No description provided."}
                </p>

                <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                  <SummaryItem label="Owner">
                    User #{design.uploadedBy || "-"}
                  </SummaryItem>
                  <SummaryItem label="Category">
                    {design.category?.name || "-"}
                  </SummaryItem>
                  <SummaryItem label="Tags">
                    {(design.tags || []).length > 0
                      ? design.tags.map((tag) => tag.name).join(", ")
                      : "-"}
                  </SummaryItem>
                  <SummaryItem label="License">
                    {design.licenseType || "-"}
                  </SummaryItem>
                  <SummaryItem label="Ownership Confirmed">
                    {design.ownershipConfirmed ? "Yes" : "No"}
                  </SummaryItem>
                  <SummaryItem label="Policy Acknowledged">
                    {design.policyAcknowledged ? "Yes" : "No"}
                  </SummaryItem>
                  <SummaryItem label="Updated">
                    {formatDate(design.updatedAt)}
                  </SummaryItem>
                  <SummaryItem label="Published">
                    {formatDate(design.publishedAt)}
                  </SummaryItem>
                </div>

                {design.fileUrl && (
                  <ButtonLink
                    to={assetUrl(design.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6"
                    variant="secondary"
                  >
                    Download Design File
                  </ButtonLink>
                )}
              </Panel>

              <Panel className="bg-slate-50 shadow-none">
                <h2 className="text-lg font-semibold text-slate-950">
                  Moderation Record
                </h2>

                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <SummaryItem label="Decision Source">
                    <StatusBadge
                      tone={getDecisionSourceTone(
                        design.moderationDecisionSource,
                      )}
                    >
                      {getDecisionSourceLabel(design.moderationDecisionSource)}
                    </StatusBadge>
                  </SummaryItem>
                  <SummaryItem label="Reviewed">
                    {formatDate(design.reviewedAt)}
                  </SummaryItem>
                </div>

                {design.moderationSummary && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-500">
                      Summary
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">
                      {design.moderationSummary}
                    </p>
                  </div>
                )}

                {design.moderationFeedback && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-500">
                      Owner Feedback
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {design.moderationFeedback}
                    </p>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-500">Flags</p>
                  {moderationFlags.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-600">
                      No moderation flags recorded.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {moderationFlags.map((flag, index) => (
                        <ModerationFlag
                          key={`${flag.source || "flag"}-${flag.category || index}-${index}`}
                          flag={flag}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel className="bg-slate-50 shadow-none">
                <h2 className="text-lg font-semibold text-slate-950">
                  History
                </h2>

                {auditEvents.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">
                    No audit events recorded.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {auditEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-md border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">
                            {event.eventType.replaceAll("_", " ")}
                          </p>
                          <span className="text-xs text-slate-500">
                            {event.createdAt
                              ? new Date(event.createdAt).toLocaleString()
                              : "-"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {event.summary || "No summary provided."}
                        </p>
                        {(event.fromStatus || event.toStatus) && (
                          <p className="mt-1 text-xs text-slate-500">
                            {event.fromStatus || "-"} -&gt;{" "}
                            {event.toStatus || "-"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel className="bg-slate-50 shadow-none">
                <h2 className="text-lg font-semibold text-slate-950">
                  Admin Action
                </h2>

                <form
                  onSubmit={handleModerationSubmit}
                  className="mt-4 space-y-4"
                >
                  <FormSection columns="grid-cols-1">
                    <Field label="Action">
                      <SelectInput
                        required
                        value={action}
                        onChange={(event) => setAction(event.target.value)}
                      >
                        <option value="">Select an action</option>
                        <option value="approve">Approve for Public View</option>
                        <option value="reject">Reject</option>
                        <option value="hide">Hide</option>
                        <option value="restore">Restore</option>
                        <option value="send_to_review">Send to Review</option>
                      </SelectInput>
                    </Field>

                    <Field label="Feedback">
                      <TextArea
                        rows={4}
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        placeholder="Optional owner-facing feedback."
                      />
                    </Field>
                  </FormSection>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !action}
                    className="w-full"
                  >
                    {isSubmitting ? "Applying..." : "Apply Action"}
                  </Button>
                </form>
              </Panel>

              <Panel className="bg-slate-50 shadow-none">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Print Ready
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Mark only after local file verification. Content approval
                      does not make a file ready for instant quote.
                    </p>
                  </div>
                  <StatusBadge
                    tone={design.isPrintReady ? "success" : "neutral"}
                  >
                    {design.isPrintReady ? "Ready" : "Not Ready"}
                  </StatusBadge>
                </div>

                <Button
                  type="button"
                  variant={design.isPrintReady ? "danger" : "secondary"}
                  disabled={isSubmitting || !isApproved}
                  onClick={handleTogglePrintReady}
                  className="mt-4 w-full"
                >
                  {design.isPrintReady
                    ? "Remove Print Ready"
                    : "Mark Print Ready"}
                </Button>

                {!isApproved && (
                  <p className="mt-3 text-xs leading-5 text-red-600">
                    Approve the design before marking it Print Ready.
                  </p>
                )}
              </Panel>
            </div>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function SummaryItem({ label, children }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-1 font-semibold text-slate-950">{children}</div>
    </div>
  );
}
function ModerationFlag({ flag }) {
  const extraDetails = Object.entries(flag || {}).filter(
    ([key, value]) =>
      !["source", "severity", "category"].includes(key) &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={getDecisionSourceTone(flag.source)}>
          {getDecisionSourceLabel(flag.source)}
        </StatusBadge>

        <StatusBadge tone={getSeverityTone(flag.severity)}>
          {String(flag.severity || "info").replaceAll("_", " ")}
        </StatusBadge>

        <span className="text-sm font-medium text-slate-800">
          {String(flag.category || "unknown").replaceAll("_", " ")}
        </span>
      </div>

      {extraDetails.length > 0 && (
        <dl className="mt-2 space-y-1 text-xs text-slate-600">
          {extraDetails.map(([key, value]) => (
            <div key={key}>
              <dt className="inline font-medium text-slate-500">
                {String(key).replaceAll("_", " ")}:
              </dt>{" "}
              <dd className="inline break-words">
                {typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
