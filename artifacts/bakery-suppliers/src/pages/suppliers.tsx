import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useListSuppliers } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Star, BadgeCheck, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce"; // We'll create this
import { SupplierFilterControls, SUPPLIER_TYPES } from "@/components/suppliers/SupplierFilterControls";
import { categoryPath, useTaxonomy } from "@/components/categories/taxonomy";
import { getGroupIcon } from "@/lib/group-icons";
import { trackEvent } from "@/lib/analytics";
import { AlmondVariantFilters, type AlmondFormFilter, type AlmondPreparationFilter, type AlmondSizeFilter } from "@/components/suppliers/AlmondVariantFilters";

const isAlmondCategory = (name: string) => ["لوز", "لوز حب", "لوز شرائح", "لوز مطحون"].includes(name);
const initialVariantForm = (value: string | null): AlmondFormFilter => value === "whole" || value === "slices" || value === "powder" ? value : "";
const initialVariantPreparation = (value: string | null): AlmondPreparationFilter => value === "raw" || value === "roasted" ? value : "";
const initialVariantSize = (value: string | null): AlmondSizeFilter => value === "32" || value === "34" || value === "36" ? value : "";

export default function SuppliersPage() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const [searchTerm, setSearchTerm] = useState(initialParams.get("q") ?? "");
  const initialType = initialParams.get("type") ?? "";
  const initialCategory = initialParams.get("category") ?? "";
  const [category, setCategory] = useState(isAlmondCategory(initialCategory) ? "لوز" : initialCategory);
  const [almondForm, setAlmondForm] = useState<AlmondFormFilter>(() => initialVariantForm(initialParams.get("variantForm")));
  const [almondPreparation, setAlmondPreparation] = useState<AlmondPreparationFilter>(() => initialVariantPreparation(initialParams.get("variantPreparation")));
  const [almondSize, setAlmondSize] = useState<AlmondSizeFilter>(() => initialVariantForm(initialParams.get("variantForm")) === "whole" ? initialVariantSize(initialParams.get("variantSize")) : "");
  const [city, setCity] = useState(initialParams.get("city") ?? "");
  const [type, setType] = useState(SUPPLIER_TYPES.includes(initialType as typeof SUPPLIER_TYPES[number]) ? initialType : "");
  const [rating, setRating] = useState(initialParams.get("rating") ?? "");
  const initialPackage = initialParams.get("package");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">(initialPackage === "verified" || initialPackage === "featured" ? initialPackage : "");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const debouncedSearch = useDebounce(searchTerm, 500);
  const [, setLocation] = useLocation();

  const { categories: itemCategories, groups, roots: categoryRoots, isLoading: isLoadingCategories, error: categoriesError } = useTaxonomy();
  const { data: allSuppliers } = useListSuppliers({ sort: "rating" });
  const supplierFilters = {
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(category ? { category } : {}),
      ...(category === "لوز" && almondForm ? { variantForm: almondForm } : {}),
      ...(category === "لوز" && almondPreparation ? { variantPreparation: almondPreparation } : {}),
      ...(category === "لوز" && almondForm === "whole" && almondSize ? { variantSize: almondSize } : {}),
      ...(city ? { city } : {}),
      ...(type ? { type } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(supplierPackage ? { package: supplierPackage } : {}),
      sort,
    };
  const { data: suppliers, isLoading, error } = useListSuppliers(supplierFilters);
  const lastTrackedFilter = useRef("");
  useEffect(() => {
    const hasActiveFilter = Boolean(debouncedSearch || category || city || type || rating || supplierPackage || almondForm || almondPreparation || almondSize) || sort !== "rating";
    if (!hasActiveFilter || isLoading || error || !suppliers) return;
    const key = JSON.stringify({ debouncedSearch, category, city, type, rating, supplierPackage, hasAlmondForm: Boolean(almondForm), hasAlmondPreparation: Boolean(almondPreparation), hasAlmondSize: Boolean(almondSize), sort });
    if (lastTrackedFilter.current === key) return;
    lastTrackedFilter.current = key;
    trackEvent("supplier_directory_filtered", {
      has_search: Boolean(debouncedSearch),
      has_category: Boolean(category),
      has_city: Boolean(city),
      has_type: Boolean(type),
      has_rating: Boolean(rating),
      has_plan: Boolean(supplierPackage),
      has_almond_variant_filter: Boolean(almondForm || almondPreparation || almondSize),
      sort,
      results_count: suppliers.length,
    });
  }, [almondForm, almondPreparation, almondSize, category, city, debouncedSearch, error, isLoading, rating, sort, supplierPackage, suppliers, type]);
  const cities = useMemo(
    () => Array.from(new Set((allSuppliers ?? []).map((supplier) => supplier.city))).sort((a, b) => a.localeCompare(b, "ar")),
    [allSuppliers],
  );
  const selectedTaxonomyCategory = itemCategories.find((item) => item.name === category);
  const resetFilters = () => {
    setCategory("");
    setType("");
    setCity("");
    setRating("");
    setSupplierPackage("");
    setAlmondForm("");
    setAlmondPreparation("");
    setAlmondSize("");
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
            {category === "لوز" && <AlmondVariantFilters
              form={almondForm}
              onFormChange={(value) => { setAlmondForm(value); if (value !== "whole") setAlmondSize(""); }}
              preparation={almondPreparation}
              onPreparationChange={setAlmondPreparation}
              size={almondSize}
              onSizeChange={setAlmondSize}
            />}
            {category === "لوز" && <p className="mx-auto mt-3 max-w-5xl text-right text-sm leading-6 text-muted-foreground" data-testid="text-almond-directory-scope">البحث العام عن اللوز يشمل الموردين المسجلين حتى إن لم يحددوا تفاصيل الخيارات. الفلاتر الدقيقة لا تعرض إلا الموردين الذين أعلنوا عن تركيبة مطابقة.</p>}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <section className="mb-10" aria-labelledby="supplier-category-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="supplier-category-heading" className="text-xl font-extrabold">تصفح حسب التصنيف</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                 اختر مجموعة ثم صنفاً فرعياً للوصول إلى الموردين المتخصصين. ويمكنك متابعة تصفح جميع الموردين هنا.
              </p>
            </div>
             {category && <button type="button" onClick={resetFilters} className="text-sm font-bold text-primary hover:underline">مسح التصنيف</button>}
          </div>
          {isLoadingCategories ? (
            <p className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground" role="status">جارٍ تحميل التصنيفات...</p>
          ) : categoriesError ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">تعذر تحميل التصنيفات.</p>
          ) : (
             <div>
               {selectedTaxonomyCategory && <p className="mb-4 rounded-xl bg-primary/5 px-4 py-3 text-sm">تتصفح موردي <Link href={categoryPath(selectedTaxonomyCategory, itemCategories, groups)} className="font-bold text-primary underline">{selectedTaxonomyCategory.name}</Link></p>}
               <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{categoryRoots.map((item) => { const Icon = getGroupIcon(item); return <Link key={item.id} href={`/category/${item.slug}`} data-testid={`link-supplier-category-${item.id}`} className="flex min-h-14 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold transition-colors hover:border-primary/50 hover:text-primary"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />{item.name}</Link>; })}</div>
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
                      <span className="flex items-center gap-1 text-xs font-medium text-success bg-success/10 border border-success/25 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        موثق
                      </span>
                    )}
                    {supplier.isFeatured && (
                      <span className="flex items-center gap-1 text-xs font-medium text-gold-ink bg-accent/10 border border-accent/20 px-2.5 py-1 rounded-full">
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
                     <div className="flex items-center gap-1 bg-accent/10 text-foreground border border-accent/25 px-2 py-1 rounded-md font-medium">
                      <Star className="w-3.5 h-3.5 fill-accent text-accent" />
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
