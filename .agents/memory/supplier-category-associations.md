---
name: Supplier category associations
description: Why supplier registration choices and normalized category links coexist.
---

Treat approved supplier-request category selections as the historical source for associations. The normalized supplier-category links serve live category counts and filtered listings; refresh them in the same transaction whenever a supplier is approved or relevant category assignments change. Keep aliases tied to stable category identities when labels are renamed.

**Why:** Existing registration and invitation flows retain the submitted category names, including old combined labels. Replacing those records or deriving links from product names would lose intent; rebuilding links from renamed labels without stable aliases can silently drop suppliers.

**How to apply:** When adding a path that changes approved selections, supplier-to-request links, or category identity, synchronize the normalized links atomically and verify that displayed supplier counts agree with filtered results. Preserve the submitted selections for compatibility and audit history.

An irreversible category removal must also account for supplier selections saved by name, including old combined labels, even when there is no current normalized supplier link. Block removal while pending or approved requests still refer to that identity; rejected requests are historical text and are not eligible for approval or resynchronization.

**Why:** Removing the category can silently drop a pending request's selection when it is approved later, or attach it to a different category if the same name is reused.

**How to apply:** Treat actionable and approved requests as indirect category references during permanent deletion; do not cascade-delete supplier links or aliases to make a removal succeed.

An inactive category with an alias may be deleted if that exact alias also remains attached to a different active category, provided all other dependency checks pass. An alias without an active alternative must still block deletion.

**Why:** Older taxonomy entries can retain duplicate alias mappings after categories are reorganized. Blocking on every alias prevents removing an otherwise unreferenced legacy item, even though the active replacement continues resolving that name.

**How to apply:** Recheck alternate alias ownership and all supplier, product, child-category, and actionable request dependencies within the permanent-delete transaction. Do not remove the shared alias from its active replacement or bypass the separate admin confirmation.

Future staged supplier registration must use identifiers from the current supplier taxonomy, not the old item-category identities. Keep the legacy supplier-category association intact for compatibility; record proposed choices against the current tree with real relational foreign keys, and treat any JSON list as a snapshot rather than an enforceable relationship.

**Why:** The owner explicitly chose the current supplier tree when preparing the smart-registration schema. The existing legacy association points to retired item categories; silently reusing it for new identifiers would associate suppliers with the wrong products.

**How to apply:** When implementing the registration UI and review flow, keep unapproved choices out of public supplier filters and exact-item matching. Promote only administrator-reviewed associations, without converting old name-based selections by guessing matching IDs.