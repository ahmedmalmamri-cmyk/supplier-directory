---
name: Personal supplier invitation replacement
description: When a new personalized supplier invitation should replace an earlier one.
---

Preparing a personalized supplier invitation must not revoke the supplier's existing active link. Activate the replacement at the administrator's handoff action (opening WhatsApp or copying the link for sharing); the previous link then becomes invalid. A failed or stale activation leaves the old link usable. This does not certify WhatsApp delivery or prove the supplier opened the link.

**Why:** The user approved invalidating earlier invitations when a new one is shared, but generating a link can precede a blocked popup or failed copy. Revoking the working link at generation would strand the supplier without a usable replacement.

**How to apply:** Keep a pending token separate from the active token until handoff succeeds. Do not equate an administrator opening WhatsApp with a recipient opening an invitation; the recipient-open timestamp is a separate event.