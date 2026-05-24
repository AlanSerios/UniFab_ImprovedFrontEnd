import { useState } from "react";
import { Link } from "react-router-dom";

import { forgotPassword } from "../api/auth";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setError("");

    try {
      const response = await forgotPassword({ email });
      setMessage(
        response.message ||
          "If an account exists for that email, a reset link has been sent.",
      );
    } catch (err) {
      setError(err.message || "We could not send a reset link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell size="sm">
      <div className="unifab-auth unifab-auth--utility">
        <Panel className="unifab-auth__panel">
          <PageHeader
            title="Forgot password"
            description="Enter your account email and we will send password reset instructions."
          />

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Email">
              <TextInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>

            <Alert type="success">{message}</Alert>
            <Alert type="error">{error}</Alert>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Remembered your password?{" "}
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
