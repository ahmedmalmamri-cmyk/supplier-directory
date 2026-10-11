const configuredOrigin = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

if (configuredOrigin && !/^https?:\/\/[^/]+$/.test(configuredOrigin)) {
  throw new Error("VITE_API_URL must be the API origin, without /api or another path.");
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.startsWith("/uploads/") ? `/api${path}` : path;
  return configuredOrigin && normalized.startsWith("/")
    ? `${configuredOrigin}${normalized}`
    : normalized;
}

export function normalizeApiData(value: unknown): unknown {
  if (typeof value === "string" && (
    value.startsWith("/uploads/") ||
    /^\/api\/item-inquiries\/\d+\/photo(?:\?|$)/.test(value)
  )) return apiUrl(value);
  if (Array.isArray(value)) return value.map(normalizeApiData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeApiData(item)]));
  }
  return value;
}

/**
 * Used by BOTH handwritten requests and generated API hooks.
 * Session cookies go only to our API, never to signed third-party upload URLs.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const inputUrl = input instanceof Request ? input.url : String(input);
  const resolved = apiUrl(inputUrl);
  const origin = window.location.origin;
  const isApi = new URL(resolved, origin).origin === new URL(configuredOrigin || origin).origin;
  const request = input instanceof Request
    ? resolved === input.url ? input : new Request(resolved, input)
    : resolved;
  const response = await globalThis.fetch(request, {
    ...init,
    credentials: isApi ? "include" : "omit",
  });
  // Keep native status, streams, headers and text() behavior; only JSON assets
  // need rebasing for images/documents hosted by the independent backend.
  const readJson = response.json.bind(response);
  response.json = async () => normalizeApiData(await readJson());
  return response;
}
