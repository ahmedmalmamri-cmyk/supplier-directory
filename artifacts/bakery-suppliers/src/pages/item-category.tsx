import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, MapPin, Search, ShieldCheck, Star, Users } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { getListSuppliersQueryKey, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { categoryBreadcrumb, categoryPath, categorySlug, categorySubGroupId, groupParentId, groupPath, useTaxonomy } from "@/components/categories/taxonomy";
import { getItemCategoryIcon } from "@/lib/item-category-icons";
import { CategoryIconValue } from "@/components/category-special-icons";
import { SupplierFilterControls } from "@/components/suppliers/SupplierFilterControls";

function Problem({ title, onRetry }: { title: string; onRetry?: () => void }) {
  return <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border bg-card p-10 text-center"><Search className="mx-auto mb-4 h-10 w-10 text-primary/60" /><h2 className="text-xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">يمكنك العودة إلى المجموعات واختيار صنف آخر.</p><div className="mt-5 flex justify-center gap-3">{onRetry && <button data-testid="button-retry-category" type="button" onClick={onRetry} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary">إعادة المحاولة</button>}<Link href="/categories/all" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">كل المجموعات</Link></div></div>;
}

export default function ItemCategoryPage() {
  const [, itemParams] = useRoute("/category/:slug/:subslug/:itemslug");
  const [, childParams] = useRoute("/category/:slug/:subslug");
  const [, rootParams] = useRoute("/category/:slug");
  const [, navigate] = useLocation();
  const slug = itemParams?.slug ?? childParams?.slug ?? rootParams?.slug;
  const subslug = itemParams?.subslug ?? childParams?.subslug;
  const itemslug = itemParams?.itemslug;
  const { categories, groups, isLoading, error, refetch } = useTaxonomy();
  const root = groups.find((group) => group.slug === slug && groupParentId(group) === null);
  const subgroups = groups.filter((group) => groupParentId(group) === root?.id);
  const subgroup = subslug ? subgroups.find((group) => group.slug === subslug) : undefined;
  const legacyItem = subslug && !subgroup ? categories.find((category) => categorySlug(category) === subslug) : undefined;
  const item = itemslug
    ? categories.find((category) => categorySlug(category) === itemslug && categorySubGroupId(category) === subgroup?.id)
    : legacyItem && root && (legacyItem.primaryGroupId === root.id || legacyItem.tagGroupIds?.includes(root.id)) ? legacyItem : undefined;
  const rootItems = categories.filter((category) => categorySubGroupId(category) === null && category.parentId !== null && (category.primaryGroupId === root?.id || category.tagGroupIds?.includes(root?.id ?? -1)));
  const subgroupItems = categories.filter((category) => categorySubGroupId(category) === subgroup?.id && !!subgroup);
  const activeItems = subgroup ? subgroupItems : rootItems;
  const cakeItems = categories.filter((category) => subgroups.some((group) => group.id === categorySubGroupId(category)));

  const legacyCakeSlugs: Record<string, string> = { "cake-mixes": "mixes", "cake-fillings": "fillings" };
  const cakeRoot = groups.find((group) => group.slug === "cake-supplies" && groupParentId(group) === null);
  const legacyCakeSubgroup = cakeRoot && groups.find((group) => groupParentId(group) === cakeRoot.id && group.slug === legacyCakeSlugs[slug ?? ""]);
  const directChildGroup = !subslug && groups.find((group) => group.slug === slug && groupParentId(group) !== null);
  const requestedPath = itemslug ? `/category/${slug}/${subslug}/${itemslug}` : subslug ? `/category/${slug}/${subslug}` : `/category/${slug}`;
  const globallyMatchedItem = subslug && (!subgroup || !!itemslug) ? categories.find((category) => categorySlug(category) === (itemslug ?? subslug)) : undefined;
  const canonicalPath = item ? categoryPath(item, categories, groups)
    : legacyCakeSubgroup ? (globallyMatchedItem ? categoryPath(globallyMatchedItem, categories, groups) : groupPath(legacyCakeSubgroup, groups))
    : directChildGroup ? groupPath(directChildGroup, groups)
    : globallyMatchedItem ? categoryPath(globallyMatchedItem, categories, groups) : undefined;
  const redirectPath = canonicalPath && canonicalPath !== requestedPath ? canonicalPath : undefined;
  useEffect(() => { if (redirectPath) void navigate(redirectPath, { replace: true }); }, [navigate, redirectPath]);

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [rating, setRating] = useState("");
  const [type, setType] = useState("");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">("");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const { data: allSuppliers } = useListSuppliers({ sort: "rating" }, { query: { enabled: !!item, queryKey: getListSuppliersQueryKey({ sort: "rating" }) } });
  const cities = useMemo(() => [...new Set((allSuppliers ?? []).map((supplier) => supplier.city))].sort((a, b) => a.localeCompare(b, "ar")), [allSuppliers]);
  const supplierFilters = { category: item?.name, ...(city ? { city } : {}), ...(rating ? { rating: Number(rating) } : {}), ...(type ? { type } : {}), ...(supplierPackage ? { package: supplierPackage } : {}), sort };
  const suppliersQuery = useListSuppliers(supplierFilters, { query: { enabled: !!item && !redirectPath, queryKey: getListSuppliersQueryKey(supplierFilters) } });
  const term = search.trim().toLocaleLowerCase("ar");
  const visibleSubgroups = subgroups.filter((group) => group.name.toLocaleLowerCase("ar").includes(term));
  const visibleItems = (subgroup ? subgroupItems : subgroups.length ? cakeItems.concat(rootItems) : rootItems)
    .filter((category) => `${category.name} ${category.description ?? ""}`.toLocaleLowerCase("ar").includes(term))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ar"));
  const title = item?.name ?? subgroup?.name ?? root?.name;
  const Icon = getItemCategoryIcon((subgroup ?? root)?.icon ?? "");
  useEffect(() => {
    if (!title || redirectPath) return;
    const previousTitle = document.title;
    const pageTitle = `${title} | دليل موردي المخابز والحلويات`;
    const description = item
      ? `تصفح موردي ${item.name} في ${root?.name ?? "دليل موردي المخابز والحلويات"}${subgroup ? `، ${subgroup.name}` : ""}.`
      : subgroup
        ? `تصفح ${subgroup.categoryCount} أصناف من ${subgroup.name} ضمن ${root?.name ?? "الدليل"} واعثر على مورديها.`
        : `تصفح أصناف ${root?.name ?? title} واعثر على الموردين المتخصصين فيها.`;
    const changes: Array<{ element: HTMLMetaElement; previous: string | null; created: boolean }> = [];
    for (const [attribute, value, content] of [
      ["name", "description", description],
      ["property", "og:title", pageTitle],
      ["property", "og:description", description],
    ]) {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);
      const created = !element;
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, value);
        document.head.appendChild(element);
      }
      changes.push({ element, previous: element.getAttribute("content"), created });
      element.setAttribute("content", content);
    }
    document.title = pageTitle;
    return () => {
      document.title = previousTitle;
      for (const { element, previous, created } of changes) {
        if (created) element.remove();
        else if (previous === null) element.removeAttribute("content");
        else element.setAttribute("content", previous);
      }
    };
  }, [title, root?.name, subgroup?.name, subgroup?.categoryCount, item?.name, redirectPath]);

  return <MainLayout>
    {isLoading ? <div className="container mx-auto px-4 py-12" role="status" aria-label="جارٍ تحميل التصنيف"><div className="mb-8 h-8 w-64 animate-pulse rounded-lg bg-muted" /><div className="grid grid-cols-2 gap-4 md:grid-cols-3"><div className="h-48 animate-pulse rounded-2xl bg-muted" /><div className="h-48 animate-pulse rounded-2xl bg-muted" /></div></div>
      : error ? <div className="container mx-auto px-4 py-16"><Problem title="تعذر تحميل التصنيف" onRetry={() => void refetch()} /></div>
      : redirectPath ? <div className="container mx-auto px-4 py-16" role="status">جارٍ فتح المسار الصحيح...</div>
      : !root || (subslug && !subgroup && !item) || (itemslug && !item) ? <div className="container mx-auto px-4 py-16"><Problem title="هذا التصنيف غير موجود" /></div>
      : <>
        <header className="border-b border-border bg-secondary/10"><div className="container mx-auto px-4 py-10 md:py-14">
          <nav aria-label="مسار التنقل" className="mb-8 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Link href="/" className="hover:text-primary">الرئيسية</Link><ChevronLeft className="h-4 w-4" />{root.slug !== "cake-supplies" && <><Link href="/categories/all" className="hover:text-primary">التصنيفات</Link><ChevronLeft className="h-4 w-4" /></>}
            {subgroup || item ? <><Link href={groupPath(root, groups)} className="hover:text-primary">{root.name}</Link><ChevronLeft className="h-4 w-4" /></> : null}
            {subgroup && item ? <><Link href={groupPath(subgroup, groups)} className="hover:text-primary">{subgroup.name}</Link><ChevronLeft className="h-4 w-4" /></> : null}
            <span className="text-foreground" aria-current="page">{title}</span>
          </nav>
           <div className="flex items-center gap-5">{!item && <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-sm">{root.slug === "cake-supplies" && !subgroup ? <span className="text-5xl" aria-hidden="true">🎂</span> : subgroup && /\p{Extended_Pictographic}/u.test(subgroup.icon) ? <span className="text-5xl" aria-hidden="true"><CategoryIconValue icon={subgroup.icon} /></span> : <Icon className="h-12 w-12" strokeWidth={1.5} />}</span>}<div><p className="mb-1 text-sm font-bold text-primary">{item ? "الصنف" : subgroup ? "مجموعة فرعية" : "المجموعة الرئيسية"}</p><h1 className="text-3xl font-extrabold md:text-5xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{item ? `${item.supplierCount.toLocaleString("ar-SA")} مورد في هذا الصنف` : `${(subgroup ? subgroup.categoryCount : root.categoryCount).toLocaleString("ar-SA")} أصناف · ${(subgroup ? subgroup.supplierCount : root.supplierCount).toLocaleString("ar-SA")} مورد`}</p></div></div>
        </div></header>
        <div className="container mx-auto min-h-[50vh] px-4 py-10 md:py-14">
          {!item ? <section>
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-extrabold">{subgroup ? `الأصناف في ${subgroup.name}` : subgroups.length ? "من احتياجك إلى مورّدك" : "اختر الصنف الذي تبحث عنه"}</h2><p className="mt-2 text-sm text-muted-foreground">{subgroups.length && !subgroup ? "اختر مجموعة مستلزمات الكيك أو ابحث مباشرة عن صنف." : "اختر صنفاً لعرض الموردين المتخصصين فيه."}</p></div><label className="relative block w-full sm:w-80"><span className="sr-only">ابحث في أصناف المجموعة</span><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-child-category-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={subgroups.length && !subgroup ? "ابحث في جميع مستلزمات الكيك..." : "ابحث في الأصناف..."} className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm outline-none focus:border-primary" /></label></div>
            {!subgroup && visibleSubgroups.length > 0 && <div className="mb-10"><h3 className="mb-4 text-lg font-extrabold">المجموعات الفرعية</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{visibleSubgroups.map((group) => { const TileIcon = getItemCategoryIcon(group.icon); return <Link key={group.id} href={groupPath(group, groups)} data-testid={`card-subgroup-${group.id}`} className="group flex min-h-44 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-warm">{root.slug === "cake-supplies" ? <span className="text-4xl leading-none" aria-hidden="true"><CategoryIconValue icon={group.icon} /></span> : <TileIcon className="h-9 w-9 text-primary" strokeWidth={1.5} />}<div><h4 className="text-lg font-bold group-hover:text-primary">{group.name}</h4><p className="mt-1 text-sm text-muted-foreground">{group.categoryCount.toLocaleString("ar-SA")} أصناف · {group.supplierCount.toLocaleString("ar-SA")} مورد</p></div></Link>; })}</div></div>}
             {(subgroup || term || !subgroups.length) && <div><h3 className="mb-4 text-lg font-extrabold">{subgroups.length && !subgroup ? "الأصناف المطابقة" : "الأصناف"}</h3>{visibleItems.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{visibleItems.map((category) => <Link key={category.id} href={categoryPath(category, categories, groups)} data-testid={`card-child-category-${category.id}`} className="group flex min-h-28 flex-col justify-center rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:scale-[1.02] hover:shadow-warm"><div><h4 className="text-lg font-bold group-hover:text-primary">{category.name}</h4><p className="mt-1 text-sm text-muted-foreground">{category.supplierCount.toLocaleString("ar-SA")} مورد</p>{subgroups.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{categoryBreadcrumb(category, groups)}</p>}</div></Link>)}</div> : <Problem title={activeItems.length || cakeItems.length ? "لا توجد أصناف تطابق بحثك" : "لا توجد أصناف حالياً"} />}</div>}
          </section> : <section><div className="mb-6"><h2 className="text-2xl font-extrabold">الموردون في {item.name}</h2><p className="mt-2 text-sm text-muted-foreground">{item.supplierCount.toLocaleString("ar-SA")} مورد في هذا الصنف قبل تطبيق الفلاتر</p></div>
            <SupplierFilterControls city={city} onCityChange={setCity} type={type} onTypeChange={setType} rating={rating} onRatingChange={setRating} supplierPackage={supplierPackage} onPackageChange={setSupplierPackage} sort={sort} onSortChange={setSort} cities={cities} />
            {suppliersQuery.isLoading && !suppliersQuery.data ? <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-label="جارٍ تحميل الموردين">{[1, 2, 3].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>
              : suppliersQuery.error ? <div className="mt-6"><Problem title="تعذر تحميل الموردين" onRetry={() => void suppliersQuery.refetch()} /></div>
              : suppliersQuery.data?.length ? <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{suppliersQuery.data.map((supplier) => <Link key={supplier.id} href={`/supplier/${supplier.id}`} data-testid={`card-category-supplier-${supplier.id}`} className="group flex min-h-48 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-warm"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">{supplier.name.slice(0, 1)}</span><div className="min-w-0"><h3 className="truncate text-lg font-bold group-hover:text-primary">{supplier.name}</h3><span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{supplier.city}</span></div></div><p className="mt-4 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">{supplier.description}</p><div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm"><span className="flex items-center gap-1 font-bold text-primary"><Star className="h-4 w-4 fill-current" />{supplier.averageRating.toFixed(1)}</span>{supplier.isVerified && <span className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-4 w-4" />موثق</span>}</div></Link>)}</div>
              : <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-primary/60" /><h3 className="text-lg font-bold">لا يوجد موردون يطابقون الفلاتر</h3><p className="mt-2 text-sm text-muted-foreground">جرّب مدينة أو تقييماً آخر، أو تصفح بقية الأصناف.</p><button data-testid="button-clear-supplier-filters" type="button" onClick={() => { setCity(""); setRating(""); setType(""); setSupplierPackage(""); setSort("rating"); }} className="mt-4 rounded-xl border border-primary px-5 py-2 text-sm font-bold text-primary">مسح الفلاتر</button></div>}
          </section>}
        </div>
      </>}
  </MainLayout>;
}