import { useCallback, useEffect, useState } from "react";
import {
  createAdminDesignCategory,
  createAdminDesignTag,
  getAdminDesignTaxonomy,
  updateAdminDesignCategory,
  updateAdminDesignTag,
} from "../../api/designs";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import {
  Field,
  FormSection,
  SelectInput,
  TextInput,
} from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

const emptyCategoryForm = {
  id: "",
  name: "",
  description: "",
  isActive: "true",
};

const emptyTagForm = {
  id: "",
  name: "",
  isActive: "true",
};

function toCategoryForm(category) {
  return {
    id: String(category.id),
    name: category.name || "",
    description: category.description || "",
    isActive: category.isActive ? "true" : "false",
  };
}

function toTagForm(tag) {
  return {
    id: String(tag.id),
    name: tag.name || "",
    isActive: tag.isActive ? "true" : "false",
  };
}

export default function AdminDesignTaxonomy() {
  const [taxonomy, setTaxonomy] = useState({ categories: [], tags: [] });
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [tagForm, setTagForm] = useState(emptyTagForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadTaxonomy = useCallback(async () => {
    try {
      setError("");
      const data = await getAdminDesignTaxonomy();
      const payload = data.data || data;
      setTaxonomy({
        categories: payload.categories || [],
        tags: payload.tags || [],
      });
    } catch (err) {
      setError(err.message);
      setTaxonomy({ categories: [], tags: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialTaxonomy() {
      try {
        setError("");
        const data = await getAdminDesignTaxonomy();
        const payload = data.data || data;

        if (isMounted) {
          setTaxonomy({
            categories: payload.categories || [],
            tags: payload.tags || [],
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setTaxonomy({ categories: [], tags: [] });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialTaxonomy();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateCategoryField = (field, value) => {
    setCategoryForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const updateTagField = (field, value) => {
    setTagForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const saveCategory = async (event) => {
    event.preventDefault();

    try {
      setIsSavingCategory(true);
      setError("");
      setSuccessMessage("");

      const payload = {
        name: categoryForm.name,
        description: categoryForm.description,
        isActive: categoryForm.isActive === "true",
      };

      if (categoryForm.id) {
        await updateAdminDesignCategory(categoryForm.id, payload);
      } else {
        await createAdminDesignCategory(payload);
      }

      setCategoryForm(emptyCategoryForm);
      setSuccessMessage("Category saved.");
      await loadTaxonomy();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingCategory(false);
    }
  };

  const saveTag = async (event) => {
    event.preventDefault();

    try {
      setIsSavingTag(true);
      setError("");
      setSuccessMessage("");

      const payload = {
        name: tagForm.name,
        isActive: tagForm.isActive === "true",
      };

      if (tagForm.id) {
        await updateAdminDesignTag(tagForm.id, payload);
      } else {
        await createAdminDesignTag(payload);
      }

      setTagForm(emptyTagForm);
      setSuccessMessage("Tag saved.");
      await loadTaxonomy();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSavingTag(false);
    }
  };

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-config-page unifab-admin-page--taxonomy">
        <PageHeader
          title="Design Taxonomy"
          description="Manage the approved categories and tags used by the Design Library."
        />

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        <Alert className="mt-6" type="success">
          {successMessage}
        </Alert>

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading design taxonomy...</p>
        )}

        {!isLoading && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold text-slate-950">
                Categories
              </h2>
              <form onSubmit={saveCategory} className="mt-4 space-y-4">
                <FormSection columns="md:grid-cols-2">
                  <Field label="Category name">
                    <TextInput
                      value={categoryForm.name}
                      onChange={(event) =>
                        updateCategoryField("name", event.target.value)
                      }
                      placeholder="Example: Robotics"
                    />
                  </Field>

                  <Field label="Status">
                    <SelectInput
                      value={categoryForm.isActive}
                      onChange={(event) =>
                        updateCategoryField("isActive", event.target.value)
                      }
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </SelectInput>
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Description">
                      <TextInput
                        value={categoryForm.description}
                        onChange={(event) =>
                          updateCategoryField("description", event.target.value)
                        }
                        placeholder="Optional public taxonomy context"
                      />
                    </Field>
                  </div>
                </FormSection>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={isSavingCategory}>
                    {isSavingCategory
                      ? "Saving..."
                      : categoryForm.id
                        ? "Update Category"
                        : "Add Category"}
                  </Button>
                  {categoryForm.id && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCategoryForm(emptyCategoryForm)}
                    >
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </form>

              <TaxonomyList
                className="mt-6"
                items={taxonomy.categories}
                emptyTitle="No categories yet."
                onEdit={(category) => setCategoryForm(toCategoryForm(category))}
              />
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-950">Tags</h2>
              <form onSubmit={saveTag} className="mt-4 space-y-4">
                <FormSection columns="md:grid-cols-2">
                  <Field label="Tag name">
                    <TextInput
                      value={tagForm.name}
                      onChange={(event) =>
                        updateTagField("name", event.target.value)
                      }
                      placeholder="Example: fixture"
                    />
                  </Field>

                  <Field label="Status">
                    <SelectInput
                      value={tagForm.isActive}
                      onChange={(event) =>
                        updateTagField("isActive", event.target.value)
                      }
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </SelectInput>
                  </Field>
                </FormSection>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={isSavingTag}>
                    {isSavingTag
                      ? "Saving..."
                      : tagForm.id
                        ? "Update Tag"
                        : "Add Tag"}
                  </Button>
                  {tagForm.id && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setTagForm(emptyTagForm)}
                    >
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </form>

              <TaxonomyList
                className="mt-6"
                items={taxonomy.tags}
                emptyTitle="No tags yet."
                onEdit={(tag) => setTagForm(toTagForm(tag))}
              />
            </section>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function TaxonomyList({ className = "", items, emptyTitle, onEdit }) {
  if (items.length === 0) {
    return <EmptyState className={className} title={emptyTitle} />;
  }

  return (
    <div
      className={`${className} divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white`}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-3 p-4"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-950">{item.name}</p>
              <StatusBadge tone={item.isActive ? "success" : "neutral"}>
                {item.isActive ? "Active" : "Inactive"}
              </StatusBadge>
            </div>
            {item.description && (
              <p className="mt-1 text-sm text-slate-600">
                {item.description}
              </p>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => onEdit(item)}>
            Edit
          </Button>
        </div>
      ))}
    </div>
  );
}
