import { ApiError } from "../utils/api-error.js";
import jwt from "jsonwebtoken";
import { decryptText, encryptText } from "../utils/encryption.util.js";
import {
  deleteIntegrationToken,
  getIntegrationToken,
  upsertIntegrationToken,
} from "../models/integration-token.model.js";
import {
  getCachedSearchResult,
  setCachedSearchResult,
  getCachedObject,
  setCachedObject,
} from "../utils/mmf-cache.util.js";
import { listPrintableZipEntries } from "../utils/zip-file.util.js";

const MMF_PROVIDER = "myminifactory";
const MMF_API_BASE_URL =
  process.env.MMF_API_BASE_URL || "https://www.myminifactory.com/api/v2";
const MMF_AUTH_BASE_URL =
  process.env.MMF_AUTH_BASE_URL || "https://auth.myminifactory.com";

const MMF_REQUEST_TIMEOUT_MS = Number(process.env.MMF_REQUEST_TIMEOUT_MS) || 15000;
const MAX_MMF_FILE_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_MMF_ZIP_INSPECTION_BYTES = 100 * 1024 * 1024;
const SUPPORTED_MMF_MODEL_EXTENSIONS = new Set([".stl", ".obj", ".3mf"]);
const SUPPORTED_MMF_ARCHIVE_EXTENSIONS = new Set([".zip"]);

function getApiKey() {
  const apiKey = process.env.MMF_API_KEY;

  if (!apiKey) {
    throw new ApiError(500, "MyMiniFactory API key is not configured");
  }

  return apiKey;
}

function buildMmfUrl(pathname, queryParams = {}) {
  const url = new URL(`${MMF_API_BASE_URL}${pathname}`);

  url.searchParams.set("key", getApiKey());

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

async function fetchMmfJson(url, options = {}) {
  const { signal, clear } = createTimeoutSignal(MMF_REQUEST_TIMEOUT_MS);
  const headers = {
    Accept: "application/json",
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal,
    });

    const data = await parseJsonSafely(response);

    if (!response.ok) {
      const message =
        data?.message || data?.error || "MyMiniFactory request failed";

      throw new ApiError(response.status || 502, message);
    }

    if (!data) {
      throw new ApiError(
        502,
        "MyMiniFactory returned an invalid JSON response",
      );
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "MyMiniFactory request timed out");
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(502, "Unable to reach MyMiniFactory");
  } finally {
    clear();
  }
}

function normalizeDesigner(designer) {
  if (!designer) {
    return null;
  }

  return {
    username: designer.username || null,
    name: designer.name || null,
    profileUrl: designer.profile_url || null,
    avatarUrl: designer.avatar_url || null,
  };
}

function normalizeImage(image) {
  if (!image) {
    return null;
  }

  return {
    id: image.id || null,
    isPrimary: Boolean(image.is_primary),
    originalUrl: image.original?.url || null,
    thumbnailUrl: image.thumbnail?.url || null,
    standardUrl: image.standard?.url || null,
  };
}

function getFirstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return null;
}

function getPathExtension(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(String(value));
    const pathname = url.pathname.toLowerCase();
    const match = pathname.match(/\.[a-z0-9]+$/);
    return match?.[0] || null;
  } catch {
    const match = String(value).toLowerCase().match(/\.[a-z0-9]+$/);
    return match?.[0] || null;
  }
}

function normalizeMmfFile(file) {
  if (!file || typeof file !== "object") {
    return null;
  }

  const downloadUrl = getFirstText(
    file.download_url,
    file.downloadUrl,
    file.file_url,
    file.fileUrl,
    file.direct_url,
    file.directUrl,
    file.archive_url,
    file.archiveUrl,
    file.url,
    file.download?.url,
    file.file?.url,
    file.model?.url,
  );

  const name = getFirstText(
    file.name,
    file.filename,
    file.file_name,
    file.original_filename,
    file.title,
    downloadUrl,
  );

  const extension = getPathExtension(name) || getPathExtension(downloadUrl);

  return {
    id: file.id || file.file_id || null,
    name,
    extension,
    downloadUrl,
    viewerUrl: file.viewer_url || file.viewerUrl || null,
    thumbnailUrl: file.thumbnail_url || file.thumbnailUrl || null,
    size: file.size || file.filesize || file.file_size || null,
    mimeType: file.mime_type || file.mimeType || file.content_type || null,
  };
}

