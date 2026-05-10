import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveMaterials } from "../api/materials";
import { calculateUploadQuote } from "../api/quotes";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Feedback";
import { Field, SelectInput, TextInput } from "../components/ui/Form";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import { ModelViewer } from "../components/ui/ModelViewer";

export default function UploadQuote() {
  const navigate = useNavigate();

  const [modelFile, setModelFile] = useState(null);
  const [material, setMaterial] = useState("");
  const [quality, setQuality] = useState("standard");
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [materials, setMaterials] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMaterials() {
      try {
        setIsLoadingMaterials(true);
        setError("");

        const data = await getActiveMaterials();
        const activeMaterials = data.data?.materials || data.materials || [];

        setMaterials(activeMaterials);

        if (activeMaterials.length > 0) {
          setMaterial((currentMaterial) =>
            currentMaterial || activeMaterials[0].materialKey,
          );
        }
      } catch (err) {
        setMaterials([]);
        setError(err.message);
      } finally {
        setIsLoadingMaterials(false);
      }
    }

    loadMaterials();
  }, []);

  const handleViewQuote = async () => {
    if (!modelFile) {
      setError("Please choose a 3D model file first.");
      return;
    }

    if (!material) {
      setError("Please choose a material.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const formData = new FormData();
      formData.append("modelFile", modelFile);
      formData.append("material", material);
      formData.append("quality", quality);
      formData.append("infill", String(infill));
      formData.append("quantity", String(quantity));

      const data = await calculateUploadQuote(formData);

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
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell size="md">
      <Panel>
        <PageHeader
          title="Upload quote"
          description="Guests can upload a model and view a slicer-based quote before logging in."
        />

        <form className="mt-8 space-y-6">
          <Field label="3D model file">
            <TextInput
              type="file"
              accept=".stl,.obj,.3mf"
              onChange={(event) => setModelFile(event.target.files[0] || null)}
            />
            {modelFile && (
              <p className="mt-2 text-sm text-slate-500">
                Selected: {modelFile.name}
              </p>
            )}
          </Field>

          <div className="mt-2">
            <ModelViewer file={modelFile} />
          </div>

          <Field
            label="Material"
            hint="Materials are loaded from the active backend configuration."
          >
            <SelectInput
              value={material}
              onChange={(event) => setMaterial(event.target.value)}
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
              value={quality}
              onChange={(event) => setQuality(event.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="standard">Standard</option>
              <option value="fine">Fine</option>
            </SelectInput>
          </Field>

          <Field
            label={
              <>
                Infill: <span className="tabular-nums">{infill}%</span>
              </>
            }
          >
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={infill}
              onChange={(event) => setInfill(Number(event.target.value))}
              className="w-full accent-slate-950"
            />
          </Field>

          <Field
            label="Quantity"
            hint="Each file is sliced as one copy. The final quote multiplies the per-copy estimate by quantity."
          >
            <TextInput
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Field>

          <Alert type="error">{error}</Alert>

          <Button
            type="button"
            onClick={handleViewQuote}
            disabled={
              isSubmitting || isLoadingMaterials || materials.length === 0
            }
          >
            {isSubmitting ? "Calculating..." : "View quote"}
          </Button>
        </form>
      </Panel>
    </PageShell>
  );
}
