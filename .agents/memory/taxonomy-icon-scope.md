---
name: Taxonomy icon scope
description: Product taxonomy icon policy for browsing, registration, and administration.
---

Individual item classifications must be text-only; sections and groups use Lucide SVG icons, not emoji. Do not add emoji or icon pickers back to individual items in public browsing, search, supplier registration, or the admin category editor.

**Why:** The user explicitly asked to remove all icons attached to items, then requested a distinct set of Lucide SVG icons for the main groups instead of emoji. Group icons preserve the distinction between navigating a section and choosing a specific item.

**How to apply:** For any new taxonomy view or editor, treat an item as a named classification under a group rather than a visual tile that needs its own icon. Keep group icon choices in SVG form, including when older records still contain emoji values. Preserve existing category identities, routes, and supplier links.