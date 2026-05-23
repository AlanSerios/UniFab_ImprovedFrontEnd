import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { resendVerificationEmail } from "../api/auth";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import {
  consumeVerifiedDestination,
  getSafeDestination,
  rememberVerifiedDestination,
} from "../utils/verification-destination";

export default function VerifyRequired() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, reloadCurrentUser } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intendedDestination = useMemo(
    () => getSafeDestination(location.state?.from || "/dashboard"),
    [location.state?.from],
  );

  useEffect(() => {
    rememberVerifiedDestination(intendedDestination);
  }, [intendedDestination]);

  async function handleResendVerification() {
    try {
      setIsSendingVerification(true);
      setMessage("");
      setError("");
      const response = await resendVerificationEmail();

      setMessage(response.message || "Verification email sent successfully.");
    } catch (err) {
      setError(err.message || "We could not send the verification email.");
    } finally {
      setIsSendingVerification(false);
    }
  }

  async function handleRefreshStatus() {
    try {
      setIsRefreshing(true);
      setMessage("");
      setError("");
      const currentUser = await reloadCurrentUser();

      if (currentUser?.isEmailVerified) {
        navigate(consumeVerifiedDestination(intendedDestination), {
          replace: true,
        });
        return;
      }

      setMessage("Your account is still waiting for email verification.");
    } catch (err) {
      setError(err.message || "We could not refresh your verification status.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  if (user?.isEmailVerified) {
    return (
      <Navigate
        to={consumeVerifiedDestination(intendedDestination)}
        replace
      />
    );
  }

  return (
    <PageShell size="sm">
      <Panel>
        <PageHeader
          title="Verify your email"
          description="Your UniFab account is created, but it is not fully active until your email address is verified."
        />

        <div className="mt-6 space-y-4 text-sm leading-6 text-slate-600">
          <p>
            We sent a verification link to{" "}
            <span className="font-semibold text-slate-950">{user?.email}</span>.
            After verification, you can continue to your dashboard, submit print
            requests, and manage your designs.
          </p>
          <p>
            You can keep reviewing public quotes, and your account cart will be
            available after verification.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {message && <Alert type="success">{message}</Alert>}
          {error && <Alert type="error">{error}</Alert>}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            onClick={handleResendVerification}
            disabled={isSendingVerification}
          >
            {isSendingVerification ? "Sending..." : "Resend verification email"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRefreshStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Checking..." : "I already verified"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Need to change accounts?{" "}
          <ButtonLink to="/login" variant="subtle" size="sm">
            Go to login
          </ButtonLink>
        </p>
      </Panel>
    </PageShell>
  );
}
