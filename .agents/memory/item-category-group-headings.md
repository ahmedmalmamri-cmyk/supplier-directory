---
name: Item-category group headings
description: How to distinguish imported list headings from the explicitly requested bakery category hierarchy.
---

Imported list headings alone are not permission to create new root categories or infer parent-child links. Preserve the explicitly requested 13-group hierarchy already in the catalog; add new categories beneath a canonical root only when the intended parent is specified or deliberately mapped.

**Why:** Earlier imports used headings only to label flat rows. The user later explicitly requested a three-level browsing journey with 13 named roots. Applying either rule universally would misclassify categories or break navigation.

**How to apply:** During imports, preserve existing `parent_id` and stable slugs for matching records. Do not invent a 14th root from a heading; resolve a new item's intended canonical parent or ask when the mapping is unclear.