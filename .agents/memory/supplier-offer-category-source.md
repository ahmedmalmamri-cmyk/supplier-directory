---
name: Supplier offer category source
description: Choose a reliable source for supplier categories in buyer-facing offer messages.
---

For buyer-facing supplier offers, describe the supplier using its linked item categories (`supplier_categories` mapped to `item_categories`), not `suppliers.google_category`. The Google-derived category can be blank or a broad, inaccurate business label such as a supermarket classification. If no linked item categories exist, show an explicit unavailable value rather than substituting the Google category.

**Why:** The local supplier records had missing Google categories and a generic “supermarket” value, while all had linked bakery-product categories. The external classification does not reliably describe what the supplier offers.

**How to apply:** Use normalized supplier-item-category associations when generating offers or other buyer-facing descriptions of supplier products. Keep third-party listing classifications separate from the supplier’s actual catalog categories.