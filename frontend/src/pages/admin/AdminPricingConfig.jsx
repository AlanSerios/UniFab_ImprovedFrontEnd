import { useEffect, useState } from "react";

import { getPricingConfig, updatePricingConfig } from "../../api/pricingConfig";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Feedback";
import { Field, FormSection, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const EMPTY_FORM = {
  machine_hour_rate: "",
  base_fee: "",
  waste_factor: "",
  support_markup_factor: "",
  electricity_cost_per_kwh: "",
  power_consumption_watts: "",
  currency: "PHP",
};

function getConfig(response) {
  return response.data?.pricingConfig || response.pricingConfig || null;
}

function toForm(config) {
  return {
    machine_hour_rate: String(config.machine_hour_rate ?? ""),
    base_fee: String(config.base_fee ?? ""),
    waste_factor: String(config.waste_factor ?? ""),
    support_markup_factor: String(config.support_markup_factor ?? ""),
    electricity_cost_per_kwh: String(config.electricity_cost_per_kwh ?? ""),
    power_consumption_watts: String(config.power_consumption_watts ?? ""),
    currency: config.currency || "PHP",
  };
}

export default function AdminPricingConfig() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let shouldIgnore = false;

    getPricingConfig()
      .then((response) => {
        if (shouldIgnore) {
          return;
        }

        const config = getConfig(response);

        if (!config) {
          setError("Pricing config was not found.");
          return;
        }

        setForm(toForm(config));
        setLastUpdatedAt(config.updated_at || "");
      })
      .catch((err) => {
        if (!shouldIgnore) {
          setError(err.message || "Failed to load pricing config.");
        }
      })
      .finally(() => {
        if (!shouldIgnore) {
          setIsLoading(false);
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await updatePricingConfig({
        ...form,
        currency: form.currency.trim().toUpperCase(),
      });

      const config = getConfig(response);
      setForm(toForm(config));
      setLastUpdatedAt(config.updated_at || "");
      setMessage("Pricing config updated successfully.");
    } catch (err) {
      setError(err.message || "Failed to update pricing config.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageShell size="lg">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-config-page unifab-admin-page--pricing">
        <PageHeader
          title="Pricing config"
          description="Manage the rates used for future slicer-based quote calculations."
          meta={
            lastUpdatedAt
              ? `Updated ${new Date(lastUpdatedAt).toLocaleDateString()}`
              : null
          }
        />

        <Alert className="mt-4" type="success">
          {message}
        </Alert>

        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        {isLoading ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Loading pricing config...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-6"
          >
            <FormSection>
              <Field label="Machine hour rate">
                <TextInput
                  value={form.machine_hour_rate}
                  onChange={(event) =>
                    updateField("machine_hour_rate", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </Field>

              <Field label="Base fee">
                <TextInput
                  value={form.base_fee}
                  onChange={(event) =>
                    updateField("base_fee", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </Field>

              <Field label="Waste factor">
                <TextInput
                  value={form.waste_factor}
                  onChange={(event) =>
                    updateField("waste_factor", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                />
              </Field>

              <Field label="Support markup factor">
                <TextInput
                  value={form.support_markup_factor}
                  onChange={(event) =>
                    updateField("support_markup_factor", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                />
              </Field>

              <Field label="Electricity cost / kWh">
                <TextInput
                  value={form.electricity_cost_per_kwh}
                  onChange={(event) =>
                    updateField("electricity_cost_per_kwh", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.0001"
                  required
                />
              </Field>

              <Field label="Power consumption watts">
                <TextInput
                  value={form.power_consumption_watts}
                  onChange={(event) =>
                    updateField("power_consumption_watts", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </Field>

              <Field label="Currency">
                <TextInput
                  value={form.currency}
                  onChange={(event) =>
                    updateField("currency", event.target.value)
                  }
                  className="uppercase"
                  minLength={3}
                  maxLength={10}
                  required
                />
              </Field>

              <div className="flex items-end justify-end">
                <Button type="submit" disabled={isSaving}>
                  Save pricing
                </Button>
              </div>
            </FormSection>
          </form>
        )}
      </Panel>
    </PageShell>
  );
}
