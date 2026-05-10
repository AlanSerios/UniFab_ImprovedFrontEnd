import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { ApiError } from "../utils/api-error.js";
import { createTempFilePath } from "../utils/temp-path.util.js";
import { getSlicerProfileFilePath } from "../utils/slicer-profile-path.util.js";
import { getActiveSlicerProfile } from "../models/slicer-profile.model.js";
import { getMaterialByKey } from "../models/materials.model.js";

const PRUSA_SLICER_EXECUTABLE =
  process.env.PRUSA_SLICER_PATH ||
  "C:\\Program Files\\Prusa3D\\PrusaSlicer\\prusa-slicer-console.exe";

async function runSliceEstimate({
  modelPath,
  material,
  quality,
  infill,
  quantity,
}) {
  if (!modelPath) {
    throw new ApiError(400, "Model file path is required");
  }

  if (!fs.existsSync(modelPath)) {
    throw new ApiError(400, "Model file does not exist");
  }

  const modelStats = fs.statSync(modelPath);
  if (!modelStats.isFile()) {
    throw new ApiError(400, "Model path must point to a file");
  }

  if (!material) {
    throw new ApiError(400, "Material is required");
  }

  if (!quality) {
    throw new ApiError(400, "Quality is required");
  }

  if (infill === undefined || infill === null || Number.isNaN(Number(infill))) {
    throw new ApiError(400, "Infill must be a valid number");
  }

  const normalizedInfill = Number(infill);
  if (normalizedInfill < 0 || normalizedInfill > 100) {
    throw new ApiError(400, "Infill must be between 0 and 100");
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ApiError(
      400,
      "Quantity must be an integer greater than or equal to 1",
    );
  }

  const outputGcodePath = createTempGcodePath();

  try {
    const resolvedProfile = await resolveQuoteProfile(material, quality);
    const buildVolumeMm = parseProfileBuildVolume(resolvedProfile.configPath);
    const preflightDimensionsMm = parseModelDimensionsFromFile(modelPath);

    assertModelFitsBuildVolume({
      modelDimensionsMm: preflightDimensionsMm,
      buildVolumeMm,
    });

    const commandArgs = buildPrusaSlicerArgs({
      modelPath,
      outputPath: outputGcodePath,
      profile: resolvedProfile,
      infill: normalizedInfill,
      quantity,
    });

    await executePrusaSlicer({
      executablePath: PRUSA_SLICER_EXECUTABLE,
      args: commandArgs,
    });

    if (!fs.existsSync(outputGcodePath)) {
      throw new ApiError(500, "Expected G-code output file was not generated");
    }

    const gcodeStats = fs.statSync(outputGcodePath);

    if (!gcodeStats.isFile()) {
      throw new ApiError(500, "G-code output path exists but is not a file");
    }

    if (gcodeStats.size === 0) {
      throw new ApiError(500, "Generated G-code file is empty");
    }

    const gcodeText = readGeneratedGcode(outputGcodePath);

    const {
      estimatedPrintTimeMinutes,
      filamentWeightGrams,
      filamentLengthMeters,
      modelDimensionsMm,
    } = parseGcodeSummary(gcodeText);

    return {
      estimatedPrintTimeMinutes,
      filamentWeightGrams,
      filamentLengthMeters,
      modelDimensionsMm: modelDimensionsMm || preflightDimensionsMm,
      buildVolumeMm,
      profile: {
        printer: resolvedProfile.printer,
        nozzle: resolvedProfile.nozzle,
        material: resolvedProfile.material,
        quality: resolvedProfile.quality,
        supportRule: resolvedProfile.supportRule,
        orientationRule: resolvedProfile.orientationRule,
      },
    };
  } finally {
    await cleanupFile(outputGcodePath);
  }
}

async function resolveQuoteProfile(material, quality) {
  const materialRow = await getMaterialByKey(material);

  if (!materialRow) {
    throw new ApiError(
      400,
      `Material is not configured or inactive: ${material}`,
    );
  }

  const slicerProfile = await getActiveSlicerProfile(materialRow.id, quality);

  if (!slicerProfile) {
    throw new ApiError(
      400,
      `No active slicing profile found for material=${material}, quality=${quality}`,
    );
  }

  const fileName = slicerProfile.profile_filename;

  if (!fileName) {
    throw new ApiError(
      500,
      `Active slicing profile is missing a profile filename for material=${material}, quality=${quality}`,
    );
  }

  const configPath = getSlicerProfileFilePath(fileName);

  if (!fs.existsSync(configPath)) {
    throw new ApiError(500, `Slicing profile file not found: ${fileName}`);
  }

  return {
    printer: slicerProfile.printer_name,
    nozzle: slicerProfile.nozzle,
    material: materialRow.material_key,
    quality: slicerProfile.quality,
    supportRule: slicerProfile.support_rule,
    orientationRule: slicerProfile.orientation_rule,
    configPath,
  };
}

