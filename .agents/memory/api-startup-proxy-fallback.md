---
name: API startup proxy fallback
description: Distinguishing temporary reverse-proxy responses from application-level API errors.
---

An HTML 404 on an API request can come from the workspace proxy while the API service is starting; it is not necessarily the API's own not-found response. Distinguish it by response format, not status alone.

**Why:** A mobile admin deletion reported a page of HTML instead of an application error during the same interval that the API service was coming online. Once the service was running, that route returned the expected JSON response.

**How to apply:** For user-facing API failures, never display a proxy's HTML body. If retrying a write, limit retries to responses that clearly came from the proxy before reaching the API; do not retry ordinary JSON not-found or validation responses as if they were outages.