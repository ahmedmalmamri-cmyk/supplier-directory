import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useListSuppliers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Search, MapPin, Star, BadgeCheck, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce"; // We'll create this
import { SupplierFilterControls, SUPPLIER_TYPES } from "@/components/suppliers/SupplierFilterControls";

export default function SuppliersPage() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const [searchTerm, setSearchTerm] = useState(initialParams.get("q") ?? "");
  const initialType = initialParams.get("type") ?? "";
  const [city, setCity] = useState(initialParams.get("city") ?? "");
  const [type, setType] = useState(SUPPLIER_TYPES.includes(initialType as typeof SUPPLIER_TYPES[number]) ? initialType : "");
  const [rating, setRating] = useState(initialParams.get("rating") ?? "");
  const initialPackage = initialParams.get("package");
  const [supplierPackage, setSupplierPackage] = useState<"" | "verified" | "featured">(initialPackage === "verified" || initialPackage === "featured" ? initialPackage : "");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("rating");
  const debouncedSearch = useDebounce(searchTerm, 500);

  const { data: allSuppliers } = useListSuppliers({ sort: "rating" });
  const { data: suppliers, isLoading, error } = useListSuppliers({
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
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
              type="text" 
              placeholder="ابحث باسم المورد، المدينة..." 
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
        {error ? (
          <div className="text-center text-destructive py-10">حدث خطأ في تحميل قائمة الموردين.</div>
        ) : isLoading && !suppliers ? (
          <LoadingSpinner className="min-h-[40vh]" />
        ) : suppliers?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold mb-2">لا يوجد نتائج</h3>
            <p className="text-muted-foreground">لم نتمكن من العثور على موردين يطابقون بحثك.</p>
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