function collectMmfFiles(object) {
  const candidateGroups = [
    object?.files,
    object?.model_files,
    object?.modelFiles,
    object?.models,
    object?.download_files,
    object?.downloadFiles,
    object?.downloads,
  ];

  const normalizedFiles = [];

  for (const group of candidateGroups) {
    const files = Array.isArray(group) ? group : group?.items;

    if (!Array.isArray(files)) {
      continue;
    }

    for (const file of files) {
      const normalizedFile = normalizeMmfFile(file);

      if (normalizedFile?.id || normalizedFile?.name || normalizedFile?.downloadUrl) {
        normalizedFiles.push(normalizedFile);
      }
    }
  }

  const seenKeys = new Set();

  return normalizedFiles.filter((file) => {
    const key = [file.id, file.name, file.downloadUrl].filter(Boolean).join(":");

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function normalizeCategory(category) {
  if (!category) {
    return null;
  }

  return {
    id: category.id || null,
    name: category.name || null,
    slug: category.slug || null,
    url: category.url || null,
  };
}

function normalizeLicenseFlag(licenseFlag) {
  if (!licenseFlag) {
    return null;
  }

  return {
    type: licenseFlag.type || null,
    value: typeof licenseFlag.value === "boolean" ? licenseFlag.value : null,
  };
}

function normalizeObject(object) {
  if (!object) {
    return null;
  }

  return {
    id: object.id || null,
    source: "myminifactory",
    url: object.url || null,
    name: object.name || null,
    description: object.description || null,
    descriptionHtml: object.description_html || null,
    printingDetails: object.printing_details || null,
    printingDetailsHtml: object.printing_details_html || null,
    dimensions: object.dimensions || null,
    materialQuantity: object.material_quantity || null,
    license: object.license || null,
    licenses: Array.isArray(object.licenses)
      ? object.licenses.map(normalizeLicenseFlag).filter(Boolean)
      : [],
    tags: Array.isArray(object.tags) ? object.tags : [],
    categories: Array.isArray(object.categories)
      ? object.categories.map(normalizeCategory).filter(Boolean)
      : [],
    images: Array.isArray(object.images)
      ? object.images.map(normalizeImage).filter(Boolean)
      : [],
    files: collectMmfFiles(object),
    designer: normalizeDesigner(object.designer),
    publishedAt: object.published_at || null,
    views: object.views ?? null,
    likes: object.likes ?? null,
    featured: Boolean(object.featured),
  };
}

function selectPreferredPrintableMmfFile(files = []) {
  const supportedFiles = files.filter(
    (file) =>
      file?.downloadUrl && SUPPORTED_MMF_MODEL_EXTENSIONS.has(file.extension),
  );

  const extensionPriority = new Map([
    [".3mf", 0],
    [".stl", 1],
    [".obj", 2],
  ]);

  return (
    supportedFiles.sort((a, b) => {
      const aPriority = extensionPriority.get(a.extension) ?? 99;
      const bPriority = extensionPriority.get(b.extension) ?? 99;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return String(a.name || "").localeCompare(String(b.name || ""));
    })[0] || null
  );
}

function buildDownloadUrl(file) {
  const url = new URL(file.downloadUrl);
  const apiBaseUrl = new URL(MMF_API_BASE_URL);

  if (
    !file.requiresOAuthDownload &&
    url.hostname === apiBaseUrl.hostname &&
    !url.searchParams.has("key")
  ) {
    url.searchParams.set("key", getApiKey());
  }

  return url;
}

function isMmfApiDownloadUrl(url) {
  const apiBaseUrl = new URL(MMF_API_BASE_URL);

  return url.hostname === apiBaseUrl.hostname;
}

function cloneUrlWithApiKey(url) {
  const nextUrl = new URL(url.toString());

  if (!nextUrl.searchParams.has("key")) {
    nextUrl.searchParams.set("key", getApiKey());
  }

  return nextUrl;
}

async function fetchMmfDownloadAttempt(url, { accessToken, useBearer, signal }) {
  const headers = {
    Accept: "*/*",
    "User-Agent": "UniFab/1.0 MyMiniFactoryFileMapper",
    Referer: "https://www.myminifactory.com/",
  };

  if (useBearer && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(url, {
    method: "GET",
    headers,
    redirect: "follow",
    signal,
  });
}

function buildMmfOAuthUrl(pathname, queryParams = {}) {
  const url = new URL(`${MMF_API_BASE_URL}${pathname}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function downloadMmfFile(file) {
  if (!file?.downloadUrl) {
    throw new ApiError(400, "MyMiniFactory file does not include a download URL");
  }

  const declaredSize = Number(file.size || 0);

  if (declaredSize > MAX_MMF_FILE_DOWNLOAD_BYTES) {
    throw new ApiError(
      400,
      "MyMiniFactory file is larger than the supported 50 MB limit",
    );
  }

  const { signal, clear } = createTimeoutSignal(MMF_REQUEST_TIMEOUT_MS);

  try {
    const downloadUrl = buildDownloadUrl(file);
    const isApiUrl = isMmfApiDownloadUrl(downloadUrl);
    const accessToken = file.requiresOAuthDownload
      ? await getMmfOAuthAccessToken()
      : null;
    const attempts = [];
    let response = null;

    if (isApiUrl && accessToken) {
      attempts.push({
        url: downloadUrl,
        useBearer: true,
      });
      attempts.push({
        url: cloneUrlWithApiKey(downloadUrl),
        useBearer: false,
      });
    } else {
      attempts.push({
        url: downloadUrl,
        useBearer: false,
      });

      if (accessToken) {
        attempts.push({
          url: downloadUrl,
          useBearer: true,
        });
      }
    }

    for (const attempt of attempts) {
      response = await fetchMmfDownloadAttempt(attempt.url, {
        accessToken,
        useBearer: attempt.useBearer,
        signal,
      });

      if (response.ok || response.status !== 403) {
        break;
      }
    }

    if (!response.ok) {
      throw new ApiError(
        response.status || 502,
        response.status === 403
          ? "Unable to download printable file from MyMiniFactory (403). The connected MMF account may not have permission to download this file, or MMF may require downloading this object from the website first."
          : `Unable to download printable file from MyMiniFactory (${response.status})`,
      );
    }

    const contentLength = Number(response.headers.get("content-length") || 0);

    if (contentLength > MAX_MMF_FILE_DOWNLOAD_BYTES) {
      throw new ApiError(
        400,
        "MyMiniFactory file is larger than the supported 50 MB limit",
      );
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

    if (fileBuffer.byteLength > MAX_MMF_FILE_DOWNLOAD_BYTES) {
      throw new ApiError(
        400,
        "MyMiniFactory file is larger than the supported 50 MB limit",
      );
    }

    return fileBuffer;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "MyMiniFactory file download timed out");
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(502, "Unable to download printable file from MyMiniFactory");
  } finally {
    clear();
  }
}

async function getObjectFileById(fileId) {
  const accessToken = await getMmfOAuthAccessToken();
  const url = buildMmfOAuthUrl(`/files/${fileId}`);
  const data = await fetchMmfJson(url, { accessToken });

  return {
    ...normalizeMmfFile(data),
    requiresOAuthDownload: true,
  };
}

async function getObjectFilesByIdWithOAuth(objectId) {
  const accessToken = await getMmfOAuthAccessToken();
  const url = buildMmfOAuthUrl(`/objects/${objectId}/files`);
  const data = await fetchMmfJson(url, { accessToken });
  const files = Array.isArray(data) ? data : data?.items || data?.files || [];

  return collectMmfFiles({ files }).map((file) => ({
    ...file,
    requiresOAuthDownload: true,
  }));
}

async function hydrateMmfFileForDownload(file) {
  if (file?.downloadUrl) {
    return file;
  }

  if (!file?.id) {
    throw new ApiError(400, "MyMiniFactory file is missing a file ID");
  }

  return getObjectFileById(file.id);
}

function buildFileCandidate(file) {
  const isDirectModel = SUPPORTED_MMF_MODEL_EXTENSIONS.has(file.extension);
  const isArchive = SUPPORTED_MMF_ARCHIVE_EXTENSIONS.has(file.extension);

  return {
    id: file.id,
    name: file.name,
    extension: file.extension,
    size: file.size,
    type: isArchive ? "zip" : "model",
    supported: isDirectModel || isArchive,
    requiresArchiveEntry: isArchive,
    archiveEntries: [],
    thumbnailUrl: file.thumbnailUrl || null,
    viewerUrl: file.viewerUrl || null,
  };
}

async function inspectMmfObjectFiles(objectId) {
  const files = await getObjectFilesByIdWithOAuth(objectId);
  const hydratedFiles = await Promise.all(
    files.map((file) => hydrateMmfFileForDownload(file)),
  );
  const candidates = [];

  for (const file of hydratedFiles) {
    const candidate = buildFileCandidate(file);

    if (!candidate.supported) {
      continue;
    }

    if (candidate.type === "zip") {
      const declaredSize = Number(file.size || 0);

      if (declaredSize > MAX_MMF_ZIP_INSPECTION_BYTES) {
        candidate.supported = false;
        candidate.error = "ZIP archive exceeds the 100 MB inspection limit";
      } else {
        const archiveBuffer = await downloadMmfFile(file);
        candidate.archiveEntries = listPrintableZipEntries(archiveBuffer);
        candidate.supported = candidate.archiveEntries.length > 0;

        if (!candidate.supported) {
          candidate.error = "No supported STL, OBJ, or 3MF files found in ZIP";
        }
      }
    }

    candidates.push(candidate);
  }

  const preferredCandidate =
    candidates.find(
      (candidate) => candidate.type === "model" && candidate.supported,
    ) ||
    candidates.find(
      (candidate) =>
        candidate.type === "zip" &&
        candidate.supported &&
        candidate.archiveEntries.length > 0,
    ) ||
    null;

  return {
    objectId: Number(objectId),
    files: candidates,
    preferredSelection: preferredCandidate
      ? {
          selectedMmfFileId: preferredCandidate.id,
          selectedArchiveEntryPath:
            preferredCandidate.type === "zip"
              ? preferredCandidate.archiveEntries[0]?.path || null
              : null,
        }
      : null,
  };
}

function getMmfOAuthConfig() {
  const clientId = process.env.MMF_CLIENT_ID;
  const clientSecret = process.env.MMF_CLIENT_SECRET;
  const redirectUri = process.env.MMF_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ApiError(500, "MyMiniFactory OAuth is not configured");
  }

  return { clientId, clientSecret, redirectUri };
}

function getMmfOAuthStateSecret() {
  const secret =
    process.env.MMF_OAUTH_STATE_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.JWT_ACCESS_TOKEN_SECRET;

  if (!secret) {
    throw new ApiError(500, "MyMiniFactory OAuth state secret is not configured");
  }

  return secret;
}

function normalizeTokenResponse(data) {
  if (!data?.access_token) {
    throw new ApiError(502, "MyMiniFactory OAuth did not return an access token");
  }

  const expiresIn = Number(data.expires_in || 3600);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    tokenType: data.token_type || "Bearer",
    expiresAt: new Date(Date.now() + Math.max(expiresIn - 60, 60) * 1000),
    scope: data.scope || null,
    accountUserId: data.user_id || null,
  };
}

function shouldRetryMmfOAuthWithBodyCredentials(response, data) {
  const message = `${data?.error_description || ""} ${data?.error || ""} ${
    data?.message || ""
  }`.toLowerCase();

  return (
    response.status === 400 ||
    response.status === 401 ||
    message.includes("invalid client")
  );
}

async function postMmfOAuthToken(bodyParams, authStrategy) {
  const { clientId, clientSecret } = getMmfOAuthConfig();
  const { signal, clear } = createTimeoutSignal(MMF_REQUEST_TIMEOUT_MS);
  const tokenBody = new URLSearchParams(bodyParams);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (authStrategy === "basic") {
    headers.Authorization = `Basic ${Buffer.from(
      `${clientId}:${clientSecret}`,
    ).toString("base64")}`;
  } else {
    tokenBody.set("client_id", clientId);
    tokenBody.set("client_key", clientId);
    tokenBody.set("client_secret", clientSecret);
  }

  try {
    const response = await fetch(`${MMF_AUTH_BASE_URL}/v1/oauth/tokens`, {
      method: "POST",
      headers,
      body: tokenBody,
      signal,
    });
    const data = await parseJsonSafely(response);

    return { response, data };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "MyMiniFactory OAuth request timed out");
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(502, "Unable to reach MyMiniFactory OAuth");
  } finally {
    clear();
  }
}

async function requestMmfOAuthToken(bodyParams) {
  const firstAttempt = await postMmfOAuthToken(bodyParams, "basic");
  let tokenResponse = firstAttempt;

  if (
    !firstAttempt.response.ok &&
    shouldRetryMmfOAuthWithBodyCredentials(
      firstAttempt.response,
      firstAttempt.data,
    )
  ) {
    tokenResponse = await postMmfOAuthToken(bodyParams, "body");
  }

  if (!tokenResponse.response.ok) {
    throw new ApiError(
      tokenResponse.response.status || 502,
      tokenResponse.data?.error_description ||
        tokenResponse.data?.message ||
        tokenResponse.data?.error ||
        "MyMiniFactory OAuth failed",
    );
  }

  return normalizeTokenResponse(tokenResponse.data);
}

async function storeMmfOAuthToken(
  tokenData,
  connectedBy,
  existingRefreshToken = null,
) {
  const refreshToken = tokenData.refreshToken || existingRefreshToken;

  if (!refreshToken) {
    throw new ApiError(502, "MyMiniFactory OAuth did not return a refresh token");
  }

  return upsertIntegrationToken({
    provider: MMF_PROVIDER,
    accessTokenEncrypted: encryptText(tokenData.accessToken),
    refreshTokenEncrypted: encryptText(refreshToken),
    tokenType: tokenData.tokenType,
    expiresAt: tokenData.expiresAt,
    scope: tokenData.scope,
    accountUserId: tokenData.accountUserId,
    connectedBy,
  });
}

function normalizeMmfOAuthStatus(tokenRow) {
  if (!tokenRow) {
    return {
      connected: false,
      accountUserId: null,
      expiresAt: null,
      connectedBy: null,
      updatedAt: null,
    };
  }

  return {
    connected: true,
    accountUserId: tokenRow.account_user_id || null,
    expiresAt: tokenRow.expires_at || null,
    connectedBy: tokenRow.connected_by || null,
    updatedAt: tokenRow.updated_at || null,
  };
}

async function getMmfOAuthStatus() {
  return normalizeMmfOAuthStatus(await getIntegrationToken(MMF_PROVIDER));
}

function buildMmfOAuthAuthorizationUrl(adminUserId) {
  const { clientId, redirectUri } = getMmfOAuthConfig();
  const state = jwt.sign(
    {
      provider: MMF_PROVIDER,
      adminUserId,
    },
    getMmfOAuthStateSecret(),
    { expiresIn: "10m" },
  );
  const url = new URL(`${MMF_AUTH_BASE_URL}/web/authorize`);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url.toString();
}

async function exchangeMmfOAuthCode({ code, state }) {
  if (!code) {
    throw new ApiError(400, "MyMiniFactory OAuth callback is missing code");
  }

  let decodedState;

  try {
    decodedState = jwt.verify(state, getMmfOAuthStateSecret());
  } catch {
    throw new ApiError(400, "MyMiniFactory OAuth state is invalid or expired");
  }

  if (decodedState.provider !== MMF_PROVIDER || !decodedState.adminUserId) {
    throw new ApiError(400, "MyMiniFactory OAuth state is invalid");
  }

  const { redirectUri } = getMmfOAuthConfig();
  const tokenData = await requestMmfOAuthToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  return storeMmfOAuthToken(tokenData, decodedState.adminUserId);
}

async function disconnectMmfOAuth() {
  return deleteIntegrationToken(MMF_PROVIDER);
}

async function getMmfOAuthAccessToken() {
  const tokenRow = await getIntegrationToken(MMF_PROVIDER);

  if (!tokenRow) {
    throw new ApiError(
      409,
      "MyMiniFactory OAuth is not connected. Connect a lab MMF account before inspecting files.",
    );
  }

  const expiresAt = tokenRow.expires_at
    ? new Date(tokenRow.expires_at).getTime()
    : 0;

  if (expiresAt > Date.now() + 60 * 1000) {
    return decryptText(tokenRow.access_token_encrypted);
  }

  const refreshToken = decryptText(tokenRow.refresh_token_encrypted);
  const tokenData = await requestMmfOAuthToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const storedToken = await storeMmfOAuthToken(
    tokenData,
    tokenRow.connected_by,
    tokenData.refreshToken || refreshToken,
  );

  return decryptText(storedToken.access_token_encrypted);
}

async function searchObjects({ q, page, per_page, sort, order }) {
  const cacheParams = {
    q,
    page,
    per_page,
    sort: sort === "relevance" ? undefined : sort,
    order: sort === "relevance" ? undefined : order,
  };

  const cachedResult = getCachedSearchResult(cacheParams);

  if (cachedResult) {
    return cachedResult;
  }

  const url = buildMmfUrl("/search", cacheParams);
  const data = await fetchMmfJson(url);

  const normalizedResult = {
    totalCount: Number(data?.total_count || 0),
    items: Array.isArray(data?.items)
      ? data.items.map(normalizeObject).filter(Boolean)
      : [],
  };

  return setCachedSearchResult(cacheParams, normalizedResult);
}

async function getObjectById(objectId) {
  const cachedObject = getCachedObject(objectId);

  if (cachedObject) {
    return cachedObject;
  }

  const url = buildMmfUrl(`/objects/${objectId}`);
  const data = await fetchMmfJson(url);

  const normalizedObject = normalizeObject(data);

  return setCachedObject(objectId, normalizedObject);
}

async function getObjectFilesById(objectId) {
  try {
    const url = buildMmfUrl(`/objects/${objectId}/files`);
    const data = await fetchMmfJson(url);
    const files = Array.isArray(data) ? data : data?.items || data?.files || [];

    return collectMmfFiles({ files });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return [];
    }

    throw error;
  }
}

export {
  buildMmfOAuthAuthorizationUrl,
  disconnectMmfOAuth,
  exchangeMmfOAuthCode,
  getMmfOAuthStatus,
  getObjectFileById,
  searchObjects,
  getObjectById,
  getObjectFilesById,
  getObjectFilesByIdWithOAuth,
  hydrateMmfFileForDownload,
  inspectMmfObjectFiles,
  selectPreferredPrintableMmfFile,
  downloadMmfFile,
  SUPPORTED_MMF_MODEL_EXTENSIONS,
};
