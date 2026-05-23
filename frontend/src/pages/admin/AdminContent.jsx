import { useEffect, useState } from "react";
import { getAdminContent, updateAdminContent } from "../../api/admin";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState } from "../../components/ui/Feedback";
import { Field, TextArea, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";

export default function AdminContent() {
  const [items, setItems] = useState([]);
  const [editingKey, setEditingKey] = useState("");
  const [form, setForm] = useState({ title: "", body: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadInitialContent() {
      try {
        setIsLoading(true);
        setError("");

        const response = await getAdminContent();
        const payload = response.data || response;

        if (!ignore) {
          setItems(payload.content || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message || "Failed to load site content.");
          setItems([]);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadInitialContent();

    return () => {
      ignore = true;
    };
  }, []);

  function startEditing(item) {
    setEditingKey(item.contentKey);
    setForm({
      title: item.title || "",
      body: item.body || "",
    });
    setError("");
    setMessage("");
  }

  function cancelEditing() {
    setEditingKey("");
    setForm({ title: "", body: "" });
  }

  async function saveContent(item) {
    try {
      setIsSaving(true);
      setError("");
      setMessage("");

      const response = await updateAdminContent(item.contentKey, {
        title: form.title,
        body: form.body,
        metadata: item.metadata || {},
      });
      const updated = response.data?.content || response.content;

      setItems((current) =>
        current.map((entry) =>
          entry.contentKey === updated.contentKey ? updated : entry,
        ),
      );
      setMessage(`Updated ${updated.title}.`);
      cancelEditing();
    } catch (err) {
      setError(err.message || "Failed to save content.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageShell size="xl">
      <Panel>
        <PageHeader
          title="Website content"
          description="Manage approved public copy for homepage messaging, lab hours, contact details, and service notices."
        />

        <Alert className="mt-4" type="success">
          {message}
        </Alert>
        <Alert className="mt-4" type="error">
          {error}
        </Alert>

        {isLoading && <p className="mt-6 text-slate-600">Loading content...</p>}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No content records found."
            description="Run migrations to seed approved content keys."
          />
        )}

        <div className="mt-6 grid gap-4">
          {items.map((item) => {
            const isEditing = editingKey === item.contentKey;

            return (
              <div
                key={item.contentKey}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">
                      {item.contentKey}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {formatDateTime(item.updatedAt)} by{" "}
                      {item.updatedByEmail || "system"}
                    </p>
                  </div>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelEditing}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveContent(item)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => startEditing(item)}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-4 grid gap-4">
                    <Field label="Title">
                      <TextInput
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Body">
                      <TextArea
                        rows={5}
                        value={form.body}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            body: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                ) : (
                  <p className="mt-4 whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
                    {item.body || "No body content."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </PageShell>
  );
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "-";
}
