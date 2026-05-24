import fs from "fs";
import { getSlicerProfileFilePath } from "./slicer-profile-path.util.js";

const DEFAULT_QUOTE_QUALITIES = ["draft", "standard", "fine"];

function getReadinessReasons({
  material,
  pricingConfig,
  profile,
  profileFileExists,
  validationStatus,
}) {
  const reasons = [];

  if (!material.is_active) {
    reasons.push("Material is inactive.");
  }

  if (!pricingConfig) {
    reasons.push("Pricing config is missing.");
  }

  if (!profile) {
    reasons.push("No active slicer profile.");
  }

  if (profile && !profileFileExists) {
    reasons.push("Active slicer profile file is missing.");
  }

  if (validationStatus === "failed") {
    reasons.push("Active slicer profile failed dry-run validation.");
  }

  if (validationStatus === "not_run") {
    reasons.push("Active slicer profile has not been dry-run validated yet.");
  }

  return reasons;
}

function mapLatestActiveProfilesByMaterialQuality(profiles) {
  const activeProfileByMaterialQuality = new Map();

  for (const profile of profiles) {
    if (!profile.is_active) {
      continue;
    }

    const key = `${profile.material_key}:${profile.quality}`;
    const existingProfile = activeProfileByMaterialQuality.get(key);

    if (
      !existingProfile ||
      Number(profile.version_number) > Number(existingProfile.version_number)
    ) {
      activeProfileByMaterialQuality.set(key, profile);
    }
  }

  return activeProfileByMaterialQuality;
}

function normalizeReadinessProfile(profile, validationStatus) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    printerName: profile.printer_name,
    nozzle: profile.nozzle,
    supportRule: profile.support_rule,
    orientationRule: profile.orientation_rule,
    profileFilename: profile.profile_filename,
    versionNumber: profile.version_number,
    validationStatus,
    validationMessage: profile.validation_message,
    validatedAt: profile.validated_at,
    createdAt: profile.created_at,
  };
}

function buildReadinessQuality({
  material,
  quality,
  pricingConfig,
  activeProfileByMaterialQuality,
}) {
  const profile = activeProfileByMaterialQuality.get(
    `${material.material_key}:${quality}`,
  );
  const profileFilePath = profile?.profile_filename
    ? getSlicerProfileFilePath(profile.profile_filename)
    : null;
  const profileFileExists = profileFilePath ? fs.existsSync(profileFilePath) : false;
  const validationStatus = profile?.validation_status || "not_run";
  const isReady = Boolean(
    material.is_active &&
      pricingConfig &&
      profile &&
      profileFileExists &&
      validationStatus !== "failed",
  );

  return {
    quality,
    isReady,
    reasons: getReadinessReasons({
      material,
      pricingConfig,
      profile,
      profileFileExists,
      validationStatus,
    }),
    profile: normalizeReadinessProfile(profile, validationStatus),
  };
}

function buildQuoteReadinessPayload({
  materials,
  profiles,
  pricingConfig,
  validationEvents,
  qualities = DEFAULT_QUOTE_QUALITIES,
}) {
  const activeProfileByMaterialQuality =
    mapLatestActiveProfilesByMaterialQuality(profiles);

  const readinessMaterials = materials.map((material) => ({
    id: material.id,
    materialKey: material.material_key,
    displayName: material.display_name,
    isActive: Boolean(material.is_active),
    qualities: qualities.map((quality) =>
      buildReadinessQuality({
        material,
        quality,
        pricingConfig,
        activeProfileByMaterialQuality,
      }),
    ),
  }));

  return {
    pricingConfigReady: Boolean(pricingConfig),
    pricingConfig,
    materials: readinessMaterials,
    validationEvents,
  };
}

export { buildQuoteReadinessPayload };