function buildPrusaSlicerArgs({
  modelPath,
  outputPath,
  profile,
  infill,
  quantity,
}) {
  void quantity;

  return [
    "--load",
    profile.configPath,
    "--fill-density",
    `${infill}%`,
    "--export-gcode",
    "--output",
    outputPath,
    modelPath,
  ];
}

async function executePrusaSlicer({ executablePath, args }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(
        new ApiError(500, `Failed to start PrusaSlicer: ${error.message}`),
      );
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new ApiError(
            422,
            `PrusaSlicer failed with exit code ${code}: ${stderr.trim() || "Unknown slicing error"}`,
          ),
        );
        return;
      }

      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

function parseGcodeSummary(gcodeText) {
  const estimatedPrintTimeMatch = gcodeText.match(
    /; estimated printing time \(normal mode\)\s*=\s*(.+)/,
  );

  const filamentWeightGramsMatch = gcodeText.match(
    /; filament used \[g\]\s*=\s*([0-9.]+)/,
  );

  const filamentLengthMmMatch = gcodeText.match(
    /; filament used \[mm\]\s*=\s*([0-9.]+)/,
  );

  if (!estimatedPrintTimeMatch) {
    throw new ApiError(
      500,
      "Could not extract estimated print time from generated G-code",
    );
  }

  if (!filamentWeightGramsMatch) {
    throw new ApiError(
      500,
      "Could not extract filament weight from generated G-code",
    );
  }

  if (!filamentLengthMmMatch) {
    throw new ApiError(
      500,
      "Could not extract filament length from generated G-code",
    );
  }

  const estimatedPrintTimeMinutes = convertPrintTimeToMinutes(
    estimatedPrintTimeMatch[1].trim(),
  );

  const filamentWeightGrams = parseFloat(filamentWeightGramsMatch[1]);
  const filamentLengthMeters = parseFloat(filamentLengthMmMatch[1]) / 1000;
  const modelDimensionsMm = parseModelDimensionsFromGcode(gcodeText);

  return {
    estimatedPrintTimeMinutes,
    filamentWeightGrams,
    filamentLengthMeters,
    modelDimensionsMm,
  };
}

function parseModelDimensionsFromGcode(gcodeText) {
  const minMatch = gcodeText.match(
    /;\s*first_layer_print_min\s*=\s*(-?[0-9.]+),(-?[0-9.]+)/,
  );
  const maxMatch = gcodeText.match(
    /;\s*first_layer_print_max\s*=\s*(-?[0-9.]+),(-?[0-9.]+)/,
  );

  const dimensions = {};

  if (minMatch && maxMatch) {
    const minX = Number(minMatch[1]);
    const minY = Number(minMatch[2]);
    const maxX = Number(maxMatch[1]);
    const maxY = Number(maxMatch[2]);

    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      dimensions.x = Math.max(0, maxX - minX);
      dimensions.y = Math.max(0, maxY - minY);
    }
  }

  const zValues = Array.from(gcodeText.matchAll(/^G[01][^\n;]*\sZ(-?[0-9.]+)/gim))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);

  if (zValues.length > 0) {
    dimensions.z = Math.max(...zValues);
  }

  return Object.keys(dimensions).length > 0 ? dimensions : null;
}

function parseModelDimensionsFromFile(modelPath) {
  const ext = path.extname(modelPath).toLowerCase();

  if (ext === ".stl") {
    return parseStlDimensions(modelPath);
  }

  if (ext === ".obj") {
    return parseObjDimensions(modelPath);
  }

  if (ext === ".3mf") {
    return parse3mfDimensions(modelPath);
  }

  return null;
}

function parseStlDimensions(modelPath) {
  const buffer = fs.readFileSync(modelPath);

  const binaryDimensions = parseBinaryStlDimensions(buffer);
  if (binaryDimensions) {
    return binaryDimensions;
  }

  return parseAsciiStlDimensions(buffer.toString("utf-8"));
}

