import { useEffect, useState } from "react";
import {
  createAdminPrinter,
  deleteAdminPrinter,
  getAdminPrinters,
  updateAdminPrinter,
} from "../../api/printers";
import { Button } from "../../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../../components/ui/Feedback";
import { Field, SelectInput, TextArea, TextInput } from "../../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../../components/ui/Page";
import {
  DataTable,
  TableBody,
  TableHead,
  TableWrap,
} from "../../components/ui/Table";

const emptyForm = {
  name: "",
  model: "",
  technology: "FDM",
  buildVolume: "",
  nozzleSize: "0.4mm",
  supportedMaterials: "",
  status: "active",
  isPublic: "true",
  displayOrder: 0,
  notes: "",
};

export default function AdminPrinters() {
  const [printers, setPrinters] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingPrinterId, setEditingPrinterId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingPrinterId, setDeletingPrinterId] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadPrinters() {
    try {
      setIsLoading(true);
      setError("");

      const data = await getAdminPrinters();
      setPrinters(data.data?.printers || data.printers || []);
    } catch (err) {
      setError(err.message);
      setPrinters([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitialPrinters() {
      await loadPrinters();
    }

    loadInitialPrinters();
  }, []);

  const updateField = (field, value) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingPrinterId(null);
  };

  const startEditing = (printer) => {
    setEditingPrinterId(printer.id);
    setForm({
      name: printer.name || "",
      model: printer.model || "",
      technology: printer.technology || "FDM",
      buildVolume: printer.buildVolume || "",
      nozzleSize: printer.nozzleSize || "",
      supportedMaterials: (printer.supportedMaterials || []).join(", "),
      status: printer.status || "active",
      isPublic: printer.isPublic ? "true" : "false",
      displayOrder: printer.displayOrder || 0,
      notes: printer.notes || "",
    });
    setError("");
    setSuccessMessage("");
  };

  const toPayload = () => ({
    name: form.name,
    model: form.model,
    technology: form.technology,
    buildVolume: form.buildVolume,
    nozzleSize: form.nozzleSize,
    supportedMaterials: form.supportedMaterials,
    status: form.status,
    isPublic: form.isPublic,
    displayOrder: Number(form.displayOrder),
    notes: form.notes,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Printer name is required.");
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setSuccessMessage("");

      if (editingPrinterId) {
        await updateAdminPrinter(editingPrinterId, toPayload());
        setSuccessMessage("Printer updated.");
      } else {
        await createAdminPrinter(toPayload());
        setSuccessMessage("Printer created.");
      }

      resetForm();
      await loadPrinters();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (printerId) => {
    const confirmed = window.confirm("Delete this printer record?");

    if (!confirmed) {
      return;
    }

    try {
      setDeletingPrinterId(printerId);
      setError("");
      setSuccessMessage("");

      await deleteAdminPrinter(printerId);
      setSuccessMessage("Printer deleted.");
      await loadPrinters();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingPrinterId(null);
    }
  };

  return (
    <PageShell size="xl">
      <Panel className="unifab-admin-page unifab-admin-panel unifab-admin-config-page unifab-admin-page--printers">
        <PageHeader
          title="Printers"
          description="Publish printer information for clients. Printer selection does not affect quote generation."
        />

        <Alert className="mt-6" type="error">
          {error}
        </Alert>
        <Alert className="mt-6" type="success">
          {successMessage}
        </Alert>

        <form
          onSubmit={handleSubmit}
          className="unifab-admin-filterbar mt-6 grid gap-4 rounded-lg p-4 md:grid-cols-2"
        >
          <Field label="Printer name">
            <TextInput
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={form.model}
              onChange={(event) => updateField("model", event.target.value)}
            />
          </Field>
          <Field label="Technology">
            <TextInput
              value={form.technology}
              onChange={(event) => updateField("technology", event.target.value)}
            />
          </Field>
          <Field label="Build volume">
            <TextInput
              value={form.buildVolume}
              onChange={(event) => updateField("buildVolume", event.target.value)}
              placeholder="Example: 220 x 220 x 250 mm"
            />
          </Field>
          <Field label="Nozzle size">
            <TextInput
              value={form.nozzleSize}
              onChange={(event) => updateField("nozzleSize", event.target.value)}
            />
          </Field>
          <Field label="Supported materials" hint="Comma-separated material names.">
            <TextInput
              value={form.supportedMaterials}
              onChange={(event) =>
                updateField("supportedMaterials", event.target.value)
              }
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
            >
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </SelectInput>
          </Field>
          <Field label="Visibility">
            <SelectInput
              value={form.isPublic}
              onChange={(event) => updateField("isPublic", event.target.value)}
            >
              <option value="true">Public</option>
              <option value="false">Hidden</option>
            </SelectInput>
          </Field>
          <Field label="Display order">
            <TextInput
              type="number"
              min="0"
              value={form.displayOrder}
              onChange={(event) =>
                updateField("displayOrder", Number(event.target.value))
              }
            />
          </Field>
          <Field label="Notes">
            <TextArea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={3}
            />
          </Field>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : editingPrinterId
                  ? "Update printer"
                  : "Create printer"}
            </Button>
            {editingPrinterId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        {isLoading && <p className="mt-6 text-slate-600">Loading printers...</p>}

        {!isLoading && !error && printers.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No printer records yet."
            description="Create printer records to show clients what equipment is available."
          />
        )}

        {printers.length > 0 && (
          <div className="mt-6">
            <TableWrap>
              <DataTable>
                <TableHead>
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Visibility</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </TableHead>
                <TableBody>
                  {printers.map((printer) => (
                    <tr key={printer.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        {printer.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {printer.model || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={printer.status === "active" ? "success" : "warning"}
                        >
                          {printer.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {printer.isPublic ? "Public" : "Hidden"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => startEditing(printer)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(printer.id)}
                            disabled={deletingPrinterId === printer.id}
                          >
                            {deletingPrinterId === printer.id
                              ? "Deleting..."
                              : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableBody>
              </DataTable>
            </TableWrap>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
