import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import { getLocalDesignById } from "../api/designs";
import { getActiveMaterials } from "../api/materials";
import { calculateLocalDesignQuote } from "../api/quotes";
import { Button, ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState, StatusBadge } from "../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

function assetUrl(path) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path}`;
}

function formatSourceKind(sourceKind) {
  return sourceKind === "community" ? "Community Design" : "Lab Design";
}

export default function LocalDesignDetail() {
  const { designId } = useParams();
  const navigate = useNavigate();

  const [design, setDesign] = useState(null);
  const [quoteForm, setQuoteForm] = useState({
    material: "",
    quality: "standard",
    infill: 20,
    quantity: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState("");

  const [materials, setMaterials] = useState([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);

  useEffect(() => {
    async function loadMaterials() {
      try {
        setIsLoadingMaterials(true);

        const data = await getActiveMaterials();
        const activeMaterials = data.data?.materials || data.materials || [];

        setMaterials(activeMaterials);

        if (activeMaterials.length > 0) {
          setQuoteForm((currentForm) => ({
            ...currentForm,
            material: currentForm.material || activeMaterials[0].materialKey,
          }));
        }
      } catch (err) {
        setError(err.message);
        setMaterials([]);
      } finally {
        setIsLoadingMaterials(false);
      }
    }

    loadMaterials();
  }, []);

  useEffect(() => {
    async function loadDesign() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getLocalDesignById(designId);
        const localDesign = data.data?.localDesign || data.localDesign || data;

        setDesign(localDesign);

        if (localDesign?.material) {
          setQuoteForm((currentForm) => ({
            ...currentForm,
            material: localDesign.material,
          }));
        }
      } catch (err) {
        setError(err.message);
        setDesign(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadDesign();
  }, [designId]);

  const updateQuoteField = (field, value) => {
    setQuoteForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleQuote = async (event) => {
    event.preventDefault();

    if (!quoteForm.material.trim()) {
      setError("Material is required to quote this design.");
      return;
    }

    try {
      setIsQuoting(true);
      setError("");

      const data = await calculateLocalDesignQuote(designId, {
        material: quoteForm.material,
        quality: quoteForm.quality,
        infill: quoteForm.infill,
        quantity: quoteForm.quantity,
      });

      const quoteToken =
        data.data?.quoteToken || data.quoteToken || data.quote?.quoteToken;

      if (!quoteToken) {
        throw new Error(
          "Quote was calculated, but no quote token was returned.",
        );
      }

      navigate(`/quote/${quoteToken}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsQuoting(false);
    }
  };

  return (
    <PageShell size="lg">
      <Panel>
        <PageHeader
          title={design?.title || "Local design"}
          description={
            design?.description ||
            "View design details, download the file, and request an instant quote when available."
          }
          action={
            <ButtonLink to="/designs" variant="secondary">
              Back to designs
            </ButtonLink>
          }
        />

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading local design...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && !design && (
          <EmptyState
            className="mt-6"
            title="Local design not found."
            description="The design may be unavailable or has been removed from the library."
            action={
              <ButtonLink to="/designs" variant="secondary">
                Back to designs
              </ButtonLink>
            }
          />
        )}

        {design && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
              <Panel className="bg-slate-50 shadow-none">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {design.thumbnailUrl ? (
                    <img
                      src={assetUrl(design.thumbnailUrl)}
                      alt={design.title || "Design thumbnail"}
                      className="h-72 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-72 items-center justify-center bg-slate-100 text-sm text-slate-500">
                      No thumbnail uploaded
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge>
                    {formatSourceKind(design.sourceKind)}
                  </StatusBadge>

                  <StatusBadge tone={design.isActive ? "success" : "neutral"}>
                    {design.isActive ? "Available" : "Unavailable"}
                  </StatusBadge>

                  <StatusBadge
                    tone={design.isPrintReady ? "success" : "warning"}
                  >
                    {design.isPrintReady ? "Print Ready" : "Not Print Ready"}
                  </StatusBadge>
                </div>

                {design.fileUrl ? (
                  <a
                    href={assetUrl(design.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Download Design File
                  </a>
                ) : (
                  <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No downloadable design file is available.
                  </p>
                )}
              </Panel>

              <Panel className="bg-slate-50 shadow-none">
                <h2 className="text-lg font-semibold text-slate-950">
                  Design details
                </h2>

                {design.description && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {design.description}
                  </p>
                )}

                <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                  <SummaryItem label="Material">
                    {design.material || "-"}
                  </SummaryItem>

                  <SummaryItem label="Dimensions">
                    {design.dimensions || "-"}
                  </SummaryItem>

                  <SummaryItem label="License">
                    {design.licenseType || "-"}
                  </SummaryItem>

                  <SummaryItem label="Category">
                    {design.category?.name || "-"}
                  </SummaryItem>

                  <SummaryItem label="Source">
                    {formatSourceKind(design.sourceKind)}
                  </SummaryItem>

                  <SummaryItem label="Availability">
                    <StatusBadge tone={design.isActive ? "success" : "neutral"}>
                      {design.isActive ? "Available" : "Unavailable"}
                    </StatusBadge>
                  </SummaryItem>

                  <SummaryItem label="Print Ready">
                    <StatusBadge
                      tone={design.isPrintReady ? "success" : "warning"}
                    >
                      {design.isPrintReady
                        ? "Ready for Instant Quote"
                        : "Requires FabLab Verification"}
                    </StatusBadge>
                  </SummaryItem>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-500">Tags</p>

                  {(design.tags || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {design.tags.map((tag) => (
                        <StatusBadge key={tag.id}>{tag.name}</StatusBadge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-600">
                      No tags provided.
                    </p>
                  )}
                </div>
              </Panel>
            </div>

            {!design.isPrintReady && (
              <Alert type="info">
                This design is approved for public viewing, but it is not yet
                marked Print Ready. Instant quote is available only after FabLab
                verifies the printable file.
              </Alert>
            )}

            <form
              onSubmit={handleQuote}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-none sm:p-6"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Quote this design</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Select material, print quality, infill, and quantity to
                    generate an instant estimate.
                  </p>
                </div>

                <StatusBadge tone={design.isPrintReady ? "success" : "warning"}>
                  {design.isPrintReady ? "Quote Available" : "Not Print Ready"}
                </StatusBadge>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Material">
                  <SelectInput
                    value={quoteForm.material}
                    onChange={(event) =>
                      updateQuoteField("material", event.target.value)
                    }
                    disabled={isLoadingMaterials || materials.length === 0}
                  >
                    {isLoadingMaterials && (
                      <option value="">Loading materials...</option>
                    )}

                    {!isLoadingMaterials && materials.length === 0 && (
                      <option value="">No active materials available</option>
                    )}

                    {materials.map((item) => (
                      <option key={item.materialKey} value={item.materialKey}>
                        {item.displayName || item.materialKey}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                <Field label="Quality">
                  <SelectInput
                    value={quoteForm.quality}
                    onChange={(event) =>
                      updateQuoteField("quality", event.target.value)
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="standard">Standard</option>
                    <option value="fine">Fine</option>
                  </SelectInput>
                </Field>

                <Field label="Infill">
                  <TextInput
                    type="number"
                    min="0"
                    max="100"
                    value={quoteForm.infill}
                    onChange={(event) =>
                      updateQuoteField("infill", Number(event.target.value))
                    }
                  />
                </Field>

                <Field label="Quantity">
                  <TextInput
                    type="number"
                    min="1"
                    value={quoteForm.quantity}
                    onChange={(event) =>
                      updateQuoteField("quantity", Number(event.target.value))
                    }
                  />
                </Field>
              </div>

              <Button
                type="submit"
                disabled={
                  isQuoting ||
                  isLoadingMaterials ||
                  materials.length === 0 ||
                  !design.isActive ||
                  !design.isPrintReady
                }
                className="mt-4"
              >
                {isQuoting
                  ? "Calculating..."
                  : design.isPrintReady
                    ? "View quote"
                    : "Not Print Ready"}
              </Button>
            </form>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}

function SummaryItem({ label, children }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-1 font-semibold text-slate-950">{children}</div>
    </div>
  );
}
