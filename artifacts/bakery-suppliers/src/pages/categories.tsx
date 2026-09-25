import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Search,
} from "lucide-react";
import { Link } from "wouter";
import {
  getListItemCategoriesQueryKey,
  useListItemCategories,
  type ItemCategory,
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getItemCategoryIcon } from "@/lib/item-category-icons";

const CATEGORY_STALE_TIME = 5 * 60 * 1000;
type CategorySort = "all" | "most-used" | "alphabetical";

function sortCategories(categories: ItemCategory[], sort: CategorySort, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  return categories
    .filter((category) => category.isActive)
    .filter((category) => !normalizedQuery || `${category.name} ${category.description ?? ""}`.toLocaleLowerCase("ar").includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === "most-used") {
        return right.supplierCount - left.supplierCount || left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "ar");
      }
      if (sort === "alphabetical") return left.name.localeCompare(right.name, "ar") || left.displayOrder - right.displayOrder;
      return left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "ar");
    });
}

function groupCategories(categories: ItemCategory[]) {
  return categories.reduce<Array<{ name: string; categories: ItemCategory[] }>>((groups, category) => {
    const group = groups.find((item) => item.name === category.groupName);
    if (group) group.categories.push(category);
    else groups.push({ name: category.groupName, categories: [category] });
    return groups;
  }, []);
}

function CategoryFilters({
  search,
  onSearch,
  sort,
  onSort,
  resultCount,
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: CategorySort;
  onSort: (value: CategorySort) => void;
  resultCount: number;
}) {
  const filters: Array<{ value: CategorySort; label: string }> = [
    { value: "all", label: "الكل" },
    { value: "most-used", label: "الأكثر استخداماً" },
    { value: "alphabetical", label: "أبجدياً" },
  ];
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <label className="relative block w-full sm:max-w-md">
        <span className="sr-only">ابحث داخل التصنيفات</span>
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input data-testid="input-all-category-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="ابحث داخل التصنيفات..." className="h-11 w-full rounded-xl border border-border bg-card px-10 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
      </label>
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1" role="group" aria-label="ترتيب التصنيفات">
        {filters.map((filter) => <button key={filter.value} type="button" data-testid={`button-all-category-sort-${filter.value}`} aria-pressed={sort === filter.value} onClick={() => onSort(filter.value)} className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold transition-colors sm:px-4 ${sort === filter.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{filter.label}</button>)}
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{resultCount.toLocaleString("ar-SA")} تصنيف</span>
    </div>
  );
}

function CategoryCard({ category }: { category: ItemCategory }) {
  const CategoryIcon = getItemCategoryIcon(category.icon);
  return (
    <Link href={`/suppliers?category=${encodeURIComponent(category.name)}`} data-testid={`card-all-category-${category.id}`} aria-label={`عرض موردي ${category.name}`} className="group flex min-h-36 items-center gap-4 rounded-2xl border border-border bg-card p-4 text-right shadow-sm transition-all hover:-translate-y-1 hover:border-primary/35 hover:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><CategoryIcon className="h-7 w-7" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-foreground sm:text-lg">{category.name}</span>
        {category.description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{category.description}</span>}
        <span className="mt-2 inline-flex rounded-full bg-secondary/35 px-2.5 py-1 text-xs font-bold text-muted-foreground">{category.supplierCount.toLocaleString("ar-SA")} مورد نشط</span>
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" aria-hidden="true" />
    </Link>
  );
}

export default function CategoriesPage() {
  const { data: categories, isLoading, error, refetch } = useListItemCategories({
    query: { staleTime: CATEGORY_STALE_TIME, queryKey: getListItemCategoriesQueryKey() },
  });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CategorySort>("all");
  const filteredCategories = useMemo(() => sortCategories(categories ?? [], sort, search), [categories, search, sort]);
  const categoryGroups = useMemo(() => groupCategories(filteredCategories), [filteredCategories]);

  return (
    <MainLayout>
      <section className="border-b bg-secondary/10 py-8 md:py-12">
        <div className="container mx-auto px-4">
          <nav aria-label="مسار التنقل" className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Link href="/" data-testid="link-breadcrumb-home" className="transition-colors hover:text-primary">الرئيسية</Link>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="text-foreground">التصنيفات</span>
          </nav>
          <div className="max-w-2xl">
            <p className="mb-2 text-sm font-bold text-primary">دليل المنتجات</p>
            <h1 className="text-3xl font-extrabold md:text-4xl">كل التصنيفات</h1>
            <p className="mt-3 leading-7 text-muted-foreground">اكتشف المواد والمستلزمات التي يوفرها الموردون النشطون للمخابز والحلويات في المنطقة الشرقية.</p>
          </div>
        </div>
      </section>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="جارٍ تحميل التصنيفات">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-card p-10 text-center text-destructive" role="alert"><p className="font-bold">تعذر تحميل التصنيفات</p><p className="mt-2 text-sm">حاول تحديث الصفحة مرة أخرى.</p><button type="button" data-testid="button-retry-all-categories" onClick={() => void refetch()} className="mt-5 min-h-10 rounded-xl border border-destructive/25 px-4 py-2 text-sm font-bold transition-colors hover:bg-destructive/5">إعادة المحاولة</button></div>
        ) : (
          <>
            <CategoryFilters search={search} onSearch={setSearch} sort={sort} onSort={setSort} resultCount={filteredCategories.length} />
            {filteredCategories.length ? (
              <div className="mt-7 space-y-9">
                {categoryGroups.map((group) => (
                  <section key={group.name} aria-labelledby={`category-group-${group.name}`}>
                    <h2 id={`category-group-${group.name}`} className="mb-4 flex items-center gap-3 text-base font-extrabold text-foreground before:h-px before:flex-1 before:bg-border after:h-px after:w-10 after:bg-primary/50">{group.name}</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{group.categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center"><Search className="mx-auto mb-3 h-9 w-9 text-primary/50" aria-hidden="true" /><p className="font-bold">لا توجد تصنيفات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب كلمة بحث مختلفة أو غيّر طريقة الترتيب.</p></div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}