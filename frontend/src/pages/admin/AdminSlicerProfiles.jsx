import { useEffect, useMemo, useState } from "react";

import {
  getActiveMaterials,
  getSlicerProfiles,
  uploadSlicerProfile,
} from "../../api/materials";
import { Button } from "../../components/ui/Button";
import { Alert, StatusBadge } from "../../components/ui/Feedback";
import { Field, FormSection, SelectInput, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  DataTable,
  TableBody,
  TableHead,
  TableWrap,
} from "../../components/ui/Table";

const QUALITIES = ["draft", "standard", "fine"];

const EMPTY_FORM = {
  materialKey: "",
  quality: "standard",
  printerName: "Creality Ender 3 V3 SE",
  nozzle: "0.4mm",
  supportRule: "auto",
  orientationRule: "original",
  profileFile: null,
};

function getMaterials(response) {
  return response.data?.materials || response.materials || [];
}

function getProfiles(response) {
  return response.data?.profiles || response.profiles || [];
}

export default function AdminSlicerProfiles() {
  const [materials, setMaterials] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.is_active).length,
    [profiles],
  );

  async function fetchPageData() {
    const [materialsResponse, profilesResponse] = await Promise.all([
      getActiveMaterials(),
      getSlicerProfiles(),
    ]);

    return {
      materials: getMaterials(materialsResponse),
      profiles: getProfiles(profilesResponse),
    };
  }

  async function refreshProfiles() {
    const response = await getSlicerProfiles();
    setProfiles(getProfiles(response));
  }

  useEffect(() => {
    let shouldIgnore = false;

    fetchPageData()
      .then((nextData) => {
        if (!shouldIgnore) {
          setMaterials(nextData.materials);
          setProfiles(nextData.profiles);

          if (nextData.materials[0]?.materialKey) {
            setForm((current) => ({
              ...current,
              materialKey:
                current.materialKey || nextData.materials[0].materialKey,
            }));
          }
        }
      })
      .catch((err) => {
        if (!shouldIgnore) {
          setError(err.message || "Failed to load slicer profiles.");
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

    if (!form.profileFile) {
      setError("Please choose a .ini profile file.");
      return;
    }

    setIsUploading(true);
    setMessage("");
    setError("");

    try {
      await uploadSlicerProfile(form.materialKey, form);
      setMessage("Slicer profile uploaded and dry-run validated successfully.");
      setForm((current) => ({ ...current, profileFile: null }));
      event.target.reset();
      await refreshProfiles();
    } catch (err) {
      setError(err.message || "Failed to upload slicer profile.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-config-page unifab-admin-page--slicer-profiles">
        <PageHeader
          title="Slicer profiles"
          description="Upload PrusaSlicer .ini profiles. Each profile must pass a dry-run slice before it becomes active."
          meta={`${activeProfiles} active / ${profiles.length} versions`}
        />

        <Alert className="mt-4" type="success">
          {message}
        </Alert>

        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        <form
          onSubmit={handleSubmit}
          className="mt-6"
        >
          <FormSection columns="md:grid-cols-3">
            <Field label="Material">
              <SelectInput
                value={form.materialKey}
                onChange={(event) =>
                  updateField("materialKey", event.target.value)
                }
                required
                disabled={materials.length === 0}
              >
                {materials.length === 0 && (
                  <option value="">No active materials</option>
                )}
                {materials.map((material) => (
                  <option
                    key={material.materialKey}
                    value={material.materialKey}
                  >
                    {material.displayName}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Quality">
              <SelectInput
                value={form.quality}
                onChange={(event) => updateField("quality", event.target.value)}
                required
              >
                {QUALITIES.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field label="Profile file">
              <TextInput
                type="file"
                accept=".ini"
                onChange={(event) =>
                  updateField("profileFile", event.target.files?.[0] || null)
                }
                required
              />
            </Field>

            <Field label="Printer name">
              <TextInput
                value={form.printerName}
                onChange={(event) =>
                  updateField("printerName", event.target.value)
                }
                maxLength={100}
              />
            </Field>

            <Field label="Nozzle">
              <TextInput
                value={form.nozzle}
                onChange={(event) => updateField("nozzle", event.target.value)}
                maxLength={20}
              />
            </Field>

            <Field label="Support rule">
              <TextInput
                value={form.supportRule}
                onChange={(event) =>
                  updateField("supportRule", event.target.value)
                }
                maxLength={30}
              />
            </Field>

            <Field label="Orientation rule">
              <TextInput
                value={form.orientationRule}
                onChange={(event) =>
                  updateField("orientationRule", event.target.value)
                }
                maxLength={30}
              />
            </Field>

            <Button
              type="submit"
              disabled={isUploading || materials.length === 0}
              className="self-end"
            >
              Upload profile
            </Button>
          </FormSection>
        </form>

        <div className="mt-6">
          <TableWrap>
            <DataTable>
              <TableHead>
              <tr>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Quality</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Printer</th>
                <th className="px-4 py-3">Nozzle</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Validation</th>
                <th className="px-4 py-3">Uploaded</th>
              </tr>
              </TableHead>
              <TableBody>
              {isLoading && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    Loading slicer profiles...
                  </td>
                </tr>
              )}

              {!isLoading && profiles.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={8}>
                    No slicer profiles found.
                  </td>
                </tr>
              )}

              {!isLoading &&
                profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-950">
                        {profile.material_display_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {profile.material_key}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {profile.quality}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      v{profile.version_number}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {profile.printer_name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {profile.nozzle}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={profile.is_active ? "success" : "neutral"}
                      >
                        {profile.is_active ? "Active" : "Old version"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={getValidationTone(profile.validation_status)}
                      >
                        {profile.validation_status || "not_run"}
                      </StatusBadge>
                      {profile.validation_message && (
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                          {profile.validation_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {profile.created_at
                        ? new Date(profile.created_at).toLocaleDateString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </TableBody>
            </DataTable>
          </TableWrap>
        </div>
      </Panel>
    </PageShell>
  );
}

function getValidationTone(status) {
  if (status === "passed") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return "warning";
}
