import { ArrowLeft, BadgeCheck, Building2, ChevronLeft, MapPin, Package, Plus, Search, ShieldCheck, Star, Users, Wheat, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useGetHome, useListItemCategories, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SupplierFilterControls } from "@/components/suppliers/SupplierFilterControls";
import { useMemo, useState } from "react";

const HOME_CATEGORY_PRESENTATION: Record<string, { label?: string; icon?: string; filterCategory?: string }> = {
  "نكهات وألوان": { icon: "🍯" },
  "علب وتغليف": { label: "تغليف وعلب", filterCategory: "تغليف وعلب" },
  "معدات وأفران": { label: "معدات وأدوات", filterCategory: "معدات وأدوات" },
};

function Rating({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-accent"><Star className="h-4 w-4 fill-current" />{value.toFixed(1)}</span>;
}

export default function Home() {
  const { data: homeData, isLoading, error } = useGetHome();
  const { data: itemCategories, isLoading: isLoadingItemCategories, error: itemCategoriesError } = useListItemCategories();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
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
  const homeCategories = useMemo(() => {
    return (itemCategories ?? [])
      .filter((category) => category.isActive && category.displayOnHome && category.parentId === null)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.id - right.id)
      .map((category) => {
        const presentation = HOME_CATEGORY_PRESENTATION[category.name] ?? {};
        return {
          ...category,
          label: presentation.label ?? category.name,
          icon: presentation.icon ?? category.icon,
          filterCategory: presentation.filterCategory ?? category.name,
        };
      });
  }, [itemCategories]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const statItems: Array<{ label: string; value: number | string; Icon: LucideIcon }> = [
    { label: "الموردون", value: homeData?.stats.suppliers ?? 0, Icon: Building2 },
    { label: "المدن", value: homeData?.stats.cities ?? 0, Icon: MapPin },
    { label: "المنتجات", value: homeData?.stats.products ?? 0, Icon: Package },
    { label: "التقييمات", value: homeData?.stats.reviews ?? 0, Icon: Star },
  ];
  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !homeData) return <MainLayout><div className="mx-auto min-h-[50vh] max-w-xl p-12 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><ShieldCheck className="h-7 w-7" /></div><h2 className="text-xl font-bold">تعذر تحميل الدليل</h2><p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة مرة أخرى.</p></div></MainLayout>;

  return (
    <MainLayout>
      <section className="relative isolate overflow-hidden bg-[#f0e4d2] dark:bg-[#241812]">
        <img src="/bakery-hero.jpg" alt="مواد أولية ومنتجات مخبوزة" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-35 dark:opacity-25" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(250,246,239,.96)_0%,rgba(250,246,239,.91)_55%,rgba(250,246,239,.84)_100%)] dark:bg-[linear-gradient(90deg,rgba(20,15,12,.97)_0%,rgba(20,15,12,.94)_55%,rgba(20,15,12,.88)_100%)]" />
        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-2xl animate-rise-in text-right text-foreground dark:text-[#fffaf1]">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-2 text-sm font-semibold text-primary shadow-sm dark:border-[#e1b96a]/40 dark:text-[#f2cf8a]"><Wheat className="h-4 w-4" /> دليل موثوق للمنطقة الشرقية</p>
            <h1 className="text-balance text-3xl font-extrabold leading-[1.25] sm:text-4xl md:text-6xl">ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات</h1>
            <p className="mt-3 text-xl font-semibold text-primary dark:text-[#f2cf8a] md:text-2xl">في المنطقة الشرقية</p>
            <form onSubmit={handleSearch} className="relative mt-6 max-w-xl" data-testid="form-home-search">
              <input data-testid="input-home-search" type="search" placeholder="ابحث باسم المورد أو المنتج..." className="h-14 w-full rounded-2xl border border-border bg-card px-5 pl-16 text-base text-foreground shadow-warm-lg outline-none placeholder:text-muted-foreground md:h-16" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button data-testid="button-home-search" type="submit" aria-label="بحث" className="absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 md:h-12 md:w-12"><Search className="h-5 w-5" /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20" aria-labelledby="home-category-heading">
        <div className="container mx-auto max-w-7xl px-4 py-7 md:py-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-bold text-primary">اختصارات شائعة</p>
              <h2 id="home-category-heading" className="text-xl font-extrabold md:text-2xl">تصفح حسب نوع المورد</h2>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">اختر صنفاً للوصول مباشرةً إلى الموردين المتخصصين.</p>
            </div>
            <Link href="/suppliers" className="hidden shrink-0 items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-primary/80 sm:inline-flex">
              كل التصنيفات <ChevronLeft className="h-4 w-4" />
            </Link>
          </div>
          {isLoadingItemCategories ? (
            <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">جارٍ تحميل التصنيفات...</p>
          ) : itemCategoriesError ? (
            <p className="rounded-xl border border-destructive/20 bg-card px-4 py-3 text-sm text-destructive" role="alert">تعذر تحميل التصنيفات.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {homeCategories.map((category) => (
                <Link
                  key={category.id}
                  href={`/suppliers?category=${encodeURIComponent(category.filterCategory)}`}
                  data-testid={`link-home-category-${category.id}`}
                  className="group flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-right text-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl transition-colors group-hover:bg-primary/15">{category.icon}</span>
                  <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-5 md:text-sm">{category.label}</span>
                  <ChevronLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/suppliers"
            data-testid="link-all-categories"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-2.5 text-sm font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            عرض جميع التصنيفات ({itemCategories?.length ?? 43})
          </Link>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-extrabold">هل أنت مورد؟</p>
              <p className="text-xs text-muted-foreground">أضف نشاطك ليصل إليه أصحاب المخابز والحلويات.</p>
            </div>
            <Link href="/register/supplier" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
              <Building2 className="h-4 w-4" />
              سجّل نشاطك في الدليل
            </Link>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-7 px-4">
         <div className="container mx-auto grid max-w-5xl grid-cols-2 overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-warm backdrop-blur-sm md:grid-cols-4">
          {statItems.map(({ label, value, Icon }, index) => <div key={label} data-testid={`stat-${label}`} className={`flex items-center gap-3 px-5 py-5 md:px-7 ${index < 3 ? "border-l border-border" : ""}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-primary"><Icon className="h-5 w-5" /></span><div><div className="text-2xl font-extrabold text-foreground">{value}{typeof value === "number" ? "+" : ""}</div><div className="text-xs font-semibold text-muted-foreground">{label}</div></div></div>)}
        </div>
      </section>

       <section id="suppliers" className="container mx-auto px-4 pb-20 pt-12 md:pt-16">
         <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
           <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-primary">اعثر على احتياجك</p><h2 className="text-2xl font-extrabold md:text-3xl">تصفح الموردين</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">استخدم الفلاتر للعثور على المورد المناسب حسب المدينة والنشاط والتقييم والباقة.</p></div>
           <Link href="/suppliers" data-testid="link-all-suppliers" className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-bold text-primary hover:gap-2 sm:self-auto">عرض جميع الموردين <ArrowLeft className="h-4 w-4" /></Link>
         </div>
         <SupplierFilterControls
           city={city}
           onCityChange={setCity}
           type={supplierType}
           onTypeChange={setSupplierType}
           rating={rating}
           onRatingChange={setRating}
           supplierPackage={supplierPackage}
           onPackageChange={setSupplierPackage}
           sort={sort}
           onSortChange={setSort}
           cities={cities}
         />
         {supplierQuery.error ? (
           <div className="py-12 text-center text-sm text-destructive">تعذر تحميل الموردين. حاول تحديث الصفحة.</div>
         ) : supplierQuery.isLoading && !supplierQuery.data ? (
           <LoadingSpinner className="min-h-[25vh]" />
         ) : supplierQuery.data?.length ? (
           <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
             {supplierQuery.data.map((supplier) => <BrowseSupplierCard key={supplier.id} supplier={supplier} />)}
           </div>
         ) : (
           <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center"><Users className="mx-auto mb-3 h-9 w-9 text-primary/50" /><p className="font-bold">لا يوجد موردون يطابقون هذه الفلاتر</p><p className="mt-1 text-sm text-muted-foreground">جرّب تغيير المدينة أو نوع النشاط أو التقييم.</p></div>
         )}
       </section>

    </MainLayout>
  );
}

function BrowseSupplierCard({ supplier }: { supplier: { id: number; name: string; city: string; description: string; averageRating: number; isVerified: boolean; isFeatured: boolean; productCount?: number } }) {
  return (
    <Link href={`/supplier/${supplier.id}`} data-testid={`card-supplier-${supplier.id}`} className="group flex min-h-56 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-warm">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-extrabold text-primary">{supplier.name.slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold group-hover:text-primary">{supplier.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{supplier.city}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {supplier.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" />موثق</span>}
        {supplier.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent"><BadgeCheck className="h-3.5 w-3.5" />مميز</span>}
      </div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{supplier.description}</p>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <Rating value={supplier.averageRating} />
        <span className="text-xs font-semibold text-muted-foreground">{supplier.productCount ?? 0} منتج</span>
      </div>
    </Link>
  );
}
