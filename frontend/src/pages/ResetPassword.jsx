import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { resetForgotPassword } from "../api/auth";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

export default function ResetPassword() {
  const { resetToken } = useParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setError("");

    try {
      const response = await resetForgotPassword(resetToken, {
        newPassword: password,
      });

      setMessage(response.message || "Password reset successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "We could not reset your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell size="sm">
      <div className="unifab-auth unifab-auth--utility">
        <Panel className="unifab-auth__panel">
          <PageHeader
            title="Reset password"
            description="Set a new password for your UniFab account."
          />

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="New password">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>

            <Field label="Confirm password">
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </Field>

            <Alert type="success">{message}</Alert>
            <Alert type="error">{error}</Alert>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Password already reset?{" "}
            <Link
              to="/login"
              className="font-semibold text-slate-950 underline"
            >
              Back to login
            </Link>
          </p>
        </Panel>
      </div>
    </PageShell>
  );
}
