import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  cleanupRenderedViews,
  renderModelPreviews,
} from "../services/design-render-moderation.service.js";
import {
  PRINT_REQUEST_THUMBNAILS_ROOT,
  buildPrintRequestThumbnailPublicPath,
} from "./print-request-storage.util.js";
import {
  QUOTE_THUMBNAILS_ROOT,
  buildQuoteThumbnailPublicPath,
} from "./quote-storage.util.js";
import {
  LOCAL_DESIGN_THUMBNAILS_ROOT,
  buildLocalDesignThumbnailPublicPath,
} from "./local-design-storage.util.js";
import {
  MMF_PRINT_READY_THUMBNAILS_ROOT,
  buildMmfPrintReadyThumbnailPublicPath,
} from "./mmf-print-ready-storage.util.js";

async function generateStoredSnapshot(modelPath, thumbnailsRoot, buildPublicPath) {
  let renderedViews = [];

  try {
    renderedViews = await renderModelPreviews(modelPath);
    const primaryView =
      renderedViews.find((view) => view.name === "isometric") ||
      renderedViews[0];

    if (!primaryView?.filePath) {
      return null;
    }

    await fs.mkdir(thumbnailsRoot, { recursive: true });

    const fileName = `${randomUUID()}-snapshot.png`;
    const destinationPath = path.join(thumbnailsRoot, fileName);
    await fs.copyFile(primaryView.filePath, destinationPath);

    return buildPublicPath(fileName);
  } catch (error) {
    console.warn(`Model snapshot generation skipped: ${error.message}`);
    return null;
  } finally {
    if (renderedViews.length > 0) {
      await cleanupRenderedViews(renderedViews);
    }
  }
}

function generateStoredModelSnapshot(modelPath) {
  return generateStoredSnapshot(
    modelPath,
    PRINT_REQUEST_THUMBNAILS_ROOT,
    buildPrintRequestThumbnailPublicPath,
  );
}

function generateStoredQuoteSnapshot(modelPath) {
  return generateStoredSnapshot(
    modelPath,
    QUOTE_THUMBNAILS_ROOT,
    buildQuoteThumbnailPublicPath,
  );
}

function generateStoredLocalDesignSnapshot(modelPath) {
  return generateStoredSnapshot(
    modelPath,
    LOCAL_DESIGN_THUMBNAILS_ROOT,
    buildLocalDesignThumbnailPublicPath,
  );
}

function generateStoredMmfPrintReadySnapshot(modelPath) {
  return generateStoredSnapshot(
    modelPath,
    MMF_PRINT_READY_THUMBNAILS_ROOT,
    buildMmfPrintReadyThumbnailPublicPath,
  );
}

export {
  generateStoredMmfPrintReadySnapshot,
  generateStoredModelSnapshot,
  generateStoredQuoteSnapshot,
  generateStoredLocalDesignSnapshot,
};
