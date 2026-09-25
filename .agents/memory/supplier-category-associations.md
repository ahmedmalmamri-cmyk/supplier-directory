---
name: Supplier category associations
description: Why supplier registration choices and normalized category links coexist.
---

Treat approved supplier-request category selections as the historical source for associations. The normalized supplier-category links serve live category counts and filtered listings; refresh them in the same transaction whenever a supplier is approved or relevant category assignments change. Keep aliases tied to stable category identities when labels are renamed.

**Why:** Existing registration and invitation flows retain the submitted category names, including old combined labels. Replacing those records or deriving links from product names would lose intent; rebuilding links from renamed labels without stable aliases can silently drop suppliers.

**How to apply:** When adding a path that changes approved selections, supplier-to-request links, or category identity, synchronize the normalized links atomically and verify that displayed supplier counts agree with filtered results. Preserve the submitted selections for compatibility and audit history.