import { useMemo } from "react";
import { ArrowUpLeft, Search } from "lucide-react";
import { Link } from "wouter";
import { getListItemCategoriesQueryKey, useListItemCategories, type ItemCategory } from "@workspace/api-client-react";
import { getItemCategoryIcon } from "@/lib/item-category-icons";

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
export function useTaxonomy() {
  const query = useListItemCategories({ query: { staleTime: 5 * 60 * 1000, queryKey: getListItemCategoriesQueryKey() } });
  const categories = useMemo(() => (query.data ?? []).filter((c) => c.isActive), [query.data]);
  const roots = useMemo(() => ROOT_GROUPS.map((entry) => categories.find((c) => c.parentId === null && c.slug === entry.slug)).filter((c): c is TaxonomyCategory => !!c), [categories]);
  return { ...query, categories, roots };
}
export function categorySlug(category: TaxonomyCategory) {
  return category.slug;
}
export function categoryPath(category: TaxonomyCategory, categories: TaxonomyCategory[]) {
  if (category.parentId === null) return `/category/${categorySlug(category)}`;
  const parent = categories.find((item) => item.id === category.parentId);
  return parent ? `/category/${categorySlug(parent)}/${categorySlug(category)}` : "/categories/all";
}
export function CategorySearch({ value, onChange, categories, testId = "input-category-search" }: { value: string; onChange: (value: string) => void; categories: TaxonomyCategory[]; testId?: string }) {
  const term = value.trim().toLocaleLowerCase("ar");
  const matches = term ? categories.filter((c) => `${c.name} ${c.description ?? ""} ${c.slug}`.toLocaleLowerCase("ar").includes(term)) : [];
  return <div className="relative">
    <label className="relative block">
      <span className="sr-only">ابحث في جميع التصنيفات</span>
      <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input data-testid={testId} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="ابحث في جميع التصنيفات والأنواع..." className="h-13 w-full rounded-2xl border border-border bg-card py-3 pr-12 pl-4 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
    </label>
    {term && <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-warm-lg" role="region" aria-label="نتائج بحث التصنيفات">
      {matches.length ? matches.map((category) => {
        const parent = categories.find((c) => c.id === category.parentId);
        const Icon = getItemCategoryIcon(category.icon);
        return <Link key={category.id} href={categoryPath(category, categories)} data-testid={`link-category-search-${category.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1"><strong className="block truncate text-foreground">{category.name}</strong><span className="text-xs text-muted-foreground">{parent ? `${parent.name} / صنف فرعي` : "مجموعة رئيسية"}</span></span>
          <ArrowUpLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </Link>;
      }) : <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد تصنيفات مطابقة. جرّب كلمة أخرى.</p>}
    </div>}
  </div>;
}
export function RootCard({ category, categories }: { category: TaxonomyCategory; categories: TaxonomyCategory[] }) {
  const Icon = getItemCategoryIcon(category.icon);
  const childCount = categories.filter((item) => item.parentId === category.id).length;
  return <Link href={categoryPath(category, categories)} data-testid={`card-home-category-${category.id}`} className="group flex min-h-48 flex-col items-center justify-center rounded-2xl border border-[#E8E8E8] bg-card px-3 py-6 text-center text-[#333] shadow-sm transition-transform duration-200 hover:scale-[1.02] hover:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-border dark:text-foreground">
    <Icon className="mb-4 h-16 w-16 text-[#8B4513] dark:text-primary" strokeWidth={1.5} aria-hidden="true" />
    <strong className="text-lg font-bold leading-7">{category.name}</strong>
    <span className="mt-2 text-sm text-[#888] dark:text-muted-foreground">{childCount.toLocaleString("ar-SA")} أصناف فرعية · {category.supplierCount.toLocaleString("ar-SA")} مورد</span>
  </Link>;
}