---
name: Taxonomy rollout safety
description: Preserve existing supplier associations while replacing the public item classification.
---

The supplier item tree is now the public classification source. Treat retired old classifications as an archive for audit and recovery, not as a second live directory or a source for automatic reseeding.

**Why:** The owner approved the complete proposed distribution, including its 23 initially uncertain placements, before authorizing activation and deletion of the old classification rows. Prior to that approval, the old tree remained in use to avoid guessed destinations.

**How to apply:** Use new taxonomy nodes/items for future browsing, supplier assignments and requests. Keep archived legacy data read-only; do not restore or infer associations from old names without explicit review.

For owner-supplied item imports, do not assume every initially proposed branch still exists. Import available groups independently and defer groups with deleted destinations rather than recreating a deleted branch or preventing the whole service from starting.

**Why:** An admin removed both ready-cake locations after the initial tree was created; a whole-list import that required the original destination prevented the API from starting, while silently picking a different destination would override an intentional edit.

**How to apply:** Keep an independent completion marker per supplied group so deferred groups can be placed after clarification without reintroducing previously imported items that the admin later deletes. Report pending destinations to the user.

The owner clarified that «مستلزمات الكيك» must be restored as the second public root after «المواد الخام الغذائية», with the four branches that existed immediately before its removal and their previous item placements. The earlier choice to put existing Aramco cake names under «خلطات الكيك» still applies.

**Why:** A four-root reorganization had incorrectly removed cake supplies. The owner explicitly corrected that interpretation. «كيك جاهز» had been deleted by an admin before the removal, so restoring the prior distribution does not recreate that branch or deleted items.

**How to apply:** Preserve the former cake branch destinations for existing items; do not reimport previously deleted names, add a ready-cake branch, or silently override subsequent admin edits. Keep equipment staged, not under cake.

Multi-section membership is distinct from a supplier's explicit item links. Retain a single synchronized primary section for each item even when it appears in additional sections.

**Why:** The former and current classification systems had similar terminology but different identities. A supplier's item association cannot be deduced solely from a section's name.

**How to apply:** Resolve section membership within the current tree only, and maintain supplier links explicitly. A section's removal must never erase the underlying item or its supplier associations.

When merging a reviewed duplicate item, repoint legacy mappings and import markers to the canonical item before deleting the duplicate. Transfer supplier links, buyer references and valid secondary sections in the same transaction; the legacy importer must honor the stable canonical ID even if its name differs from the old source.

**Why:** Old duplicate-source rows can remain referenced by review mappings and import markers. Deleting the item without moving those references loses history and can make later import validation fail.

**How to apply:** Merge only explicitly reviewed duplicates, preserve the canonical primary section, exclude the duplicate's incorrect primary section, record an audit entry, and verify foreign keys before commit.

The temporary "unclassified items" section used in an earlier rollout was not a permanent public grouping. In the reorganized tree with cake supplies restored, «أصناف أخرى» remains an inactive review root for equipment and other unclear placements.

**Why:** Removing the equipment section and combining mixed old branches makes a confident destination impossible for some items. Restoring cake supplies resolves only the items whose previous cake placement is known.

**How to apply:** Keep staged items visible to admins but hidden from the public directory; wait for explicit review before activating or assigning them to the four approved roots. Do not reintroduce retired headings as public items.

Classification by a broad Arabic keyword needs a semantic check before publishing, especially for production tools whose names overlap packaging terms.

**Why:** Piping bags used to decorate cake were initially misread as packaging bags; one was also misread as a delivery carrier because its name said "thermal". Arabic plurals such as «ألوان» also need explicit recognition when classifying colorants.

**How to apply:** Check item names in context, not only their generic nouns or incidental adjectives. Stage decorating tools when the approved tree has no production-tools branch; place clearly named food colorings under flavors/colorants.