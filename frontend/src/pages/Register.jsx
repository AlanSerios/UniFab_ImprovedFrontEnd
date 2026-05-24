import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { registerUser } from "../api/auth";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

export default function Register() {
  const location = useLocation();
  const redirectTo = location.state?.from || "/dashboard";
  const pendingQuoteToken = location.state?.pendingQuoteToken || "";
  const pendingCartAction = location.state?.pendingCartAction || "cart";
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    userType: "student",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError("");
      setSuccessMessage("");

      const data = await registerUser(form);

      setSuccessMessage(
        data.message ||
          "Account created successfully. Please verify your email before submitting print requests.",
      );

      setForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        userType: "student",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell size="sm">
      <div className="unifab-auth unifab-auth--main">
        <Panel className="unifab-auth__panel">
          <PageHeader
            title="Create account"
            description="Register as a client to submit print requests and track progress."
          />

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <TextInput
                  type="text"
                  value={form.firstName}
                  onChange={(event) =>
                    updateField("firstName", event.target.value)
                  }
                  required
                />
              </Field>

              <Field label="Last name">
                <TextInput
                  type="text"
                  value={form.lastName}
                  onChange={(event) =>
                    updateField("lastName", event.target.value)
                  }
                  required
                />
              </Field>
            </div>

            <Field label="Email">
              <TextInput
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
              />
            </Field>

            <Field label="User type">
              <SelectInput
                value={form.userType}
                onChange={(event) =>
                  updateField("userType", event.target.value)
                }
                required
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="researcher">Researcher</option>
                <option value="others">Others</option>
              </SelectInput>
            </Field>

            <Field label="Password">
              <div className="relative">
                <TextInput
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) =>
                    updateField("password", event.target.value)
                  }
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

            <Alert type="error">{error}</Alert>

            {successMessage && (
              <Alert type="success">
                {successMessage}
                <div className="mt-2">
                  <ButtonLink
                    to="/login"
                    state={{
                      from: redirectTo,
                      pendingQuoteToken,
                      pendingCartAction,
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Go to login
                  </ButtonLink>
                </div>
              </Alert>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
