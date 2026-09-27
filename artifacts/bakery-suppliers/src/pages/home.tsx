import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
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
import { useGetHome, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SupplierFilterControls } from "@/components/suppliers/SupplierFilterControls";
import { CategorySearch, RootCard, useTaxonomy } from "@/components/categories/taxonomy";

function Rating({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-gold-ink"><Star className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />{value.toFixed(1)}</span>;
}

export default function Home() {
  const { data: homeData, isLoading, error, refetch: refetchHome } = useGetHome();
  const { categories, groups, roots, isLoading: isLoadingItemCategories, error: itemCategoriesError, refetch: refetchItemCategories } = useTaxonomy();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
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
      <section className="relative isolate overflow-hidden bg-secondary dark:bg-background">
        <img src={`${import.meta.env.BASE_URL}images/bakery-hero.jpg`} alt="خبز طازج وحبوب القمح" loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-70 dark:opacity-100" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,hsl(var(--background)/.48)_0%,hsl(var(--background)/.68)_55%,hsl(var(--background)/.9)_100%)] dark:bg-[linear-gradient(90deg,hsl(var(--background)/.25)_0%,hsl(var(--background)/.5)_55%,hsl(var(--background)/.72)_100%)]" />
        <div className="container mx-auto px-4 py-8 md:py-20">
          <div className="max-w-2xl animate-rise-in text-right text-foreground">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-sm sm:px-4 sm:py-2 sm:text-sm"><Wheat className="h-4 w-4 text-gold-ink" aria-hidden="true" /> دليل موثوق للمنطقة الشرقية</p>
            <h1 className="text-balance text-[1.7rem] font-extrabold leading-[1.35] sm:text-4xl md:text-6xl">ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات</h1>
            <p className="mt-2 text-base font-semibold text-primary sm:text-xl md:text-2xl">في المنطقة الشرقية</p>
            <form onSubmit={handleSearch} className="relative mt-5 max-w-xl" data-testid="form-home-search">
              <label htmlFor="home-search" className="sr-only">ابحث عن مورد أو منتج</label>
              <input id="home-search" data-testid="input-home-search" type="search" placeholder="ابحث باسم المورد أو المنتج..." className="h-14 w-full rounded-2xl border border-border bg-card px-5 pl-16 text-base text-foreground shadow-warm-lg outline-none placeholder:text-muted-foreground md:h-16" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <button data-testid="button-home-search" type="submit" aria-label="بحث" className="absolute left-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-transform hover:-translate-y-0.5 md:h-12 md:w-12"><Search className="h-5 w-5" aria-hidden="true" /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20" aria-labelledby="home-category-heading">
        <div className="container mx-auto max-w-7xl px-4 py-6 md:py-11">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-bold text-primary">ابدأ من احتياجك</p>
               <h2 id="home-category-heading" className="text-2xl font-extrabold md:text-3xl">تصفح حسب المجموعة</h2>
               <p className="mt-1 text-sm text-muted-foreground">ابدأ بإحدى المجموعات الرئيسية، ثم اختر الصنف الفرعي للوصول إلى مورديه.</p>
            </div>
             <span className="hidden text-sm font-bold text-muted-foreground sm:block">{roots.length.toLocaleString("ar-SA")} مجموعة رئيسية</span>
          </div>
          {isLoadingItemCategories ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-label="جارٍ تحميل التصنيفات">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : itemCategoriesError ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-card px-4 py-5 text-center text-sm text-destructive" role="alert"><p>تعذر تحميل التصنيفات.</p><button type="button" data-testid="button-retry-home-categories" onClick={() => void refetchItemCategories()} className="min-h-10 rounded-xl border border-destructive/25 px-4 py-2 font-bold transition-colors hover:bg-destructive/5">إعادة المحاولة</button></div>
          ) : (
            <>
                <div className="mt-6 max-w-xl"><CategorySearch value={categorySearch} onChange={setCategorySearch} categories={categories} groups={groups} /></div>
               {roots.length ? (
                 <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{roots.map((category) => <RootCard key={category.id} category={category} categories={categories} />)}</div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-primary/50" aria-hidden="true" /><p className="font-bold">لا توجد تصنيفات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب كلمة بحث أخرى.</p></div>
              )}
            </>
          )}
          <Link href="/categories/all" data-testid="link-all-categories" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-3 text-sm font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Layers3 className="h-4 w-4" aria-hidden="true" />
             عرض جميع المجموعات
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
      <div className="mt-4 flex flex-wrap gap-2">{supplier.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />موثق</span>}{supplier.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-gold-ink"><BadgeCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />مميز</span>}</div>
      <p className="mt-3 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{supplier.description}</p>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3"><Rating value={supplier.averageRating} /><span className="text-xs font-semibold text-muted-foreground">{supplier.productCount ?? 0} منتج</span></div>
    </Link>
  );
}