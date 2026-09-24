---
name: Supplier source attribution
description: How source statistics should treat legacy supplier records and invitation links.
---

Only assign a supplier source when the creation path is known. Keep existing records with ambiguous origins as `legacy`; an invitation token alone does not prove that a supplier was added through WhatsApp.

**Why:** Existing suppliers can receive invitation links after they were already added, so treating every token-bearing supplier as a WhatsApp addition would misstate source statistics.

**How to apply:** Set the source explicitly in each create or approval path. Backfill only unambiguous historical drafts or self-registration records, and exclude unattributed legacy rows from source-category totals with a clear UI note.