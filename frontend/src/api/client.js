export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";

function buildRequestOptions(options = {}) {
  return {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  };
}

function shouldTryRefresh(path, response, hasRetried) {
  const canRefreshAuthPath = path === "/auth/current-user";

  return (
    response.status === 401 &&
    !hasRetried &&
    (!path.startsWith("/auth/") || canRefreshAuthPath)
  );
}

async function refreshSession() {
  const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.ok;
}

async function parseResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}

export async function apiRequest(path, options = {}, hasRetried = false) {
  const requestOptions = buildRequestOptions(options);
  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);

  if (shouldTryRefresh(path, response, hasRetried)) {
    const didRefresh = await refreshSession();

    if (didRefresh) {
      return apiRequest(path, options, true);
    }
  }

  return parseResponse(response);
}

export async function apiBlobRequest(path, options = {}, hasRetried = false) {
  const requestOptions = buildRequestOptions({
    ...options,
    headers: options.headers || {},
  });
  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);

  if (shouldTryRefresh(path, response, hasRetried)) {
    const didRefresh = await refreshSession();

    if (didRefresh) {
      return apiBlobRequest(path, options, true);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      error?.message || `Request failed with status ${response.status}`,
    );
  }

  return {
    blob: await response.blob(),
    fileName: getFileNameFromContentDisposition(
      response.headers.get("Content-Disposition"),
    ),
  };
}

function getFileNameFromContentDisposition(contentDisposition) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);

  return plainMatch?.[1]?.trim() || null;
}
