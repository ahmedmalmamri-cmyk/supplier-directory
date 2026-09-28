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

The owner's later four-root taxonomy direction supersedes the earlier choice to place Aramco ready-cake names under the cake-supplies mixing branch. The cake-supplies branch is now retired; do not recreate it to satisfy the old choice.

**Why:** The new request explicitly removed replaced categories and directed items without a clear home to a temporary review root. Cake mixes and finished-cake names do not clearly match the eight new food-ingredient branches.

**How to apply:** Leave uncertain cake names staged for review, rather than silently interpreting them as flour or flavorings.

Multi-section membership is distinct from a supplier's explicit item links. Retain a single synchronized primary section for each item even when it appears in additional sections.

**Why:** The former and current classification systems had similar terminology but different identities. A supplier's item association cannot be deduced solely from a section's name.

**How to apply:** Resolve section membership within the current tree only, and maintain supplier links explicitly. A section's removal must never erase the underlying item or its supplier associations.

The temporary "unclassified items" section used in an earlier rollout was not a permanent public grouping. For the newer four-root tree, the owner specifically requested a new inactive «أصناف أخرى» review root for equipment and unclear placements.

**Why:** Removing the equipment section and combining mixed old branches makes a confident destination impossible for some items. Preserving them in a non-public review area protects their IDs and supplier links without misrepresenting what suppliers sell.

**How to apply:** Keep staged items visible to admins but hidden from the public directory; wait for explicit review before activating or assigning them to the four approved roots. Do not reintroduce retired headings as public items.

Classification by a broad Arabic keyword needs a semantic check before publishing, especially for production tools whose names overlap packaging terms.

**Why:** Piping bags used to decorate cake were initially misread as packaging bags; one was also misread as a delivery carrier because its name said "thermal". Arabic plurals such as «ألوان» also need explicit recognition when classifying colorants.

**How to apply:** Check item names in context, not only their generic nouns or incidental adjectives. Stage decorating tools when the approved tree has no production-tools branch; place clearly named food colorings under flavors/colorants.