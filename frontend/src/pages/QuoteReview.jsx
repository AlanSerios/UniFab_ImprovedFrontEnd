import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { getQuoteByToken } from "../api/quotes";
import { submitPrintRequestFromQuote } from "../api/requests";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";

export default function QuoteReview() {
  const { quoteToken } = useParams();

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [quote, setQuote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const quoteSnapshot = quote?.quoteSnapshot;

  const handleSubmitRequest = async () => {
    if (!isAuthenticated) {
      navigate("/login", {
        state: { from: `/quote/${quoteToken}` },
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitMessage("");
      setError("");

      const data = await submitPrintRequestFromQuote(quoteToken, {
        termsAccepted: true,
      });

      const createdRequest =
        data.data?.printRequest ||
        data.data?.request ||
        data.printRequest ||
        data.request;

      setSubmitMessage("Print request submitted successfully.");

      if (createdRequest?.id) {
        navigate(`/requests/${createdRequest.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    async function loadQuote() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getQuoteByToken(quoteToken);
        setQuote(data.data?.quote || data.quote || data);
      } catch (err) {
        setError(err.message);
        setQuote(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadQuote();
  }, [quoteToken]);

  return (
    <PageShell size="md">
      <Panel>
        <PageHeader title="Quote review" />

        <div className="mt-6 rounded-md bg-slate-100 p-4">
          <p className="text-sm font-medium text-slate-500">Quote token</p>
          <p className="mt-1 font-mono text-sm text-slate-950">{quoteToken}</p>
        </div>

        {isLoading && <p className="mt-6 text-slate-600">Loading quote...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {quote && (
          <div className="mt-6 grid gap-4 rounded-lg border border-slate-200 p-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Source</p>
              <p className="font-semibold text-slate-950">
                {getQuoteSourceLabel(quote)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-500">Material</p>
                <p className="font-semibold text-slate-950">{quote.material}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">Quality</p>
                <p className="font-semibold text-slate-950">
                  {quote.printQuality}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">Infill</p>
                <p className="font-semibold text-slate-950">{quote.infill}%</p>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">Quantity</p>
                <p className="font-semibold text-slate-950">{quote.quantity}</p>
                {quote.quantity > 1 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Slicing is validated per copy; pricing is multiplied by
                    quantity.
                  </p>
                )}
              </div>
            </div>

            {quoteSnapshot && (
              <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Print time
                  </p>
                  <p className="font-semibold text-slate-950">
                    {Math.round(quoteSnapshot.estimatedPrintTimeMinutes || 0)}{" "}
                    minutes
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Filament weight
                  </p>
                  <p className="font-semibold text-slate-950">
                    {Number(quoteSnapshot.filamentWeightGrams || 0).toFixed(2)}{" "}
                    g
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Filament length
                  </p>
                  <p className="font-semibold text-slate-950">
                    {Number(quoteSnapshot.filamentLengthMeters || 0).toFixed(2)}{" "}
                    m
                  </p>
                </div>
              </div>
            )}

            {quoteSnapshot?.warnings?.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <h3 className="font-semibold text-amber-800">
                  Pre-flight Warnings
                </h3>
                <ul className="mt-2 list-inside list-disc text-sm text-amber-700 space-y-1">
                  {quoteSnapshot.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md bg-slate-950 p-4 text-white shadow-sm">
              <p className="text-sm text-slate-300">Estimated cost</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                PHP {Number(quote.estimatedCost || 0).toFixed(2)}
              </p>
            </div>

            {quote.expiresAt && (
              <p className="text-sm text-slate-500">
                Quote expires at: {new Date(quote.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {quote && (
          <div className="mt-8 space-y-4 border-t border-slate-200 pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-6 items-center">
                <input
                  id="terms-checkbox"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                />
              </div>
              <label htmlFor="terms-checkbox" className="text-sm leading-6 text-slate-600">
                I agree to the{" "}
                <Link to="/terms" className="font-semibold text-slate-950 hover:underline">
                  Terms and Conditions
                </Link>
                , acknowledging the lab's policies on print failures, material usage, and turnaround times.
              </label>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSubmitRequest}
                disabled={isSubmitting || !agreedToTerms}
              >
                {isSubmitting ? "Submitting..." : "Submit print request"}
              </Button>

              <p className="text-sm text-slate-500">
                Quote viewing is public. Submission requires login.
              </p>
            </div>
          </div>
        )}

        <Alert className="mt-6" type="success">
          {submitMessage}
        </Alert>
      </Panel>
    </PageShell>
  );
}

function getQuoteSourceLabel(quote) {
  if (quote.fileOriginalName) {
    return quote.fileOriginalName;
  }

  if (quote.sourceType === "library") {
    return quote.designSnapshot?.title || "Local design";
  }

  if (quote.sourceType === "design_request") {
    return (
      quote.designSnapshot?.designRequest?.title || "Completed design request"
    );
  }

  if (quote.sourceType === "mmf") {
    return quote.designSnapshot?.name || "MyMiniFactory design";
  }

  return "Uploaded model";
}
