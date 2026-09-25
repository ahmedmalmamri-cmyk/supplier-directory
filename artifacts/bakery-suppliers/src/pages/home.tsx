import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  ChevronLeft,
  Layers3,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Star,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  getListItemCategoriesQueryKey,
  useGetHome,
  useListItemCategories,
  useListSuppliers,
  type ItemCategory,
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SupplierFilterControls } from "@/components/suppliers/SupplierFilterControls";
import { getItemCategoryIcon } from "@/lib/item-category-icons";

const CATEGORY_STALE_TIME = 5 * 60 * 1000;
type CategorySort = "all" | "most-used" | "alphabetical";

function sortCategories(categories: ItemCategory[], sort: CategorySort, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  return [...categories]
    .filter((category) => category.isActive)
    .filter((category) => !normalizedQuery || `${category.name} ${category.description ?? ""}`.toLocaleLowerCase("ar").includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === "most-used") {
        return right.supplierCount - left.supplierCount
          || left.displayOrder - right.displayOrder
          || left.name.localeCompare(right.name, "ar");
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

function CategoryCard({ category }: { category: ItemCategory }) {
  const CategoryIcon = getItemCategoryIcon(category.icon);
  return (
    <Link
      href={`/suppliers?category=${encodeURIComponent(category.name)}`}
      data-testid={`card-home-category-${category.id}`}
      aria-label={`عرض موردي ${category.name}`}
      className="group flex min-h-[9.5rem] flex-col rounded-2xl border border-border/80 bg-card p-4 text-right shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary/45 hover:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <span className="flex items-start justify-end gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <CategoryIcon className="h-7 w-7" aria-hidden="true" />
        </span>
      </span>
      <span className="mt-4 flex min-w-0 flex-1 items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold text-foreground">{category.name}</span>
          <span className="mt-1 block text-xs font-semibold text-muted-foreground">
            {category.supplierCount.toLocaleString("ar-SA")} مورد نشط
          </span>
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" aria-hidden="true" />
      </span>
    </Link>
  );
}

function CategoryFilters({
  search,
  onSearch,
  sort,
  onSort,
  resultCount,
  label = "ابحث داخل التصنيفات",
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: CategorySort;
  onSort: (value: CategorySort) => void;
  resultCount: number;
  label?: string;
}) {
  const filters: Array<{ value: CategorySort; label: string }> = [
    { value: "all", label: "الكل" },
    { value: "most-used", label: "الأكثر استخداماً" },
    { value: "alphabetical", label: "أبجدياً" },
  ];
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full sm:max-w-sm">
        <span className="sr-only">{label}</span>
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          data-testid="input-category-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={label}
          className="h-11 w-full rounded-xl border border-border bg-card px-10 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" role="group" aria-label="ترتيب التصنيفات">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            data-testid={`button-category-sort-${filter.value}`}
            aria-pressed={sort === filter.value}
            onClick={() => onSort(filter.value)}
            className={`min-h-9 rounded-lg px-3 text-xs font-bold transition-colors sm:px-4 ${sort === filter.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <span className="text-xs font-semibold text-muted-foreground sm:hidden">{resultCount.toLocaleString("ar-SA")} تصنيف</span>
    </div>
  );
}

function Rating({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-accent"><Star className="h-4 w-4 fill-current" aria-hidden="true" />{value.toFixed(1)}</span>;
}

export default function Home() {
  const { data: homeData, isLoading, error, refetch: refetchHome } = useGetHome();
  const { data: itemCategories, isLoading: isLoadingItemCategories, error: itemCategoriesError, refetch: refetchItemCategories } = useListItemCategories({
    query: { staleTime: CATEGORY_STALE_TIME, queryKey: getListItemCategoriesQueryKey() },
  });
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categorySort, setCategorySort] = useState<CategorySort>("all");
  const [city, setCity] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [rating, setRating] = useState("");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">("");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const { data: allSuppliers } = useListSuppliers({ sort: "rating" });
  const supplierQuery = useListSuppliers({
    ...(city ? { city } : {}),
    ...(supplierType ? { type: supplierType } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(supplierPackage ? { package: supplierPackage } : {}),
    sort,
  });
  const cities = useMemo(
    () => Array.from(new Set((allSuppliers ?? []).map((supplier) => supplier.city))).sort((a, b) => a.localeCompare(b, "ar")),
    [allSuppliers],
  );
  const homeCategories = useMemo(
    () => sortCategories((itemCategories ?? []).filter((category) => category.displayOnHome && category.parentId === null), categorySort, categorySearch),
    [itemCategories, categorySearch, categorySort],
  );
  const homeCategoryGroups = useMemo(() => groupCategories(homeCategories), [homeCategories]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    if (searchQuery.trim()) setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  const statItems: Array<{ label: string; value: number | string; Icon: LucideIcon }> = [
    { label: "الموردون", value: homeData?.stats.suppliers ?? 0, Icon: Building2 },
    { label: "المدن", value: homeData?.stats.cities ?? 0, Icon: MapPin },
    { label: "المنتجات", value: homeData?.stats.products ?? 0, Icon: Package },
    { label: "التقييمات", value: homeData?.stats.reviews ?? 0, Icon: Star },
  ];

  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !homeData) {
    return <MainLayout><div className="mx-auto min-h-[50vh] max-w-xl p-12 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><ShieldCheck className="h-7 w-7" aria-hidden="true" /></div><h2 className="text-xl font-bold">تعذر تحميل الدليل</h2><p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة مرة أخرى.</p><button type="button" data-testid="button-retry-home" onClick={() => void refetchHome()} className="mt-5 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">إعادة المحاولة</button></div></MainLayout>;
  }

  return (
    <MainLayout>
      <section className="relative isolate overflow-hidden bg-[#f0e4d2] dark:bg-[#241812]">
        <img src={`${import.meta.env.BASE_URL}images/bakery-hero.jpg`} alt="خبز طازج وحبوب القمح" loading="lazy" fetchPriority="high" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-70 dark:opacity-45" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(250,246,239,.48)_0%,rgba(250,246,239,.68)_55%,rgba(250,246,239,.88)_100%)] dark:bg-[linear-gradient(90deg,rgba(20,15,12,.55)_0%,rgba(20,15,12,.72)_55%,rgba(20,15,12,.88)_100%)]" />
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-2xl animate-rise-in text-right text-foreground dark:text-[#fffaf1]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2 text-sm font-semibold text-primary shadow-sm dark:border-[#e1b96a]/40 dark:text-[#f2cf8a]"><Wheat className="h-4 w-4" aria-hidden="true" /> دليل موثوق للمنطقة الشرقية</p>
            <h1 className="text-balance text-3xl font-extrabold leading-[1.25] sm:text-4xl md:text-6xl">ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات</h1>
            <p className="mt-3 text-xl font-semibold text-primary dark:text-[#f2cf8a] md:text-2xl">في المنطقة الشرقية</p>
            <form onSubmit={handleSearch} className="relative mt-6 max-w-xl" data-testid="form-home-search">
              <label htmlFor="home-search" className="sr-only">ابحث عن مورد أو منتج</label>
              <input id="home-search" data-testid="input-home-search" type="search" placeholder="ابحث باسم المورد أو المنتج..." className="h-14 w-full rounded-2xl border border-border bg-card px-5 pl-16 text-base text-foreground shadow-warm-lg outline-none placeholder:text-muted-foreground md:h-16" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <button data-testid="button-home-search" type="submit" aria-label="بحث" className="absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 md:h-12 md:w-12"><Search className="h-5 w-5" aria-hidden="true" /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20" aria-labelledby="home-category-heading">
        <div className="container mx-auto max-w-7xl px-4 py-8 md:py-11">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-bold text-primary">ابدأ من احتياجك</p>
              <h2 id="home-category-heading" className="text-2xl font-extrabold md:text-3xl">تصفح حسب نوع المورد</h2>
              <p className="mt-1 text-sm text-muted-foreground">تصنيفات عملية للوصول إلى الموردين النشطين بسرعة.</p>
            </div>
            <span className="hidden text-sm font-bold text-muted-foreground sm:block">{homeCategories.length.toLocaleString("ar-SA")} تصنيف مختار</span>
          </div>
          {isLoadingItemCategories ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-label="جارٍ تحميل التصنيفات">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : itemCategoriesError ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-card px-4 py-5 text-center text-sm text-destructive" role="alert"><p>تعذر تحميل التصنيفات.</p><button type="button" data-testid="button-retry-home-categories" onClick={() => void refetchItemCategories()} className="min-h-10 rounded-xl border border-destructive/25 px-4 py-2 font-bold transition-colors hover:bg-destructive/5">إعادة المحاولة</button></div>
          ) : (
            <>
              <CategoryFilters search={categorySearch} onSearch={setCategorySearch} sort={categorySort} onSort={setCategorySort} resultCount={homeCategories.length} />
              {homeCategories.length ? (
                <div className="mt-5 space-y-7">
                  {homeCategoryGroups.map((group) => (
                    <div key={group.name}>
                      <h3 className="mb-3 flex items-center gap-3 text-sm font-extrabold text-foreground before:h-px before:flex-1 before:bg-border after:h-px after:w-8 after:bg-primary/50">{group.name}</h3>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{group.categories.map((category) => <CategoryCard key={category.id} category={category} />)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-primary/50" aria-hidden="true" /><p className="font-bold">لا توجد تصنيفات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب كلمة بحث أخرى.</p></div>
              )}
            </>
          )}
          <Link href="/categories/all" data-testid="link-all-categories" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-3 text-sm font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
            عرض جميع التصنيفات (161)
          </Link>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-extrabold">هل أنت مورد؟</p><p className="text-xs text-muted-foreground">أضف نشاطك ليصل إليه أصحاب المخابز والحلويات.</p></div>
            <Link href="/register/supplier" data-testid="link-register-supplier" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"><Building2 className="h-4 w-4" aria-hidden="true" />سجّل نشاطك في الدليل</Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-7 px-4">
        <div className="container mx-auto grid max-w-5xl grid-cols-2 overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-warm backdrop-blur-sm md:grid-cols-4">
          {statItems.map(({ label, value, Icon }, index) => <div key={label} data-testid={`stat-${label}`} className={`flex items-center gap-3 px-5 py-5 md:px-7 ${index < 3 ? "border-l border-border" : ""}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><div><div className="text-2xl font-extrabold text-foreground">{value}{typeof value === "number" ? "+" : ""}</div><div className="text-xs font-semibold text-muted-foreground">{label}</div></div></div>)}
        </div>
      </section>

      <section id="suppliers" className="container mx-auto px-4 pb-20 pt-12 md:pt-16">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-primary">اعثر على احتياجك</p><h2 className="text-2xl font-extrabold md:text-3xl">تصفح الموردين</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">استخدم الفلاتر للعثور على المورد المناسب حسب المدينة والنشاط والتقييم والباقة.</p></div>
          <Link href="/suppliers" data-testid="link-all-suppliers" className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-bold text-primary hover:gap-2 sm:self-auto">عرض جميع الموردين <ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <SupplierFilterControls city={city} onCityChange={setCity} type={supplierType} onTypeChange={setSupplierType} rating={rating} onRatingChange={setRating} supplierPackage={supplierPackage} onPackageChange={setSupplierPackage} sort={sort} onSortChange={setSort} cities={cities} />
        {supplierQuery.error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-destructive" role="alert"><p>تعذر تحميل الموردين.</p><button type="button" data-testid="button-retry-suppliers" onClick={() => void supplierQuery.refetch()} className="min-h-10 rounded-xl border border-destructive/25 px-4 py-2 font-bold transition-colors hover:bg-destructive/5">إعادة المحاولة</button></div>
        ) : supplierQuery.isLoading && !supplierQuery.data ? (
          <LoadingSpinner className="min-h-[25vh]" />
        ) : supplierQuery.data?.length ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{supplierQuery.data.map((supplier) => <BrowseSupplierCard key={supplier.id} supplier={supplier} />)}</div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"><Users className="mx-auto mb-3 h-9 w-9 text-primary/50" aria-hidden="true" /><p className="font-bold">لا يوجد موردون يطابقون هذه الفلاتر</p><p className="mt-1 text-sm text-muted-foreground">جرّب تغيير المدينة أو نوع النشاط أو التقييم.</p></div>
        )}
      </section>
    </MainLayout>
  );
}

function BrowseSupplierCard({ supplier }: { supplier: { id: number; name: string; city: string; description: string; averageRating: number; isVerified: boolean; isFeatured: boolean; productCount?: number } }) {
  return (
    <Link href={`/supplier/${supplier.id}`} data-testid={`card-supplier-${supplier.id}`} className="group flex min-h-56 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-extrabold text-primary">{supplier.name.slice(0, 1)}</span><div className="min-w-0 flex-1"><h3 className="truncate text-lg font-extrabold group-hover:text-primary">{supplier.name}</h3><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{supplier.city}</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2">{supplier.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />موثق</span>}{supplier.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />مميز</span>}</div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{supplier.description}</p>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3"><Rating value={supplier.averageRating} /><span className="text-xs font-semibold text-muted-foreground">{supplier.productCount ?? 0} منتج</span></div>
    </Link>
  );
}