function parseBinaryStlDimensions(buffer) {
  if (buffer.length < 84) {
    return null;
  }

  const triangleCount = buffer.readUInt32LE(80);
  const expectedSize = 84 + triangleCount * 50;

  if (expectedSize !== buffer.length) {
    return null;
  }

  const bounds = createEmptyBounds();

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const triangleOffset = 84 + triangleIndex * 50;

    for (let vertexIndex = 0; vertexIndex < 3; vertexIndex += 1) {
      const vertexOffset = triangleOffset + 12 + vertexIndex * 12;

      updateBounds(bounds, {
        x: buffer.readFloatLE(vertexOffset),
        y: buffer.readFloatLE(vertexOffset + 4),
        z: buffer.readFloatLE(vertexOffset + 8),
      });
    }
  }

  return dimensionsFromBounds(bounds);
}

function parseAsciiStlDimensions(stlText) {
  const bounds = createEmptyBounds();
  const vertexPattern =
    /^\s*vertex\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)/gim;

  for (const match of stlText.matchAll(vertexPattern)) {
    updateBounds(bounds, {
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }

  return dimensionsFromBounds(bounds);
}

function parseObjDimensions(modelPath) {
  const objText = fs.readFileSync(modelPath, "utf-8");
  const bounds = createEmptyBounds();
  const vertexPattern =
    /^\s*v\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)/gim;

  for (const match of objText.matchAll(vertexPattern)) {
    updateBounds(bounds, {
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }

  return dimensionsFromBounds(bounds);
}

function parse3mfDimensions(modelPath) {
  const buffer = fs.readFileSync(modelPath);
  const modelXmlFiles = readZipTextFiles(buffer).filter((entry) =>
    entry.name.toLowerCase().endsWith(".model"),
  );

  for (const entry of modelXmlFiles) {
    const dimensions = parse3mfModelXmlDimensions(entry.text);

    if (dimensions) {
      return dimensions;
    }
  }

  return null;
}

function readZipTextFiles(buffer) {
  const entries = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > buffer.length || fileNameEnd > buffer.length) {
      break;
    }

    const name = buffer.toString("utf-8", fileNameStart, fileNameEnd);
    const compressedData = buffer.subarray(dataStart, dataEnd);
    const text = inflateZipEntryText(compressedData, compressionMethod);

    if (text !== null) {
      entries.push({ name, text });
    }

    offset = dataEnd;
  }

  return entries;
}

function inflateZipEntryText(compressedData, compressionMethod) {
  try {
    if (compressionMethod === 0) {
      return compressedData.toString("utf-8");
    }

    if (compressionMethod === 8) {
      return zlib.inflateRawSync(compressedData).toString("utf-8");
    }
  } catch {
    return null;
  }

  return null;
}

function parse3mfModelXmlDimensions(xmlText) {
  const bounds = createEmptyBounds();
  const unit = xmlText.match(/<model\b[^>]*\bunit=["']([^"']+)["']/i)?.[1];
  const scaleToMm = get3mfUnitScaleToMm(unit);
  const vertexPattern = /<vertex\b[^>]*\/?>/gi;

  for (const match of xmlText.matchAll(vertexPattern)) {
    const tag = match[0];
    const point = {
      x: getXmlNumberAttribute(tag, "x") * scaleToMm,
      y: getXmlNumberAttribute(tag, "y") * scaleToMm,
      z: getXmlNumberAttribute(tag, "z") * scaleToMm,
    };

    updateBounds(bounds, point);
  }

  return dimensionsFromBounds(bounds);
}

function get3mfUnitScaleToMm(unit) {
  const normalizedUnit = String(unit || "millimeter").toLowerCase();

  const scales = {
    micron: 0.001,
    millimeter: 1,
    centimeter: 10,
    inch: 25.4,
    foot: 304.8,
    meter: 1000,
  };

  return scales[normalizedUnit] || 1;
}

function getXmlNumberAttribute(tag, attributeName) {
  const pattern = new RegExp(`\\b${attributeName}=["']([^"']+)["']`, "i");
  const value = Number(tag.match(pattern)?.[1]);
  return Number.isFinite(value) ? value : NaN;
}

function createEmptyBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
}

