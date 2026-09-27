---
name: Taxonomy rollout safety
description: Preserve existing supplier associations while replacing the public item classification.
---

The six-section item tree is a reviewed replacement, not permission to reassign or erase legacy classifications automatically. Keep the public directory on its existing classifications until the old items and supplier links have explicit destinations and the replacement can be activated safely.

**Why:** The user chose replacement only with preservation of existing items and supplier links, and specifically wanted their distribution reviewed before moving them. A guessed destination could silently change which suppliers buyers find.

**How to apply:** When implementing public browsing or migration, require a complete review of linked legacy records, make the switch atomic and reversible, and retain the source records until the new display and associations are verified. Do not treat creation of proposed sections alone as approval of the old-to-new mapping.

For owner-supplied item imports, do not assume every initially proposed branch still exists. Import available groups independently and defer groups with deleted destinations rather than recreating a deleted branch or preventing the whole service from starting.

**Why:** An admin removed both ready-cake locations after the initial tree was created; a whole-list import that required the original destination prevented the API from starting, while silently picking a different destination would override an intentional edit.

**How to apply:** Keep an independent completion marker per supplied group so deferred groups can be placed after clarification without reintroducing previously imported items that the admin later deletes. Report pending destinations to the user.

For the owner-supplied Aramco ready-cake names, respect the owner's explicit choice of the cake-supplies mixing branch even though the names sound like finished products.

**Why:** After the administrator removed both ready-cake locations, the owner was asked where the nine names should go and specifically chose the mixing branch. Recreating or moving them to a seemingly more natural ready-cake location would contradict that direction.

**How to apply:** Do not automatically reclassify those nine names or recreate a deleted ready-cake section during future taxonomy work; ask before changing their placement.

Multi-section membership in the proposed tree is distinct from the legacy directory's classification system. Retain a single synchronized primary section for existing consumers until they are deliberately migrated, while allowing additional proposed-tree sections without treating those links as a public-directory rollout.

**Why:** The two classification systems have similar terminology but different identities and review status. Silently using the proposed tree for legacy suppliers would bypass the owner's requirement to review the old associations first.

**How to apply:** When extending item browsing or supplier matching, resolve proposed-tree memberships within that tree only; do not infer new supplier or public-directory associations from the additional sections. A proposed section's removal must never erase the underlying item or its supplier associations.

Old item names without an exact match in the proposed tree belong in an inactive temporary "unclassified items" section until their real destinations are reviewed; duplicate items must not be created. Keep the legacy classification source intact throughout this staging period.

**Why:** The owner explicitly chose a temporary section rather than guessing a destination from the old groups. The old hierarchy mixes headings and items, so inferring new sections from similar-sounding groups risks misclassification and premature public visibility.

**How to apply:** Treat this as a staging import, not approval to expose the new tree or delete old categories. Ensure existing-item supplier links are reviewed and the public directory is deliberately switched before considering legacy cleanup.