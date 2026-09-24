import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useListItemCategories, useListSuppliers } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Star, BadgeCheck, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce"; // We'll create this
import { SupplierFilterControls, SUPPLIER_TYPES } from "@/components/suppliers/SupplierFilterControls";

export default function SuppliersPage() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const [searchTerm, setSearchTerm] = useState(initialParams.get("q") ?? "");
  const initialType = initialParams.get("type") ?? "";
  const [category, setCategory] = useState(initialParams.get("category") ?? "");
  const [city, setCity] = useState(initialParams.get("city") ?? "");
  const [type, setType] = useState(SUPPLIER_TYPES.includes(initialType as typeof SUPPLIER_TYPES[number]) ? initialType : "");
  const [rating, setRating] = useState(initialParams.get("rating") ?? "");
  const initialPackage = initialParams.get("package");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">(initialPackage === "verified" || initialPackage === "featured" ? initialPackage : "");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [, setLocation] = useLocation();

  const { data: itemCategories, isLoading: isLoadingCategories, error: categoriesError } = useListItemCategories();
  const { data: allSuppliers } = useListSuppliers({ sort: "rating" });
  const { data: suppliers, isLoading, error } = useListSuppliers({
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(city ? { city } : {}),
      ...(type ? { type } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(supplierPackage ? { package: supplierPackage } : {}),
      sort,
    });
  const cities = useMemo(
    () => Array.from(new Set((allSuppliers ?? []).map((supplier) => supplier.city))).sort((a, b) => a.localeCompare(b, "ar")),
    [allSuppliers],
  );
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { groupName: string; categories: NonNullable<typeof itemCategories> }>();
    for (const item of itemCategories ?? []) {
      if (item.parentId !== null) continue;
      const group = groups.get(item.groupName) ?? { groupName: item.groupName, categories: [] };
      group.categories.push(item);
      groups.set(item.groupName, group);
    }
    return [...groups.values()];
  }, [itemCategories]);
  const selectedTaxonomyCategory = (itemCategories ?? []).find((item) => item.name === category);
  const selectedSubcategories = selectedTaxonomyCategory
    ? (itemCategories ?? []).filter((item) => item.parentId === selectedTaxonomyCategory.id)
    : [];
  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setType("");
    const params = new URLSearchParams(window.location.search);
    params.delete("type");
    if (nextCategory) params.set("category", nextCategory);
    else params.delete("category");
    const query = params.toString();
    setLocation(query ? `/suppliers?${query}` : "/suppliers");
  };
  const resetFilters = () => {
    setCategory("");
    setType("");
    setCity("");
    setRating("");
    setSupplierPackage("");
    setSearchTerm("");
    setLocation("/suppliers");
  };

  return (
    <MainLayout>
      <div className="bg-secondary/5 border-b py-10">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold mb-4">دليل الموردين</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            اكتشف وتواصل مع الموردين المتخصصين لتوفير احتياجات مخبزك أو مقهاك من مواد خام ومعدات.
          </p>
          <div className="max-w-xl mx-auto relative">
            <input 
              aria-label="البحث عن مورد أو تصنيف"
              data-testid="input-suppliers-search"
              type="text" 
              placeholder="ابحث باسم المورد، المدينة أو التصنيف..." 
              className="w-full h-12 pl-4 pr-12 rounded-lg border bg-background focus:border-primary focus:ring-1 focus:ring-primary outline-none shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="w-5 h-5 absolute right-4 top-3.5 text-muted-foreground" />
          </div>
          <div className="mx-auto mt-4 max-w-5xl">
            <SupplierFilterControls
              city={city}
              onCityChange={setCity}
              type={type}
              onTypeChange={setType}
              rating={rating}
              onRatingChange={setRating}
              supplierPackage={supplierPackage}
              onPackageChange={setSupplierPackage}
              sort={sort}
              onSortChange={setSort}
              cities={cities}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <section className="mb-10" aria-labelledby="supplier-category-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="supplier-category-heading" className="text-xl font-extrabold">تصفح حسب التصنيف</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                اختر من {categoryGroups.reduce((count, group) => count + group.categories.length, 0) || 33} تصنيفاً رئيسياً للعثور على الموردين المناسبين.
              </p>
            </div>
            {category && <button type="button" onClick={() => selectCategory("")} className="text-sm font-bold text-primary hover:underline">مسح التصنيف</button>}
          </div>
          {isLoadingCategories ? (
            <p className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground" role="status">جارٍ تحميل التصنيفات...</p>
          ) : categoriesError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">تعذر تحميل التصنيفات.</p>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                data-testid="button-category-all"
                aria-pressed={!category}
                onClick={() => selectCategory("")}
                className={`rounded-full border px-3 py-2 text-sm font-bold transition-colors ${!category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"}`}
              >
                كل الموردين
              </button>
              {categoryGroups.map((group) => (
                <div key={group.groupName}>
                  <h3 className="mb-2 text-sm font-extrabold text-muted-foreground">{group.groupName}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {group.categories.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`button-category-${item.id}`}
                        aria-pressed={category === item.name}
                        onClick={() => selectCategory(item.name)}
                        className={`inline-flex min-h-11 items-center justify-start gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${category === item.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50 hover:text-primary"}`}
                      >
                        <span aria-hidden="true">{item.icon}</span>
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {selectedTaxonomyCategory && selectedSubcategories.length > 0 && (
                <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-4">
                  <h3 className="mb-1 font-extrabold">الأصناف الفرعية في {selectedTaxonomyCategory.name}</h3>
                  <p className="mb-3 text-sm text-muted-foreground">اختر صنفاً لعرض الموردين المرتبطين به، أو اترك التصنيف الرئيسي محدداً لعرض جميع الأصناف الفرعية.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={category === selectedTaxonomyCategory.name}
                      onClick={() => selectCategory(selectedTaxonomyCategory.name)}
                      className={`rounded-full border px-3 py-2 text-sm font-bold transition-colors ${category === selectedTaxonomyCategory.name ? "border-primary bg-primary text-primary-foreground" : "border-primary/25 bg-card text-primary hover:bg-primary/5"}`}
                    >
                      كل {selectedTaxonomyCategory.name}
                    </button>
                    {selectedSubcategories.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`button-category-child-${item.id}`}
                        aria-pressed={category === item.name}
                        onClick={() => selectCategory(item.name)}
                        className={`rounded-full border px-3 py-2 text-sm font-bold transition-colors ${category === item.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50 hover:text-primary"}`}
                      >
                        <span aria-hidden="true" className="ml-1">{item.icon}</span>{item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {error ? (
          <div className="text-center text-destructive py-10">حدث خطأ في تحميل قائمة الموردين.</div>
        ) : isLoading && !suppliers ? (
          <LoadingSpinner className="min-h-[40vh]" />
        ) : suppliers?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            {category ? (
              <>
                <h3 className="text-lg font-bold mb-2">لا يوجد موردون في هذا التصنيف حالياً.</h3>
                <p className="text-muted-foreground">سجّل نشاطك في الدليل أو تصفح الموردين في بقية التصنيفات.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/register/supplier" className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary/90">سجّل كمورد</Link>
                  <button type="button" onClick={resetFilters} className="rounded-xl border px-5 py-3 text-sm font-extrabold hover:bg-muted">تصفح كل الموردين</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-2">لا يوجد نتائج</h3>
                <p className="text-muted-foreground">لم نتمكن من العثور على موردين يطابقون بحثك.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {suppliers?.map(supplier => (
              <Link key={supplier.id} href={`/supplier/${supplier.id}`} className="flex flex-col bg-card border rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all group">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0 shadow-sm border border-secondary/20">
                      {supplier.name.substring(0,1)}
                    </div>
                    {supplier.isVerified && (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        موثق
                      </span>
                    )}
                    {supplier.isFeatured && (
                      <span className="flex items-center gap-1 text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        مميز
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold group-hover:text-primary transition-colors mb-2">{supplier.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4">{supplier.description}</p>
                  
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-auto">
                    <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                      <MapPin className="w-3.5 h-3.5" />
                      {supplier.city}
                    </div>
                     <div className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-1 rounded-md font-medium">
                      <Star className="w-3.5 h-3.5 fill-amber-500" />
                       {(supplier.googleRating ?? supplier.averageRating).toFixed(1)}
                    </div>
                     {supplier.googleCategory && <div className="flex items-center gap-1 bg-primary/5 text-primary border border-primary/10 px-2 py-1 rounded-md font-medium">{supplier.googleCategory}</div>}
                    <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                      منتجات: {supplier.productCount || 0}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
