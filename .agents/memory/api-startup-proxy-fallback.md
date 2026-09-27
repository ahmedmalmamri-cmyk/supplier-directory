---
name: API startup proxy fallback
description: Distinguishing temporary reverse-proxy responses from application-level API errors.
---

An HTML 404 on an API request can come from the workspace proxy while the API service is starting; it is not necessarily the API's own not-found response. Distinguish it by response format, not status alone.

**Why:** A mobile admin deletion reported a page of HTML instead of an application error during the same interval that the API service was coming online. Once the service was running, that route returned the expected JSON response.

**How to apply:** For user-facing API failures, never display a proxy's HTML body. If retrying a write, limit retries to responses that clearly came from the proxy before reaching the API; do not retry ordinary JSON not-found or validation responses as if they were outages.

An admin screen may still have valid cached tree and item counts after a refresh request fails. A blocking error view must not replace those cached results solely because the latest request failed.

**Why:** A user screenshot showed populated category and item counters alongside an error in the tree panel. The API and stored items were healthy; the presentation of a transient fetch failure made the content appear absent.

**How to apply:** When a read fails after prior success, retain visible cached data, indicate that it may be stale, and retry automatically or expose a retry action. Reserve the full error view for a request that has never returned data.