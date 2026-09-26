---
name: Supplier account activation
description: Security boundary for creating supplier credentials after profile approval.
---

Supplier profile submission and supplier account activation are separate steps. Only an administrator may issue a one-use, 48-hour password setup link after approving the profile; issuing a replacement invalidates prior unused links, and activation must never overwrite active credentials.

**Why:** An unreviewed profile must not gain supplier access, while an existing active supplier password must remain protected from invitation flows.

**How to apply:** Keep password creation out of invitation completion. Generate setup links only for approved, active supplier profiles, store only token hashes, and create or explicitly re-enable access only when the administrator issues the link.