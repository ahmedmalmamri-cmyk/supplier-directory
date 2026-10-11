const deferredServicesRootsSql = "'الخدمات والاستشارات', 'خدمات واستشارات'";

/**
 * Eligibility for one declaration. The public taxonomy is limited to a root
 * and one child level, so checking the node and its optional parent excludes
 * both labels used for the deferred-services root.
 */
export function publicCatalogOfferEligibilitySql(
  offerAlias = "catalogOffer",
  subtypeAlias = "catalogSubtype",
  itemAlias = "catalogItem",
  nodeAlias = "catalogNode",
): string {
  return `${offerAlias}.is_active = 1
    AND ${subtypeAlias}.is_approved = 1
    AND ${subtypeAlias}.status = 'approved'
    AND ${itemAlias}.is_active = 1
    AND ${nodeAlias}.is_active = 1
    AND lower(trim(${nodeAlias}.name)) NOT IN (${deferredServicesRootsSql})
    AND NOT EXISTS (
      SELECT 1 FROM supplier_taxonomy_nodes catalogDeferredRoot
      WHERE catalogDeferredRoot.id = ${nodeAlias}.parent_id
        AND lower(trim(catalogDeferredRoot.name)) IN (${deferredServicesRootsSql})
    )`;
}

/**
 * A supplier is visible in buyer-facing directory results only when at least
 * one public-eligible catalog declaration exists. Offers are declarations,
 * not guaranteed live stock.
 */
export function publicCatalogVisibilitySql(supplierAlias = "s"): string {
  return `EXISTS (
    SELECT 1
    FROM supplier_catalog_offers catalogOffer
    JOIN supplier_catalog_subtypes catalogSubtype
      ON catalogSubtype.id = catalogOffer.subtype_id
    JOIN supplier_taxonomy_items catalogItem
      ON catalogItem.id = catalogSubtype.item_id
    JOIN supplier_taxonomy_nodes catalogNode
      ON catalogNode.id = catalogItem.category_id
    WHERE catalogOffer.supplier_id = ${supplierAlias}.id
      AND ${publicCatalogOfferEligibilitySql()}
  )`;
}