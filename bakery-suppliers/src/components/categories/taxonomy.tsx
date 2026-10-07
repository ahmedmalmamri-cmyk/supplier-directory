import { useMemo } from "react";
import { ArrowUpLeft, Search } from "lucide-react";
import { Link } from "wouter";
import { getListGroupsQueryKey, getListItemCategoriesQueryKey, useListGroups, useListItemCategories, type Group, type ItemCategory } from "@workspace/api-client-react";
import { getGroupIcon } from "@/lib/group-icons";

// Kept for the legacy admin category editor; public browsing is driven by /api/groups.
export const ROOT_GROUPS = [
  { name: "المواد الأساسية", slug: "basic-materials" },
  { name: "منتجات الألبان", slug: "dairy" },
  { name: "الأجبان", slug: "cheese" },
  { name: "الشوكولاتة والكاكاو", slug: "chocolate" },
  { name: "المكسرات والبذور", slug: "nuts" },
  { name: "خلطات جاهزة", slug: "cake-mixes" },
  { name: "الخمائر والمحسنات", slug: "yeast" },
  { name: "النكهات والألوان", slug: "flavors" },
  { name: "العجائن والجاهز", slug: "dough" },
  { name: "التغليف والعلب", slug: "packaging" },
  { name: "المعدات والأدوات", slug: "equipment" },
  { name: "حشوات الكيك", slug: "cake-fillings" },
  { name: "مواد أخرى", slug: "others" },
] as const;

