import assert from "node:assert/strict";
import test from "node:test";
import {
  itemCategorySubtreeIds,
  legacyItemCategoryAliasesForNames,
  resolveDirectItemCategoryIdsForSelections,
  resolveItemCategoryIdsForDirectIds,
  resolveItemCategoryIdsForSelections,
} from "./item-category-aliases.ts";

test("legacy supplier labels resolve through category parents without duplicate counts", () => {
  const categories = [
    { id: 1, name: "المواد الأساسية", parentId: null },
    { id: 2, name: "دقيق", parentId: 1 },
    { id: 3, name: "سكر", parentId: 1 },
    { id: 4, name: "عسل ومحليات", parentId: 1 },
    { id: 5, name: "العجائن والجاهز", parentId: null },
    { id: 6, name: "خبز جاهز", parentId: 5 },
    { id: 7, name: "منتجات الألبان", parentId: null },
    { id: 8, name: "زبدة ودهون", parentId: 7 },
    { id: 9, name: "زبدة", parentId: 7 },
  ];
  assert.deepEqual(
    [...resolveItemCategoryIdsForSelections(["دقيق وخبز", "دقيق"], categories)].sort((a, b) => a - b),
    [1, 2, 5, 6],
  );
  assert.deepEqual(
    [...resolveItemCategoryIdsForSelections(["سكر ومحليات"], categories)].sort((a, b) => a - b),
    [1, 3, 4],
  );
  assert.deepEqual(
    [...resolveItemCategoryIdsForSelections(["دهون وزبدة"], categories)].sort((a, b) => a - b),
    [7, 8],
  );
  assert.deepEqual(
    [...legacyItemCategoryAliasesForNames(["دقيق", "خبز جاهز"])],
    ["دقيق وخبز"],
  );

  const supplierAssignments = resolveDirectItemCategoryIdsForSelections(["دقيق وخبز", "دهون وزبدة"], categories);
  const supplierRollups = resolveItemCategoryIdsForDirectIds(supplierAssignments, categories);
  const flourFilterIds = itemCategorySubtreeIds(2, categories);
  const butterFilterIds = itemCategorySubtreeIds(9, categories);
  assert.equal(Number(supplierRollups.has(2)), 1);
  assert.equal(Number([...supplierAssignments].some((id) => flourFilterIds.has(id))), 1);
  assert.equal(Number(supplierRollups.has(9)), 0);
  assert.equal(Number([...supplierAssignments].some((id) => butterFilterIds.has(id))), 0);
});

test("stable alias IDs survive category renames and later supplier synchronization", () => {
  const categories = [
    { id: 1, name: "المواد الأساسية", parentId: null },
    { id: 2, name: "طحين", parentId: 1 },
    { id: 5, name: "العجائن والجاهز", parentId: null },
    { id: 6, name: "خبز جاهز", parentId: 5 },
  ];
  const stableAliasIds = [
    { alias: "دقيق وخبز", itemCategoryId: 2 },
    { alias: "دقيق وخبز", itemCategoryId: 6 },
  ];
  const existingSupplierIds = resolveDirectItemCategoryIdsForSelections(
    ["دقيق وخبز"],
    categories,
    stableAliasIds,
  );
  assert.deepEqual([...existingSupplierIds].sort((a, b) => a - b), [2, 6]);

  for (let resync = 0; resync < 3; resync += 1) {
    const resyncedIds = resolveDirectItemCategoryIdsForSelections(
      ["دقيق وخبز"],
      categories,
      stableAliasIds,
    );
    assert.deepEqual([...resyncedIds].sort((a, b) => a - b), [2, 6]);
  }

  const newlyApprovedSupplierIds = resolveDirectItemCategoryIdsForSelections(
    ["دقيق وخبز"],
    categories,
    stableAliasIds,
  );
  assert.equal(newlyApprovedSupplierIds.has(2), true);
});