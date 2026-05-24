import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { resendVerificationEmail } from "../api/auth";
import {
  getRequestDraftPreview,
  submitRequestDraft,
} from "../api/requests";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, TextInput } from "../components/ui/Form";
import { ModelSnapshotPreview } from "../components/ui/ModelSnapshotPreview";
import { PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import {
  buildRequestItemPreviewSource,
  calculateSubmissionSubtotal,
  extractCreatedPrintRequest,
  extractSubmissionPreview,
  formatMoney,
  getStepStatus,
  isExpired,
} from "../utils/print-request-submission";

export default function PrintRequestSubmission() {
  const navigate = useNavigate();
  const { draftToken } = useParams();
  const { user, reloadCurrentUser } = useAuth();
  const { reloadCart } = useCart();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    requestorName: user?.name || "",
    contactNumber: "",
    collegeDepartment: "",
    purpose: "",
    notes: "",
    termsAccepted: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [submissionPreview, setSubmissionPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  const expiredItems = useMemo(
    () => (submissionPreview?.items || []).filter(isExpired),
    [submissionPreview],
  );
  const previewItems = submissionPreview?.items || [];
  const currency = submissionPreview?.currency || "PHP";
  const subtotal = calculateSubmissionSubtotal({
    preview: submissionPreview,
    items: previewItems,
  });
  const canContinueFromReview =
    Boolean(draftToken) &&
    previewItems.length > 0 &&
    expiredItems.length === 0 &&
    !previewError &&
    Boolean(submissionPreview);

  useEffect(() => {
    let isMounted = true;

    async function loadSubmissionPreview() {
      if (!user?.isEmailVerified) {
        setSubmissionPreview(null);
        setPreviewError("");
        return;
      }

      if (!draftToken) {
        setSubmissionPreview(null);
        setPreviewError("Start request submission from a quote or your cart.");
        return;
      }

      try {
        setIsPreviewLoading(true);
        setPreviewError("");
        const data = await getRequestDraftPreview(draftToken);

        if (isMounted) {
          setSubmissionPreview(extractSubmissionPreview(data));
        }
      } catch (err) {
        if (isMounted) {
          setSubmissionPreview(null);
          setPreviewError(err.message);
        }
      } finally {
        if (isMounted) {
          setIsPreviewLoading(false);
        }
      }
    }

    loadSubmissionPreview();

    return () => {
      isMounted = false;
    };
  }, [draftToken, user?.isEmailVerified]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!draftToken) {
      navigate("/cart");
      return;
    }

    if (expiredItems.length > 0 || previewError || !submissionPreview) {
      setError(
        previewError ||
          "Return to cart and remove expired quote items before submission.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      const data = await submitRequestDraft(draftToken, {
        ...form,
        termsAccepted: form.termsAccepted,
      });
      const createdRequest = extractCreatedPrintRequest(data);
      await reloadCart();

      if (createdRequest?.id) {
        navigate(`/requests/${createdRequest.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSummaryAction() {
    if (step === 1) {
      if (!canContinueFromReview) return;
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (step === 2) {
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleResendVerification() {
    try {
      setIsSendingVerification(true);
      setVerificationMessage("");
      setVerificationError("");
      const response = await resendVerificationEmail();

      setVerificationMessage(
        response.message || "Verification email sent successfully.",
      );
    } catch (err) {
      setVerificationError(
        err.message || "We could not send the verification email.",
      );
    } finally {
      setIsSendingVerification(false);
    }
  }

  if (!user?.isEmailVerified) {
    return (
      <PageShell size="sm">
        <Panel className="unifab-request-submit unifab-request-submit__verify-panel">
          <div className="space-y-5">
            <div className="unifab-request-submit__header">
              <p>
                Verification required
              </p>
              <h1>
                Verify your email to submit a print request
              </h1>
              <p>
                Verify your email, then return here to review your account cart
                and submit the request.
              </p>
            </div>

            {verificationMessage && (
              <Alert type="success">{verificationMessage}</Alert>
            )}
            {verificationError && (
              <Alert type="error">{verificationError}</Alert>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleResendVerification}
                disabled={isSendingVerification}
              >
                {isSendingVerification
                  ? "Sending..."
                  : "Resend verification email"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={reloadCurrentUser}
              >
                I already verified
              </Button>
              <ButtonLink to="/cart" variant="secondary">
                Back to cart
              </ButtonLink>
            </div>
          </div>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell size="lg">
      <form onSubmit={handleSubmit} className="unifab-request-submit space-y-4">
        <div className="unifab-request-submit__topbar">
          <div className="unifab-request-submit__header">
            <p>
              Print request submission
            </p>
            <h1>
              {step === 1
                ? "Review order items"
                : step === 2
                  ? "Confirm client information"
                  : "Submit print request"}
            </h1>
          </div>
          <ButtonLink to="/cart" variant="secondary">
            Back to cart
          </ButtonLink>
        </div>

        <div className="unifab-request-submit__layout">
          <div className="space-y-4">
            <StepPanel
              number={1}
              title="Review order items"
              currentStep={step}
            >
              {step === 1 ? (
                <div className="unifab-request-submit__items">
                  {previewItems.map((item) => (
                    <div
                      key={item.id || item.quoteRecordId}
                      className="unifab-request-submit__item-row"
                    >
                      <ModelSnapshotPreview
                        source={buildRequestItemPreviewSource(item)}
                        className="unifab-request-submit__preview"
                        fallbackClassName="unifab-request-submit__preview-fallback"
                        fallbackLabel="Preview"
                        viewerClassName="h-80"
                      />
                      <div className="min-w-0">
                        <p className="unifab-request-submit__item-title">
                          {item.label}
                        </p>
                        <p className="unifab-request-submit__item-meta">
                          {[item.material, item.materialColorName]
                            .filter(Boolean)
                            .join(" / ")}{" "}
                          / {item.printQuality} / {item.infill}% infill
                        </p>
                      </div>
                      <p className="unifab-request-submit__qty">
                        Qty {item.quantity}
                      </p>
                      <p className="unifab-request-submit__price">
                        {formatMoney(item.estimatedCost, item.currency || currency)}
                      </p>
                    </div>
                  ))}
                  {isPreviewLoading && (
                    <p className="unifab-request-submit__loading">
                      Validating quote items with the server...
                    </p>
                  )}
                  {previewError && (
                    <Alert className="mt-4" type="error">
                      {previewError}
                    </Alert>
                  )}
                </div>
              ) : (
                <StepSummary>
                  {submissionPreview?.itemCount || previewItems.length} item
                  {(submissionPreview?.itemCount || previewItems.length) === 1
                    ? ""
                    : "s"}{" "}
                  reviewed.
                </StepSummary>
              )}
            </StepPanel>

            <StepPanel
              number={2}
              title="Client information"
              currentStep={step}
            >
              {step === 2 ? (
                <>
                  <div className="unifab-request-submit__form-grid">
                    <Field label="Client name">
                      <TextInput
                        value={form.requestorName}
                        onChange={(event) =>
                          updateField("requestorName", event.target.value)
                        }
                        required
                      />
                    </Field>
                    <Field label="Contact number">
                      <TextInput
                        value={form.contactNumber}
                        onChange={(event) =>
                          updateField("contactNumber", event.target.value)
                        }
                        required
                      />
                    </Field>
                    <Field label="College/department">
                      <TextInput
                        value={form.collegeDepartment}
                        onChange={(event) =>
                          updateField("collegeDepartment", event.target.value)
                        }
                        required
                      />
                    </Field>
                    <Field label="Purpose/use case">
                      <textarea
                        value={form.purpose}
                        onChange={(event) =>
                          updateField("purpose", event.target.value)
                        }
                        rows={3}
                        className="unifab-request-submit__textarea"
                        required
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Notes">
                      <textarea
                        value={form.notes}
                        onChange={(event) =>
                          updateField("notes", event.target.value)
                        }
                        rows={3}
                        className="unifab-request-submit__textarea"
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <StepSummary>
                  {step > 2
                    ? `${form.requestorName || "Client"} / ${form.contactNumber || "No contact number"}`
                    : "Complete after reviewing the order items."}
                </StepSummary>
              )}
            </StepPanel>

            <StepPanel
              number={3}
              title="Submit request"
              currentStep={step}
            >
              {step === 3 ? (
                <>
                  <p className="text-sm leading-6 text-slate-600">
                    Confirm that the items and client information are correct.
                    UniFab will preserve the quote snapshots and admins will
                    review the request before payment slip issuance.
                  </p>
                  <label className="unifab-request-submit__terms">
                    <input
                      type="checkbox"
                      checked={form.termsAccepted}
                      onChange={(event) =>
                        updateField("termsAccepted", event.target.checked)
                      }
                      className="mt-1"
                      required
                    />
                    <span>
                      I agree to the{" "}
                      <Link
                        to="/terms"
                        className="font-semibold text-slate-950 underline"
                      >
                        Terms and Conditions
                      </Link>
                      .
                    </span>
                  </label>
                  <Alert className="mt-4" type="error">
                    {error}
                  </Alert>
                </>
              ) : (
                <StepSummary>
                  Final submission is available after client information.
                </StepSummary>
              )}
            </StepPanel>
          </div>

          <Panel className="unifab-request-submit__summary h-fit shadow-none">
            <div className="unifab-request-submit__summary-head">
              <h2>
                Summary
              </h2>
            </div>
            <div className="unifab-request-submit__summary-body">
              <div className="space-y-3 text-sm">
                <SummaryLine label="Items">
                  {submissionPreview?.itemCount || previewItems.length}
                </SummaryLine>
                <SummaryLine label="Subtotal" strong>
                  {formatMoney(subtotal, currency)}
                </SummaryLine>
              </div>
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={handleSummaryAction}
                  disabled={
                    isPreviewLoading || (step === 1 && !canContinueFromReview)
                  }
                  className="mt-5 w-full"
                >
                  {isPreviewLoading ? "Validating..." : "Continue"}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={
                    !draftToken ||
                    isSubmitting ||
                    expiredItems.length > 0 ||
                    previewError ||
                    !form.termsAccepted ||
                    !submissionPreview
                  }
                  className="mt-5 w-full"
                >
                  {isSubmitting ? "Submitting..." : "Submit print request"}
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </form>
    </PageShell>
  );
}

function StepPanel({ number, title, currentStep, children }) {
  const { status, className } = getStepStatus({ number, currentStep });

  return (
    <Panel className="unifab-request-submit__step-panel shadow-none">
      <div className="unifab-request-submit__step-head">
        <h2>
          {number}. {title}
        </h2>
        <span className={`unifab-request-submit__step-status ${className}`}>
          {status}
        </span>
      </div>
      <div className="unifab-request-submit__step-body">{children}</div>
    </Panel>
  );
}

function StepSummary({ children }) {
  return <p className="unifab-request-submit__step-summary">{children}</p>;
}

function SummaryLine({ label, children, strong = false }) {
  return (
    <div className="unifab-request-submit__summary-line">
      <span className={strong ? "is-strong" : ""}>
        {label}
      </span>
      <span className={strong ? "is-strong" : ""}>
        {children}
      </span>
    </div>
  );
}
