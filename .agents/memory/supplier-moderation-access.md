---
name: Supplier moderation access
description: Durable security decision for supplier login, contact-linked reports, and buyer moderation.
---

Supplier accounts do not receive moderation authority. An approved supplier gets a separate session only after an administrator provisions or resets access. A report is valid only when its contact record belongs to that supplier, and buyer status changes are administrator decisions recorded separately.

**Why:** Existing supplier requests had no password or login identity, and trusting a supplier ID from the browser would allow fabricated reports or cross-supplier access.

**How to apply:** Keep supplier identity server-derived from the signed session, keep contact logs as the evidence boundary, and preserve an admin review trail for every buyer status change.