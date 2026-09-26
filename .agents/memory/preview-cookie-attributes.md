---
name: Preview cookie attributes
description: Distinguish application cookie settings from preview-proxy cookie rewrites during authentication checks.
---

Replit's HTTPS development preview may return and store authentication cookies with `SameSite=None; Secure` even when the application itself issues `SameSite=Lax` and does not set `Secure` in development.

**Why:** A mobile browser test flagged the preview cookie's `SameSite=None` as an application failure, but responses from both the API port and the local path proxy carried the application's intended `SameSite=Lax`. The preview domain had changed the response attributes.

**How to apply:** When checking cookie security behavior, compare the response from the direct local API origin with the HTTPS preview response. Validate persistence and identity in the browser, but attribute preview-only differences to the proxy rather than changing application cookie configuration blindly. Production behavior must still be checked separately if relevant.