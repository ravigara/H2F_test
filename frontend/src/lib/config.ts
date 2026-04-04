const DEFAULT_BACKEND_PORT = "8000";

function ensureNoTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return ensureNoTrailingSlash(configured);
  }

  const { protocol, hostname, port } = window.location;
  if (port === DEFAULT_BACKEND_PORT) {
    return ensureNoTrailingSlash(window.location.origin);
  }

  return ensureNoTrailingSlash(`${protocol}//${hostname}:${DEFAULT_BACKEND_PORT}`);
}

export function getWebSocketBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/^http/i, "ws");
}
