import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { verifyEmail } from "../api/auth";
import { ButtonLink } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { consumeVerifiedDestination } from "../utils/verification-destination";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { verificationToken } = useParams();
  const { isAuthenticated, reloadCurrentUser } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [verifiedDestination, setVerifiedDestination] = useState("/dashboard");

  useEffect(() => {
    let shouldIgnore = false;

    async function confirmEmail() {
      try {
        const response = await verifyEmail(verificationToken);

        if (!shouldIgnore) {
          setMessage(response.message || "Email verified successfully.");
        }

        if (isAuthenticated) {
          const destination = consumeVerifiedDestination("/dashboard");
          setVerifiedDestination(destination);
          await reloadCurrentUser();

          if (!shouldIgnore) {
            navigate(destination, { replace: true });
          }
        }
      } catch (err) {
        if (!shouldIgnore) {
          setError(err.message || "We could not verify your email.");
        }
      } finally {
        if (!shouldIgnore) {
          setIsLoading(false);
        }
      }
    }

    confirmEmail();

    return () => {
      shouldIgnore = true;
    };
  }, [isAuthenticated, navigate, reloadCurrentUser, verificationToken]);

  return (
    <PageShell size="sm">
      <Panel>
        <PageHeader
          title="Verify email"
          description="We are checking your email verification link."
        />

        {isLoading && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Verifying email...
          </div>
        )}

        <Alert className="mt-6" type="success">
          {message}
        </Alert>

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        <div className="mt-6 flex justify-center">
          <ButtonLink to={isAuthenticated ? verifiedDestination : "/login"}>
            {isAuthenticated ? "Continue" : "Go to login"}
          </ButtonLink>
        </div>

        {error && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Need a new link? Sign in and request another verification email.
          </p>
        )}
      </Panel>
    </PageShell>
  );
}
