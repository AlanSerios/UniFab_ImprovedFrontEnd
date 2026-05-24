import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { rememberVerifiedDestination } from "../utils/verification-destination";
import { createRequestDraft } from "../api/requests";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { addItem } = useCart();

  const redirectTo = location.state?.from || "/dashboard";
  const pendingQuoteToken = location.state?.pendingQuoteToken || "";
  const pendingCartAction = location.state?.pendingCartAction || "cart";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError("");

      const user = await login({ email, password });

      if (!user.isEmailVerified) {
        rememberVerifiedDestination(redirectTo);
        navigate("/verify-required", {
          replace: true,
          state: { from: redirectTo },
        });
        return;
      }

      if (user.role === "admin" && redirectTo === "/dashboard") {
        navigate("/admin");
        return;
      }

      if (pendingQuoteToken) {
        const result = await addItem(pendingQuoteToken);
        let submitPath = "/cart";

        if (pendingCartAction === "submit") {
          if (!result?.addedItem?.id) {
            throw new Error("Quote was added, but no cart item was returned.");
          }

          const data = await createRequestDraft({
            cartItemIds: [result.addedItem.id],
          });
          const draft = data.data?.draft || data.draft;

          if (!draft?.draftToken) {
            throw new Error("Request draft was created without a token.");
          }

          submitPath = `/requests/new/${draft.draftToken}`;
        }

        navigate(pendingCartAction === "submit" ? submitPath : "/cart");
        return;
      }

      navigate(redirectTo);
    } catch (err) {
      setError(err.message || "Unable to login. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell size="sm">
      <div className="unifab-auth unifab-auth--main">
        <Panel className="unifab-auth__panel">
          <PageHeader
            title="Login"
            description="Sign in to submit print requests and track fabrication progress."
          />

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Email">
              <TextInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <TextInput
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="pr-11"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-950"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </Field>

            <p className="text-right text-sm">
              <Link
                to="/forgot-password"
                className="font-semibold text-slate-950 underline"
              >
                Forgot password?
              </Link>
            </p>

            {error && <Alert type="error">{error}</Alert>}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Signing in..." : "Login"}
            </Button>

            <p className="text-center text-sm text-slate-500">
              Need an account?{" "}
              <Link
                to="/register"
                state={{
                  from: redirectTo,
                  pendingQuoteToken,
                  pendingCartAction,
                }}
                className="font-semibold text-slate-950 underline"
              >
                Create one
              </Link>
            </p>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
