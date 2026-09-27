---
name: Unassigned item visibility
description: How to treat imported directory items awaiting a group assignment.
---

Keep unassigned item classifications in the admin inventory, with an active/inactive status and a creation timestamp, but do not expose them in public browse, search, or supplier selection until an administrator assigns an active root group. A group may be chosen without a subdivision.

**Why:** The user asked to import the supplied names now while allowing their groups to remain empty for later distribution. Showing unassigned items publicly would produce routes without a valid taxonomy path.

**How to apply:** New import and admin workflows should distinguish database presence from public visibility. Moving an item to a group makes it eligible for active public lists; deactivation still hides it, and permanent deletion must retain dependency checks.