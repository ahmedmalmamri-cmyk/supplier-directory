---
name: Supply request visibility
description: Role-scoped visibility and default lifecycle for bakery supply requests.
---

Published requests are visible only to the posting buyer's session or a signed-in active supplier. Buyer sessions see only their own requests. Supplier feeds include active, non-expired requests from active owners and may show the business name, but must omit buyer IDs, full names, email addresses, and phone numbers. Resolve the owner's phone only after an active supplier initiates contact for a valid request; prepare a WhatsApp message with supplier details, business name, request context, and a price inquiry. Test-mode contact previews must not create logs or open WhatsApp.

New requests expire 30 days after creation unless the product later configures a different duration.

**Why:** The business name is useful market context and was explicitly requested, while a buyer's phone and personal identity remain private until a supplier deliberately contacts them. A fixed lifetime prevents old opportunities from appearing indefinitely.

**How to apply:** Keep request reads authenticated and server-scoped; include the business-name field only as needed and never add buyer ID, personal name, email, or phone to supplier feed responses. Enforce status and expiry on the server, and use a separate supplier-authorized contact flow that resolves the phone only for that action.