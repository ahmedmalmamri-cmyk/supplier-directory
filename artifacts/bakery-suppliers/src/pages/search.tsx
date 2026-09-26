import { MainLayout } from "@/components/layout/MainLayout";
import { Link } from "wouter";
import { Lightbulb, MapPin, Search as SearchIcon, Star } from "lucide-react";
import { ProtectedWhatsAppButton } from "@/components/whatsapp/protected-whatsapp-button";
import { getSearchDirectoryQueryKey, useSearchDirectory } from "@workspace/api-client-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useMemo } from "react";
import { categoryBreadcrumb, categoryPath, useTaxonomy } from "@/components/categories/taxonomy";
import { getItemCategoryIcon } from "@/lib/item-category-icons";

export default function SearchPage() {
  const q = new URLSearchParams(window.location.search).get("q") || "";
  const initialMessage = /زبدة/.test(q)
    ? "أبحث عن زبدة نيوزيلندية بكميات كبيرة.\nهل تتوفر لديكم؟"
    : `السلام عليكم، أبحث عن ${q}. هل يتوفر لديكم؟`;
  const { data, isLoading, error } = useSearchDirectory(
    { q },
    { query: { enabled: true, queryKey: getSearchDirectoryQueryKey({ q }) } }
  );
  const suppliers = data?.suppliers ?? [];
  const { categories, groups, isLoading: isLoadingTaxonomy, error: taxonomyError, refetch: refetchTaxonomy } = useTaxonomy();
  const matchingCategories = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("ar");
    if (!term) return [];
    return categories.filter((category) => {
      if (category.parentId === null && groups.some((group) => group.id === category.id)) return false;
      const associatedGroups = groups.filter((group) => group.id === category.primaryGroupId || category.tagGroupIds?.includes(group.id));
       return `${category.name} ${category.description ?? ""} ${category.slug} ${categoryBreadcrumb(category, groups)} ${associatedGroups.map((group) => group.name).join(" ")}`.toLocaleLowerCase("ar").includes(term);
    });
  }, [categories, groups, q]);

  return (
    <MainLayout>
      <div className="bg-muted/30 border-b py-8">
        <div className="container mx-auto px-4">
          <form action="/search" method="get" className="max-w-3xl mx-auto relative flex">
            <input 
              type="text" 
              name="q"
              defaultValue={q}
              placeholder="ابحث عن مورد أو صنف..." 
              className="w-full h-14 pl-4 pr-12 rounded-lg border-2 border-primary/20 bg-background focus:border-primary focus:ring-0 outline-none shadow-sm transition-all text-lg"
            />
            <button type="submit" aria-label="بحث" className="absolute right-3 top-2.5 text-muted-foreground hover:text-primary">
              <SearchIcon className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {!q ? (
          <div className="text-center py-20 text-muted-foreground">
            <SearchIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <h2 className="text-xl font-bold text-foreground mb-2">ما الذي تبحث عنه؟</h2>
            <p>اكتب الفئة التي تحتاجها للعثور على الموردين المناسبين.</p>
          </div>
        ) : isLoading ? (
          <LoadingSpinner className="min-h-[40vh]" />
        ) : (
          <div className="space-y-8">
            <section aria-labelledby="search-category-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-sm text-muted-foreground">تصنيفات مطابقة لـ «{q}»</p>
                  <h2 id="search-category-heading" className="mt-1 text-xl font-extrabold md:text-2xl">التصنيفات ({matchingCategories.length.toLocaleString("ar-SA")})</h2>
                </div>
              </div>
              {isLoadingTaxonomy ? <div role="status" aria-label="جارٍ تحميل التصنيفات"><LoadingSpinner className="min-h-24" /></div>
                : taxonomyError ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">تعذر تحميل التصنيفات. <button type="button" onClick={() => void refetchTaxonomy()} className="font-bold underline">إعادة المحاولة</button></div>
                : matchingCategories.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{matchingCategories.map((category) => {
                  const Icon = getItemCategoryIcon(category.icon);
                  return <Link key={category.id} href={categoryPath(category, categories, groups)} data-testid={`card-search-category-${category.id}`} className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <Icon className="h-9 w-9 shrink-0 text-primary" aria-hidden="true" />
                     <span className="min-w-0"><strong className="block truncate">{category.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{categoryBreadcrumb(category, groups)}</span></span>
                  </Link>;
                })}</div> : <p className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">لا توجد تصنيفات مطابقة.</p>}
            </section>
            <section>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-sm text-muted-foreground">نتائج البحث عن: <span className="font-bold text-foreground">«{q}»</span></p>
                  <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">نتائج البحث ({supplierCountLabel(suppliers.length)})</h1>
                </div>
              </div>
              {error ? (
                <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center text-destructive">حدث خطأ في البحث عن الموردين.</div>
              ) : suppliers.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">
                  <p className="font-bold text-foreground">لا يوجد موردون معتمدون يطابقون بحثك حالياً.</p>
                  <p className="mt-2 text-sm">قدّم طلباً للموردين المناسبين أو جرّب كلمة بحث أخرى.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {suppliers.map((supplier) => {
                    const rating = Number(supplier.googleRating || supplier.averageRating || 0);
                    return (
                      <article key={supplier.id} className="rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        <Link href={`/supplier/${supplier.id}`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-extrabold text-primary">
                              {supplier.name.substring(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <h2 className="truncate text-lg font-extrabold hover:text-primary">{supplier.name}</h2>
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0" /> {supplier.city}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-1.5 text-sm font-bold">
                            <Star className="h-4 w-4 fill-accent text-accent" />
                            <span>{rating > 0 ? rating.toFixed(1) : "جديد"}</span>
                            <span className="font-normal text-muted-foreground">{rating > 0 ? "تقييم المورد" : "لا توجد تقييمات بعد"}</span>
                          </div>
                        </Link>
                        <div className="mt-5 flex items-center gap-2">
                          <ProtectedWhatsAppButton
                            supplierId={supplier.id}
                            supplierName={supplier.name}
                            hasWhatsApp={supplier.hasWhatsApp}
                            label="اسأل عبر واتساب"
                            initialMessage={initialMessage}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-whatsapp px-3 py-3 text-sm font-extrabold text-whatsapp-foreground hover:bg-whatsapp/90 disabled:opacity-60"
                          />
                          <Link href={`/supplier/${supplier.id}`} className="rounded-xl border px-4 py-3 text-sm font-bold hover:bg-muted">الملف</Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            {suppliers.length > 0 && (
              <aside className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-7">
                <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <p><span className="font-extrabold">تواصل مع المورد لمعرفة أنواع {q} المتوفرة لديه.</span> الفئة ثابتة؛ أكّد التوفر والأسعار مباشرة عبر واتساب.</p>
              </aside>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function supplierCountLabel(count: number) {
  if (count === 1) return "مورد واحد";
  if (count === 2) return "موردان";
  if (count >= 3 && count <= 10) return `${count} موردين`;
  return `${count} مورد`;
}
