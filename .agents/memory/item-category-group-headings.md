---
name: Item-category group headings
description: Project rule for importing grouped bakery item-category lists.
---

Treat headings in an imported category list as `group_name` values only. Do not create a category for a heading or infer parent-child links from grouping.

**Why:** The catalog is flat unless a parent relationship is explicitly requested; turning headings into records changes the category count and supplier-facing choices.

**How to apply:** During category imports, assign each listed item its heading as `group_name`, preserve existing `parent_id` and homepage visibility for matching records, and leave new records at the root unless otherwise specified.