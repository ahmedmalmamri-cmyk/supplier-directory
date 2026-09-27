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

For the owner-supplied Aramco ready-cake names, respect the owner's explicit choice of the cake-supplies mixing branch even though the names sound like finished products.

**Why:** After the administrator removed both ready-cake locations, the owner was asked where the nine names should go and specifically chose the mixing branch. Recreating or moving them to a seemingly more natural ready-cake location would contradict that direction.

**How to apply:** Do not automatically reclassify those nine names or recreate a deleted ready-cake section during future taxonomy work; ask before changing their placement.

Multi-section membership is distinct from a supplier's explicit item links. Retain a single synchronized primary section for each item even when it appears in additional sections.

**Why:** The former and current classification systems had similar terminology but different identities. A supplier's item association cannot be deduced solely from a section's name.

**How to apply:** Resolve section membership within the current tree only, and maintain supplier links explicitly. A section's removal must never erase the underlying item or its supplier associations.

The temporary "unclassified items" section was a staging area, not a permanent public grouping; the owner later approved all staged destinations, including initially ambiguous ones. Duplicate old names should not create duplicate current items.

**Why:** The owner first chose staging rather than guessing from old group headings, then reviewed and approved the complete distribution before activating it.

**How to apply:** Do not reintroduce old headings as items, automatically recreate removed imports, or reassign the approved placements from their current destinations without a new decision.