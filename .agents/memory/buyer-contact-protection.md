---
name: Buyer contact protection
description: Durable rule for authenticated buyer-to-supplier WhatsApp contact.
---

All supplier contact actions must be gated by an authenticated buyer session and recorded server-side before an external WhatsApp URL is returned. The message should contain buyer identity and a stable reference ID.

**Why:** The directory must prevent anonymous supplier outreach and preserve a traceable, formally formatted introduction for each contact.

**How to apply:** Keep UI guards and server authorization together. Do not reintroduce direct supplier WhatsApp links on cards, profile pages, or product pages.