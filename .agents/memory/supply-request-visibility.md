---
name: Supply request visibility
description: Role-scoped visibility and default lifecycle for bakery supply requests.
---

Published requests are visible only to the posting buyer's session or a signed-in active supplier. Buyer sessions see only their own requests. Supplier feeds include active, non-expired requests from active owners and omit buyer identifiers and contact fields.

New requests expire 30 days after creation unless the product later configures a different duration.

**Why:** Procurement details can reveal sensitive business needs. Suppliers need the requested item and delivery context, not the buyer's contact identity; a fixed lifetime prevents old opportunities from appearing indefinitely.

**How to apply:** Keep request reads authenticated and server-scoped, omit buyer ID, phone, and email from supplier responses, and enforce status and expiry on the server. Add a separate authorized response/contact flow rather than exposing identity.