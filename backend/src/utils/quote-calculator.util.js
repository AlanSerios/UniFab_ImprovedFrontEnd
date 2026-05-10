import { ApiError } from "../utils/api-error.js";

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateQuoteEstimate({
  slicerResult,
  pricingConfig,
  materialCostPerGram,
  quantity,
}) {
  if (!slicerResult) {
    throw new ApiError(400, "Slicer result is required");
  }

  if (!pricingConfig) {
    throw new ApiError(500, "Pricing config is required");
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ApiError(
      400,
      "Quantity must be an integer greater than or equal to 1",
    );
  }

  const normalizedMaterialCostPerGram = Number(materialCostPerGram);

  if (
    Number.isNaN(normalizedMaterialCostPerGram) ||
    normalizedMaterialCostPerGram < 0
  ) {
    throw new ApiError(
      500,
      "Material cost per gram must be a valid non-negative number",
    );
  }

  const {
    estimatedPrintTimeMinutes,
    filamentWeightGrams,
    filamentLengthMeters,
    modelDimensionsMm,
    buildVolumeMm,
    profile,
  } = slicerResult;

  if (!profile?.material) {
    throw new ApiError(500, "Slicer result profile material is required");
  }

  const printHours = Number(estimatedPrintTimeMinutes) / 60;

  const baseFee = Number(pricingConfig.base_fee) || 0;
  const machineHourRate = Number(pricingConfig.machine_hour_rate) || 0;
  const wasteFactor = Number(pricingConfig.waste_factor) || 0;
  const supportMarkupFactor = Number(pricingConfig.support_markup_factor) || 0;
  const electricityCostPerKwh =
    Number(pricingConfig.electricity_cost_per_kwh) || 0;
  const powerConsumptionWatts =
    Number(pricingConfig.power_consumption_watts) || 0;

  const materialCost =
    Number(filamentWeightGrams) * normalizedMaterialCostPerGram;
  const machineCost = printHours * machineHourRate;
  const electricityCost =
    printHours * (powerConsumptionWatts / 1000) * electricityCostPerKwh;

  const singleUnitSubtotal =
    baseFee + materialCost + machineCost + electricityCost;

  const markupFactor = 1 + wasteFactor + supportMarkupFactor;
  const singleUnitTotal = singleUnitSubtotal * markupFactor;
  const totalPrice = singleUnitTotal * quantity;

  const warnings = [];

  // Print time warnings
  if (estimatedPrintTimeMinutes > 24 * 60) {
    warnings.push(
      "Print time exceeds 24 hours. This increases the risk of warping and failure. Consider breaking the model into smaller, connectable parts.",
    );
  } else if (estimatedPrintTimeMinutes > 12 * 60) {
    warnings.push(
      "This is a long print (over 12 hours). Expect a typical turnaround time of 2-5 business days.",
    );
  }

  // Weight / material volume warnings
  if (filamentWeightGrams > 500) {
    warnings.push(
      "This model uses a massive amount of material (>500g). To lower costs, consider reducing the infill percentage, scaling down, or hollowing out the model.",
    );
  }

  // Small or thin models warning
  if (filamentWeightGrams < 5 && estimatedPrintTimeMinutes < 30) {
    warnings.push(
      "This model is very small or thin. Ensure wall thicknesses meet the minimum requirements (typically 1.2mm for FDM) to prevent fragility.",
    );
  }

  if (modelDimensionsMm && buildVolumeMm) {
    const axes = [
      ["X", modelDimensionsMm.x, buildVolumeMm.x],
      ["Y", modelDimensionsMm.y, buildVolumeMm.y],
      ["Z", modelDimensionsMm.z, buildVolumeMm.z],
    ];

    const nearLimitAxes = axes
      .filter(([, modelSize, buildLimit]) => {
        return (
          Number.isFinite(modelSize) &&
          Number.isFinite(buildLimit) &&
          buildLimit > 0 &&
          modelSize / buildLimit >= 0.9
        );
      })
      .map(([axis, modelSize, buildLimit]) => {
        return `${axis}: ${Math.round(modelSize)}mm of ${Math.round(buildLimit)}mm`;
      });

    if (nearLimitAxes.length > 0) {
      warnings.push(
        `Model size is near the configured printer limits (${nearLimitAxes.join(", ")}). Confirm orientation and scale before submission.`,
      );
    }
  }

  if (quantity > 1) {
    warnings.push(
      "Quantity is priced as multiple copies of the per-copy slice. Layout sharing and batch-print time are not assumed in this estimate.",
    );
  }

  // Material-specific DFM (Design for Manufacturing) warnings
  if (profile?.material) {
    const mat = profile.material.toLowerCase();
    
    if (mat.includes("tpu") || mat.includes("flex")) {
      warnings.push(
        "TPU/Flexible material selected: Avoid designs with extreme overhangs. Flexible supports are difficult to remove cleanly.",
      );
    } else if (mat.includes("abs") || mat.includes("asa")) {
      warnings.push(
        "ABS/ASA material selected: Prone to warping on large flat surfaces. Ensure your design avoids sharp corners on the base if possible.",
      );
    } else if (mat.includes("petg")) {
      warnings.push(
         "PETG material selected: Excellent for structural parts, but fine stringing may occur on highly detailed models. Post-processing (sanding) may be required."
      );
    }
  }

  return {
    quantity,
    currency: pricingConfig.currency,
    estimatedPrintTimeMinutes: Number(estimatedPrintTimeMinutes),
    filamentWeightGrams: Number(filamentWeightGrams),
    filamentLengthMeters: Number(filamentLengthMeters),
    modelDimensionsMm,
    buildVolumeMm,
    profile,
    warnings,
    costBreakdown: {
      baseFee: roundMoney(baseFee),
      materialCost: roundMoney(materialCost),
      machineCost: roundMoney(machineCost),
      electricityCost: roundMoney(electricityCost),
      wasteFactor,
      supportMarkupFactor,
      singleUnitSubtotal: roundMoney(singleUnitSubtotal),
      singleUnitTotal: roundMoney(singleUnitTotal),
    },
    totalPrice: roundMoney(totalPrice),
  };
}

export { calculateQuoteEstimate };
