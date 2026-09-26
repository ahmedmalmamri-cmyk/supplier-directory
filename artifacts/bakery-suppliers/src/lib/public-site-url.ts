// Verified published directory URL; invitation links must never point to the editor preview.
const publishedSiteUrl = "https://dlyl-mwrdy-lmkhbz-wl-hlwyt.replit.app";

export function publishedPageUrl(path: string): string {
  return new URL(path, publishedSiteUrl).toString();
}