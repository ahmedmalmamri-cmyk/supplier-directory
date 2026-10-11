// Verified published directory URL; invitation links must never point to the editor preview.
const publishedSiteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;

export function publishedPageUrl(path: string): string {
  return new URL(path, publishedSiteUrl).toString();
}

export function isDevelopmentPreview(): boolean {
  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".replit.dev");
}