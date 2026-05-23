import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { changeCurrentPassword, resendVerificationEmail } from "../api/auth";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";

export default function AccountSettings() {
  const { user, reloadCurrentUser } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationError, setVerificationError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await changeCurrentPassword({
        oldPassword,
        newPassword,
      });

      setMessage(response.message || "Password changed successfully.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "We could not change your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    setVerificationMessage("");
    setVerificationError("");
    setIsSendingVerification(true);

    try {
      const response = await resendVerificationEmail();

      setVerificationMessage(
        response.message || "Verification email sent successfully.",
      );
      await reloadCurrentUser();
    } catch (err) {
      setVerificationError(
        err.message || "We could not send the verification email.",
      );
    } finally {
      setIsSendingVerification(false);
    }
  }

  return (
    <PageShell size="sm">
      <div className="space-y-6">
        <PageHeader
          title="Account settings"
          description="Manage your password and email verification settings."
        />

        <Panel>
          <div className="border-b border-slate-200 pb-5">
            <h2 className="text-lg font-semibold text-slate-950">
              Change password
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Update the password used to access your UniFab account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <Field label="Current password">
              <div className="relative">
                <TextInput
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  autoComplete="current-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword((current) => !current)}
                  aria-label={showOldPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-950"
                >
                  {showOldPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </Field>

            <Field label="New password">
              <div className="relative">
                <TextInput
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((current) => !current)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-950"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </Field>

            <Field label="Confirm new password">
              <div className="relative">
                <TextInput
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-950"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </Field>

            <div className="space-y-3">
              {message && <Alert type="success">{message}</Alert>}
              {error && <Alert type="error">{error}</Alert>}
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Saving..." : "Change password"}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Email verification
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                {user?.isEmailVerified
                  ? "Your email address is verified and can be used for print request submission."
                  : "Request a new verification email if your original link expired or did not arrive."}
              </p>
            </div>

            {user?.isEmailVerified ? (
              <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Verified
              </span>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={handleResendVerification}
                disabled={isSendingVerification}
                className="w-full sm:w-auto sm:shrink-0"
              >
                {isSendingVerification
                  ? "Sending..."
                  : "Resend verification email"}
              </Button>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {verificationMessage && (
              <Alert type="success">{verificationMessage}</Alert>
            )}

            {verificationError && (
              <Alert type="error">{verificationError}</Alert>
            )}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
