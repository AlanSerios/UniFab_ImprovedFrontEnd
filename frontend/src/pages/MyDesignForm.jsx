import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createMyDesignDraft,
  getDesignTaxonomy,
  getMyDesigns,
  publishMyDesign,
  updateMyDesign,
} from "../api/designs";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, StatusBadge } from "../components/ui/Feedback";
import {
  Field,
  FormSection,
  SelectInput,
  TextArea,
  TextInput,
} from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import {
  getModerationStatusLabel,
  getModerationStatusTone,
  getOwnerModerationMessage,
  getPublishResultMessage,
} from "../utils/moderation-display";

const PUBLISHABLE_STATUSES = new Set([
  "draft",
  "auto_rejected",
  "admin_rejected",
]);

const APPROVED_STATUSES = new Set(["auto_approved", "admin_approved"]);

function buildFormData({ form, designFile, thumbnailImage }) {
  const formData = new FormData();

  formData.append("title", form.title);
  formData.append("description", form.description);
  formData.append("categoryName", form.categoryName);
  formData.append("tagNames", form.tagNames);
  formData.append("licenseType", form.licenseType);
  formData.append("ownershipConfirmed", String(form.ownershipConfirmed));
  formData.append("policyAcknowledged", String(form.policyAcknowledged));

  if (designFile) {
    formData.append("designFile", designFile);
  }

  if (thumbnailImage) {
    formData.append("thumbnailImage", thumbnailImage);
  }

  return formData;
}

function toFormState(design) {
  return {
    title: design?.title === "Untitled draft" ? "" : design?.title || "",
    description: design?.description || "",
    categoryName: design?.category?.name || "",
    tagNames: (design?.tags || []).map((tag) => tag.name).join(", "),
    licenseType: design?.licenseType || "",
    ownershipConfirmed: Boolean(design?.ownershipConfirmed),
    policyAcknowledged: Boolean(design?.policyAcknowledged),
  };
}