function updateBounds(bounds, point) {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    return;
  }

  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.minZ = Math.min(bounds.minZ, point.z);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
  bounds.maxZ = Math.max(bounds.maxZ, point.z);
}

function dimensionsFromBounds(bounds) {
  if (
    ![
      bounds.minX,
      bounds.minY,
      bounds.minZ,
      bounds.maxX,
      bounds.maxY,
      bounds.maxZ,
    ].every(Number.isFinite)
  ) {
    return null;
  }

  return {
    x: Math.max(0, bounds.maxX - bounds.minX),
    y: Math.max(0, bounds.maxY - bounds.minY),
    z: Math.max(0, bounds.maxZ - bounds.minZ),
  };
}

function assertModelFitsBuildVolume({ modelDimensionsMm, buildVolumeMm }) {
  if (!modelDimensionsMm || !buildVolumeMm) {
    return;
  }

  const modelAxes = [
    Number(modelDimensionsMm.x),
    Number(modelDimensionsMm.y),
    Number(modelDimensionsMm.z),
  ];
  const buildAxes = [
    Number(buildVolumeMm.x),
    Number(buildVolumeMm.y),
    Number(buildVolumeMm.z),
  ];

  if (![...modelAxes, ...buildAxes].every(Number.isFinite)) {
    return;
  }

  const sortedModelAxes = [...modelAxes].sort((a, b) => a - b);
  const sortedBuildAxes = [...buildAxes].sort((a, b) => a - b);
  const fits = sortedModelAxes.every(
    (modelAxis, index) => modelAxis <= sortedBuildAxes[index],
  );

  if (fits) {
    return;
  }

  throw new ApiError(
    422,
    `Model dimensions ${formatDimensions(modelDimensionsMm)} exceed the configured printer build volume ${formatDimensions(buildVolumeMm)}. Please scale down, split the model, or choose a file that fits the lab printer profile.`,
  );
}

function formatDimensions(dimensions) {
  return `${Math.round(Number(dimensions.x))} x ${Math.round(
    Number(dimensions.y),
  )} x ${Math.round(Number(dimensions.z))} mm`;
}

function parseProfileBuildVolume(configPath) {
  try {
    const configText = fs.readFileSync(configPath, "utf-8");
    const bedShapeMatch = configText.match(/^bed_shape\s*=\s*(.+)$/m);
    const maxHeightMatch = configText.match(/^max_print_height\s*=\s*([0-9.]+)/m);
    const buildVolume = {};

    if (bedShapeMatch) {
      const points = bedShapeMatch[1]
        .trim()
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((point) => point.split("x").map(Number))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

      if (points.length > 0) {
        const xValues = points.map(([x]) => x);
        const yValues = points.map(([, y]) => y);
        buildVolume.x = Math.max(...xValues) - Math.min(...xValues);
        buildVolume.y = Math.max(...yValues) - Math.min(...yValues);
      }
    }

    if (maxHeightMatch) {
      const maxHeight = Number(maxHeightMatch[1]);
      if (Number.isFinite(maxHeight)) {
        buildVolume.z = maxHeight;
      }
    }

    return Object.keys(buildVolume).length > 0 ? buildVolume : null;
  } catch {
    return null;
  }
}

function convertPrintTimeToMinutes(timeText) {
  const daysMatch = timeText.match(/([0-9]+)d/);
  const hoursMatch = timeText.match(/([0-9]+)h/);
  const minutesMatch = timeText.match(/([0-9]+)m/);
  const secondsMatch = timeText.match(/([0-9]+)s/);

  const days = daysMatch ? parseInt(daysMatch[1], 10) : 0;
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

  return days * 24 * 60 + hours * 60 + minutes + seconds / 60;
}

async function cleanupFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.rm(filePath, { force: true });
  } catch (error) {
    console.error(
      `Failed to delete temporary file ${filePath}: ${error.message}`,
    );
  }
}

function createTempGcodePath() {
  return createTempFilePath(["gcode"], ".gcode");
}

function readGeneratedGcode(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new ApiError(
      500,
      `Failed to read generated G-code file: ${error.message}`,
    );
  }
}

export {
  runSliceEstimate,
  parseModelDimensionsFromFile as __parseModelDimensionsFromFileForTest,
  parseProfileBuildVolume as __parseProfileBuildVolumeForTest,
  assertModelFitsBuildVolume as __assertModelFitsBuildVolumeForTest,
};
