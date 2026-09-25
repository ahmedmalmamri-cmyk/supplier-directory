import { useMemo, useState } from "react";
import { ChevronLeft, MapPin, Search, ShieldCheck, Star, Users } from "lucide-react";
import { Link, useRoute } from "wouter";
import { getListSuppliersQueryKey, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useTaxonomy, categoryPath, categorySlug } from "@/components/categories/taxonomy";
import { getItemCategoryIcon } from "@/lib/item-category-icons";
import { SupplierFilterControls } from "@/components/suppliers/SupplierFilterControls";

function Problem({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Search className="mx-auto mb-4 h-10 w-10 text-primary/60" /><h2 className="text-xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">يمكنك العودة إلى المجموعات واختيار صنف آخر.</p><div className="mt-5 flex justify-center gap-3">{onRetry && <button type="button" onClick={onRetry} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary">إعادة المحاولة</button>}<Link href="/categories/all" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">كل المجموعات</Link></div></div>;
}

export default function ItemCategoryPage() {
  const [, leafParams] = useRoute("/category/:slug/:subslug");
  const [, groupParams] = useRoute("/category/:slug");
  const slug = leafParams?.slug ?? groupParams?.slug;
  const subslug = leafParams?.subslug;
  const { categories, roots, isLoading, error, refetch } = useTaxonomy();
  const root = roots.find((item) => categorySlug(item) === slug);
  const children = useMemo(() => categories.filter((item) => item.parentId === root?.id).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ar")), [categories, root?.id]);
  const child = subslug ? children.find((item) => categorySlug(item) === subslug) : undefined;
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [rating, setRating] = useState("");
  const [type, setType] = useState("");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">("");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const { data: allSuppliers } = useListSuppliers({ sort: "rating" }, { query: { enabled: !!child, queryKey: getListSuppliersQueryKey({ sort: "rating" }) } });
  const cities = useMemo(() => [...new Set((allSuppliers ?? []).map((supplier) => supplier.city))].sort((a, b) => a.localeCompare(b, "ar")), [allSuppliers]);
  const supplierFilters = {
    category: child?.name,
    ...(city ? { city } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(type ? { type } : {}),
    ...(supplierPackage ? { package: supplierPackage } : {}),
    sort,
  };
  const suppliersQuery = useListSuppliers(supplierFilters, { query: { enabled: !!child, queryKey: getListSuppliersQueryKey(supplierFilters) } });
  const visibleChildren = children.filter((item) => item.name.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar")));
  const title = child?.name ?? root?.name;
  const Icon = getItemCategoryIcon((child ?? root)?.icon ?? "");
  return <MainLayout>
    {isLoading ? <div className="container mx-auto px-4 py-12" role="status" aria-label="جارٍ تحميل التصنيف"><div className="mb-8 h-8 w-64 animate-pulse rounded-lg bg-muted" /><div className="grid grid-cols-2 gap-4 md:grid-cols-3"><div className="h-48 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div></div>
      : error ? <div className="container mx-auto px-4 py-16"><Problem title="تعذر تحميل التصنيف" onRetry={() => void refetch()} /></div>
      : !root || (subslug && !child) ? <div className="container mx-auto px-4 py-16"><Problem title="هذا التصنيف غير موجود" /></div>
      : <>
        <header className="border-b border-border bg-secondary/10"><div className="container mx-auto px-4 py-10 md:py-14">
          <nav aria-label="مسار التنقل" className="mb-8 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground"><Link href="/" className="hover:text-primary">الرئيسية</Link><ChevronLeft className="h-4 w-4" /><Link href="/categories/all" className="hover:text-primary">التصنيفات</Link><ChevronLeft className="h-4 w-4" />{child ? <><Link href={categoryPath(root, categories)} className="hover:text-primary">{root.name}</Link><ChevronLeft className="h-4 w-4" /><span className="text-foreground">{child.name}</span></> : <span className="text-foreground">{root.name}</span>}</nav>
          <div className="flex items-center gap-5"><span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-sm"><Icon className="h-12 w-12" strokeWidth={1.5} /></span><div><p className="mb-1 text-sm font-bold text-primary">{child ? "الصنف الفرعي" : "المجموعة الرئيسية"}</p><h1 className="text-3xl font-extrabold md:text-5xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{child ? `${child.supplierCount.toLocaleString("ar-SA")} مورد في هذا الصنف` : `${children.length.toLocaleString("ar-SA")} أصناف فرعية · ${root.supplierCount.toLocaleString("ar-SA")} مورد في المجموعة`}</p></div></div>
        </div></header>
        <div className="container mx-auto min-h-[50vh] px-4 py-10 md:py-14">
          {!child ? <section><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold">اختر الصنف الذي تبحث عنه</h2><p className="mt-2 text-sm text-muted-foreground">اختر صنفاً لعرض الموردين المتخصصين فيه.</p></div><label className="relative block w-full sm:w-80"><span className="sr-only">ابحث في أصناف المجموعة</span><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-child-category-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث في الأصناف الفرعية..." className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm outline-none focus:border-primary" /></label></div>
            {visibleChildren.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{visibleChildren.map((item) => { const ChildIcon = getItemCategoryIcon(item.icon); return <Link key={item.id} href={categoryPath(item, categories)} data-testid={`card-child-category-${item.id}`} className="group flex min-h-40 flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:scale-[1.02] hover:shadow-warm"><ChildIcon className="h-10 w-10 text-primary" strokeWidth={1.5} /><div><h3 className="text-lg font-bold group-hover:text-primary">{item.name}</h3><p className="mt-1 text-sm text-muted-foreground">{item.supplierCount.toLocaleString("ar-SA")} مورد</p></div></Link>; })}</div> : <Problem title={children.length ? "لا توجد أصناف تطابق بحثك" : "لا توجد أصناف فرعية حالياً"} />}</section>
            : <section><div className="mb-6"><h2 className="text-2xl font-extrabold">الموردون في {child.name}</h2><p className="mt-2 text-sm text-muted-foreground">{child.supplierCount.toLocaleString("ar-SA")} مورد في هذا الصنف قبل تطبيق الفلاتر</p></div>
              <SupplierFilterControls city={city} onCityChange={setCity} type={type} onTypeChange={setType} rating={rating} onRatingChange={setRating} supplierPackage={supplierPackage} onPackageChange={setSupplierPackage} sort={sort} onSortChange={setSort} cities={cities} />
              {suppliersQuery.isLoading && !suppliersQuery.data ? <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="جارٍ تحميل الموردين">{[1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>
                : suppliersQuery.error ? <div className="mt-6"><Problem title="تعذر تحميل الموردين" onRetry={() => void suppliersQuery.refetch()} /></div>
                : suppliersQuery.data?.length ? <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{suppliersQuery.data.map((supplier) => <Link key={supplier.id} href={`/supplier/${supplier.id}`} data-testid={`card-category-supplier-${supplier.id}`} className="group flex min-h-48 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-warm"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">{supplier.name.slice(0, 1)}</span><div className="min-w-0"><h3 className="truncate text-lg font-bold group-hover:text-primary">{supplier.name}</h3><span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{supplier.city}</span></div></div><p className="mt-4 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{supplier.description}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm"><span className="flex items-center gap-1 font-bold text-primary"><Star className="h-4 w-4 fill-current" />{supplier.averageRating.toFixed(1)}</span>{supplier.isVerified && <span className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-4 w-4" />موثق</span>}</div></Link>)}</div>
                : <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-primary/60" /><h3 className="text-lg font-bold">لا يوجد موردون يطابقون الفلاتر</h3><p className="mt-2 text-sm text-muted-foreground">جرّب مدينة أو تقييماً آخر، أو تصفح بقية الأصناف.</p><button type="button" onClick={() => { setCity(""); setRating(""); setType(""); setSupplierPackage(""); setSort("rating"); }} className="mt-4 rounded-xl border border-primary px-5 py-2 text-sm font-bold text-primary">مسح الفلاتر</button></div>}
            </section>}
        </div>
      </>}
  </MainLayout>;
}