export default function MyDesignForm() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(designId);

  const [form, setForm] = useState(() => toFormState(null));
  const [currentDesign, setCurrentDesign] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [designFile, setDesignFile] = useState(null);
  const [thumbnailImage, setThumbnailImage] = useState(null);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDesign = useCallback(async () => {
    if (!isEditing) {
      return;
    }

    try {
      setError("");

      const data = await getMyDesigns();
      const payload = data.data || data;
      const designs = payload.localDesigns || [];
      const matchedDesign = designs.find(
        (design) => Number(design.id) === Number(designId),
      );

      if (!matchedDesign) {
        throw new Error("Design not found in your designs.");
      }

      setCurrentDesign(matchedDesign);
      setForm(toFormState(matchedDesign));
    } catch (err) {
      setError(err.message);
      setCurrentDesign(null);
    } finally {
      setIsLoading(false);
    }
  }, [designId, isEditing]);

  useEffect(() => {
    let isMounted = true;

    async function loadTaxonomy() {
      try {
        const data = await getDesignTaxonomy();
        const payload = data.data || data;

        if (isMounted) {
          setTaxonomy({
            categories: payload.categories || [],
            tags: payload.tags || [],
          });
        }
      } catch {
        if (isMounted) {
          setTaxonomy({ categories: [], tags: [] });
        }
      }
    }

    loadTaxonomy();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialDesign() {
      if (!isEditing) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await getMyDesigns();
        const payload = data.data || data;
        const designs = payload.localDesigns || [];
        const matchedDesign = designs.find(
          (design) => Number(design.id) === Number(designId),
        );

        if (!matchedDesign) {
          throw new Error("Design not found in your designs.");
        }

        if (isMounted) {
          setCurrentDesign(matchedDesign);
          setForm(toFormState(matchedDesign));
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setCurrentDesign(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialDesign();

    return () => {
      isMounted = false;
    };
  }, [designId, isEditing]);

  const canPublish = useMemo(() => {
    return (
      currentDesign && PUBLISHABLE_STATUSES.has(currentDesign.moderationStatus)
    );
  }, [currentDesign]);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const saveDesign = async () => {
    const formData = buildFormData({ form, designFile, thumbnailImage });

    if (isEditing) {
      const data = await updateMyDesign(designId, formData);
      const savedDesign = data.data?.localDesign || data.localDesign;
      setCurrentDesign(savedDesign || currentDesign);
      return savedDesign || currentDesign;
    }

    const data = await createMyDesignDraft(formData);
    return data.data?.localDesign || data.localDesign;
  };

  const handleSave = async (event) => {
    event.preventDefault();

    try {
      setIsSaving(true);
      setError("");
      setSuccessMessage("");

      const savedDesign = await saveDesign();

      if (!isEditing && savedDesign?.id) {
        navigate(`/my-designs/${savedDesign.id}`);
        return;
      }

      setDesignFile(null);
      setThumbnailImage(null);
      setSuccessMessage("Design saved successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!currentDesign?.id) {
      return;
    }

    try {
      setIsPublishing(true);
      setError("");
      setSuccessMessage("");

      const data = await publishMyDesign(currentDesign.id);
      const payload = data.data || data;
      const updatedDesign = payload.localDesign || payload.design;

      await loadDesign();
      setSuccessMessage(getPublishResultMessage(updatedDesign));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <PageShell size="lg">
      <Panel>
        <PageHeader
          title={isEditing ? "Edit Design" : "New Design"}
          description="Save a private draft, then publish it for FabLab review when it is complete."
          action={
            <ButtonLink to="/my-designs" variant="secondary">
              Back to My Designs
            </ButtonLink>
          }
          meta={
            currentDesign ? (
              <StatusBadge
                tone={getModerationStatusTone(currentDesign.moderationStatus)}
              >
                {getModerationStatusLabel(currentDesign.moderationStatus)}
              </StatusBadge>
            ) : null
          }
        />

        {isLoading && <p className="mt-6 text-slate-600">Loading design...</p>}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        <Alert className="mt-6" type="success">
          {successMessage}
        </Alert>

        {currentDesign && getOwnerModerationMessage(currentDesign) && (
          <Alert className="mt-6" type="info">
            {getOwnerModerationMessage(currentDesign)}
          </Alert>
        )}

        {currentDesign &&
          APPROVED_STATUSES.has(currentDesign.moderationStatus) && (
            <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Editing an approved design sends it back to FabLab review and
              removes Print Ready status.
            </div>
          )}

        {!isLoading && (
          <form onSubmit={handleSave} className="mt-6 space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">
                Basic details
              </h2>
              <FormSection columns="md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Title">
                    <TextInput
                      value={form.title}
                      onChange={(event) =>
                        updateField("title", event.target.value)
                      }
                      placeholder="Example: Sensor bracket"
                    />
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <Field label="Description">
                    <TextArea
                      rows={5}
                      value={form.description}
                      onChange={(event) =>
                        updateField("description", event.target.value)
                      }
                      placeholder="Describe the object, intended use, and any important constraints."
                    />
                  </Field>
                </div>

                <Field label="Category">
                  <TextInput
                    list="my-design-category-options"
                    value={form.categoryName}
                    onChange={(event) =>
                      updateField("categoryName", event.target.value)
                    }
                  />
                  <datalist id="my-design-category-options">
                    {taxonomy.categories.map((category) => (
                      <option key={category.id} value={category.name} />
                    ))}
                  </datalist>
                </Field>

                <Field
                  label="Tags"
                  hint="Use comma-separated tags, such as prototype, fixture, robotics."
                >
                  <TextInput
                    list="my-design-tag-options"
                    value={form.tagNames}
                    onChange={(event) =>
                      updateField("tagNames", event.target.value)
                    }
                  />
                  <datalist id="my-design-tag-options">
                    {taxonomy.tags.map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                  </datalist>
                </Field>
              </FormSection>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Files</h2>
              <FormSection columns="md:grid-cols-2">
                <Field
                  label="Design file"
                  hint="STL, OBJ, or 3MF. Required before publishing."
                >
                  <TextInput
                    type="file"
                    accept=".stl,.obj,.3mf"
                    onChange={(event) =>
                      setDesignFile(event.target.files?.[0] || null)
                    }
                  />
                  {currentDesign?.fileUrl && (
                    <p className="mt-2 text-xs text-slate-500">
                      Current file is saved.
                    </p>
                  )}
                </Field>

                <Field label="Thumbnail image" hint="JPG, PNG, or WEBP.">
                  <TextInput
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={(event) =>
                      setThumbnailImage(event.target.files?.[0] || null)
                    }
                  />
                  {currentDesign?.thumbnailUrl && (
                    <p className="mt-2 text-xs text-slate-500">
                      Current thumbnail is saved.
                    </p>
                  )}
                </Field>
              </FormSection>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">
                Review acknowledgements
              </h2>
              <FormSection columns="md:grid-cols-2">
                <Field label="License or ownership">
                  <SelectInput
                    value={form.licenseType}
                    onChange={(event) =>
                      updateField("licenseType", event.target.value)
                    }
                  >
                    <option value="">Select license or ownership</option>
                    <option value="Original work">Original work</option>
                    <option value="Permitted remix">Permitted remix</option>
                    <option value="Public/open license">
                      Public/open license
                    </option>
                  </SelectInput>
                </Field>

                <div className="space-y-3">
                  <label className="flex gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.ownershipConfirmed}
                      onChange={(event) =>
                        updateField("ownershipConfirmed", event.target.checked)
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      I confirm I own this design or have permission to share it
                      with the FabLab.
                    </span>
                  </label>

                  <label className="flex gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.policyAcknowledged}
                      onChange={(event) =>
                        updateField("policyAcknowledged", event.target.checked)
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      I acknowledge the FabLab policy review before public
                      visibility.
                    </span>
                  </label>
                </div>
              </FormSection>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSaving || isPublishing}>
                {isSaving
                  ? "Saving..."
                  : isEditing
                    ? "Update Design"
                    : "Save Draft"}
              </Button>

              {canPublish && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving || isPublishing}
                  onClick={handlePublish}
                >
                  {isPublishing ? "Publishing..." : "Publish"}
                </Button>
              )}

              <ButtonLink to="/my-designs" variant="secondary">
                Cancel
              </ButtonLink>
            </div>
          </form>
        )}
      </Panel>
    </PageShell>
  );
}