export type TaxonomyCategory = ItemCategory;
export const groupParentId = (group: Group): number | null => group.parentId;
export const categorySubGroupId = (category: ItemCategory): number | null => category.subGroupId;
export function groupPath(group: Group, groups: Group[]) {
  const parent = groups.find((candidate) => candidate.id === groupParentId(group));
  return parent ? `/category/${parent.slug}/${group.slug}` : `/category/${group.slug}`;
}
export function useTaxonomy() {
  const categoryQuery = useListItemCategories({ query: { staleTime: 0, queryKey: getListItemCategoriesQueryKey() } });
  const groupQuery = useListGroups({ query: { staleTime: 0, queryKey: getListGroupsQueryKey() } });
  const categories = useMemo(() => (categoryQuery.data ?? []).filter((category) => category.isActive), [categoryQuery.data]);
  const groups = useMemo(
    () => (groupQuery.data ?? []).filter((group) => group.isActive).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ar")),
    [groupQuery.data],
  );
  const refetch = async () => {
    await Promise.all([categoryQuery.refetch(), groupQuery.refetch()]);
  };
  return {
    categories,
    groups,
    roots: groups.filter((group) => groupParentId(group) === null),
    isLoading: categoryQuery.isLoading || groupQuery.isLoading,
    error: categoryQuery.error || groupQuery.error,
    refetch,
  };
}
export function categorySlug(category: TaxonomyCategory) {
  return category.slug;
}
export function categoryPath(category: TaxonomyCategory, categories: TaxonomyCategory[], groups: Group[] = []) {
  const subGroup = groups.find((group) => group.id === categorySubGroupId(category));
  if (subGroup) return `${groupPath(subGroup, groups)}/${categorySlug(category)}`;
  const primaryGroup = groups.find((group) => group.id === category.primaryGroupId);
  if (primaryGroup) return `${groupPath(primaryGroup, groups)}/${categorySlug(category)}`;
  if (category.parentId === null) return `/category/${categorySlug(category)}`;
  const parent = categories.find((item) => item.id === category.parentId);
  return parent ? `/category/${categorySlug(parent)}/${categorySlug(category)}` : "/categories/all";
}
export function categoryBreadcrumb(category: TaxonomyCategory, groups: Group[]) {
  const group = groups.find((item) => item.id === categorySubGroupId(category))
    ?? groups.find((item) => item.id === category.primaryGroupId);
  const root = group && groups.find((item) => item.id === groupParentId(group));
  return [...(root ? [root.name] : []), ...(group ? [group.name] : []), category.name].join(" / ");
}
export function CategorySearch({ value, onChange, categories, groups = [], testId = "input-category-search" }: { value: string; onChange: (value: string) => void; categories: TaxonomyCategory[]; groups?: Group[]; testId?: string }) {
  const term = value.trim().toLocaleLowerCase("ar");
  const matches = term ? categories.filter((c) => !(c.parentId === null && groups.some((group) => group.id === c.id)) && `${c.name} ${c.description ?? ""} ${c.slug} ${categoryBreadcrumb(c, groups)}`.toLocaleLowerCase("ar").includes(term)) : [];
  const almondNames = new Set(["لوز حب", "لوز شرائح", "لوز مطحون"]);
  const hasAlmondMatch = matches.some((category) => almondNames.has(category.name)) || (term && "لوز".includes(term) && categories.some((category) => almondNames.has(category.name)));
  const regularMatches = matches.filter((category) => !almondNames.has(category.name));
  const matchingGroups = term ? groups.filter((group) => `${group.name} ${group.slug}`.toLocaleLowerCase("ar").includes(term)) : [];
  return <div className="relative">
    <label className="relative block">
      <span className="sr-only">ابحث في جميع التصنيفات</span>
      <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input data-testid={testId} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="ابحث في جميع التصنيفات والأنواع..." className="h-13 w-full rounded-2xl border border-border bg-card py-3 pr-12 pl-4 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
    </label>
    {term && <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-warm-lg" role="region" aria-label="نتائج بحث التصنيفات">
      {regularMatches.length || hasAlmondMatch || matchingGroups.length ? <>
        {matchingGroups.map((group) => {
          const Icon = getGroupIcon(group);
           return <Link key={`group-${group.id}`} href={groupPath(group, groups)} data-testid={`link-group-search-${group.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
             <span className="min-w-0 flex-1"><strong className="block truncate text-foreground">{group.name}</strong><span className="text-xs text-muted-foreground">{groupParentId(group) === null ? "مجموعة رئيسية" : `${groups.find((item) => item.id === groupParentId(group))?.name ?? "مجموعة"} / ${group.name}`}</span></span>
            <ArrowUpLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </Link>;
        })}
        {hasAlmondMatch && <Link href="/suppliers?category=لوز" data-testid="link-category-search-almond" className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="min-w-0 flex-1"><strong className="block truncate text-foreground">لوز</strong><span className="block truncate text-xs text-muted-foreground">حب · شرائح · مطحون — حدّد المواصفات لدى الموردين</span></span>
          <ArrowUpLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Link>}
        {regularMatches.map((category) => {
        return <Link key={category.id} href={categoryPath(category, categories, groups)} data-testid={`link-category-search-${category.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
           <span className="min-w-0 flex-1"><strong className="block truncate text-foreground">{category.name}</strong><span className="block truncate text-xs text-muted-foreground">{categoryBreadcrumb(category, groups)}</span></span>
          <ArrowUpLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Link>;
        })}
      </> : <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد تصنيفات مطابقة. جرّب كلمة أخرى.</p>}
    </div>}
  </div>;
}
export function RootCard({ category }: { category: Group; categories?: TaxonomyCategory[] }) {
  const Icon = getGroupIcon(category);
  return <Link href={`/category/${category.slug}`} data-testid={`card-home-category-${category.id}`} className="group flex min-h-40 flex-col items-center justify-center rounded-2xl border border-border bg-card px-3 py-4 text-center text-foreground shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-accent/50 hover:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-48 sm:py-6">
    <Icon className="mb-3 h-12 w-12 text-primary sm:mb-4 sm:h-16 sm:w-16" strokeWidth={1.5} aria-hidden="true" />
    <strong className="text-base font-bold leading-6 sm:text-lg sm:leading-7">{category.name}</strong>
    <span className="mt-2 text-xs text-muted-foreground sm:text-sm">{category.categoryCount.toLocaleString("ar-SA")} أصناف · {category.supplierCount.toLocaleString("ar-SA")} مورد</span>
  </Link>;
}