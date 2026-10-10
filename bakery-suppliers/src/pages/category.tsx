import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { Link, useRoute } from "wouter";
import { Package, MapPin, Search, Wheat, Candy, Milk, Cookie, Nut, FlaskConical, Sparkles } from "lucide-react";
import { useState } from "react";

export default function CategoryPage() {
  const [, params] = useRoute("/category/:id");
  const categoryId = params?.id ? parseInt(params.id) : null;
  const [city, setCity] = useState("");
  const [rating, setRating] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [sort, setSort] = useState<"newest" | "rating" | "alphabetical">("newest");
  const filters = {
    ...(city ? { city } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(minOrder ? { minOrder: Number(minOrder) } : {}),
    sort,
  };
  
const data = null;
const isLoading = false;
const error = null;

  if (!categoryId) return <MainLayout><div className="text-center p-12 text-destructive">معرف القسم غير صحيح</div></MainLayout>;
  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !data) return <MainLayout><div className="text-center p-12 text-destructive">حدث خطأ في تحميل بيانات القسم.</div></MainLayout>;
  const categoryIcons = [Wheat, Candy, Milk, Cookie, Nut, FlaskConical, Sparkles, Package];
  const CategoryIcon = categoryIcons[data.category.id - 1] ?? Package;

  return (
    <MainLayout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-3xl shadow-sm">
              <CategoryIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{data.category.name}</h1>
              <p className="text-muted-foreground mt-2">تصفح المنتجات والموردين في قسم {data.category.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {data.products.length === 0 && data.suppliers.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-bold mb-2">لا توجد بيانات حالياً</h3>
            <p className="text-muted-foreground">لم يتم العثور على منتجات أو موردين في هذا القسم.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-card border rounded-xl p-5 sticky top-24">
                <h3 className="font-bold text-lg mb-4 pb-2 border-b">تصفية النتائج</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="category-city">المدينة</label>
                    <select id="category-city" value={city} onChange={(event) => setCity(event.target.value)} className="w-full h-10 px-3 rounded-lg border bg-background text-sm">
                      <option value="">كل المدن</option>
                      {data.cities.map((item) => <option value={item} key={item}>{item}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="category-rating">الحد الأدنى للتقييم</label>
                    <select id="category-rating" value={rating} onChange={(event) => setRating(event.target.value)} className="w-full h-10 px-3 rounded-lg border bg-background text-sm">
                      <option value="">كل التقييمات</option>
                      <option value="4">4 نجوم فأعلى</option>
                      <option value="3">3 نجوم فأعلى</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="category-order">أقصى حد أدنى للطلب</label>
                    <input id="category-order" type="number" min="1" value={minOrder} onChange={(event) => setMinOrder(event.target.value)} placeholder="مثال: 10" className="w-full h-10 px-3 rounded-lg border bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block" htmlFor="category-sort">ترتيب النتائج</label>
                    <select id="category-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="w-full h-10 px-3 rounded-lg border bg-background text-sm">
                      <option value="newest">الأحدث</option>
                      <option value="rating">الأعلى تقييماً</option>
                      <option value="alphabetical">أبجدياً</option>
                    </select>
                  </div>
                  {(city || rating || minOrder || sort !== "newest") && (
                    <button type="button" onClick={() => { setCity(""); setRating(""); setMinOrder(""); setSort("newest"); }} className="w-full h-10 rounded-lg bg-muted text-sm font-semibold hover:bg-muted/70">
                      مسح الفلاتر
                    </button>
                  )}
                  </div>
                </div>
              </div>

            <div className="lg:col-span-3 space-y-12">
              {/* Products Section */}
              {data.products.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold mb-6 flex items-center justify-between">
                    <span>منتجات ({data.products.length})</span>
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {data.products.map(product => (
                      <Link key={product.id} href={`/product/${product.id}`} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
                        <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden relative">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/5 text-secondary">
                              <Package className="w-10 h-10 opacity-50" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col">
                          <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2 mb-2">{product.name}</h3>
                          <div className="mt-auto pt-2 text-xs text-muted-foreground truncate border-t border-border/50">
                            من: {product.supplierName}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Suppliers Section */}
              {data.suppliers.length > 0 && (
                <section>
                  <h2 className="text-xl font-bold mb-6 border-t pt-8">موردون في هذا القسم ({data.suppliers.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.suppliers.map(supplier => (
                      <Link key={supplier.id} href={`/supplier/${supplier.id}`} className="flex items-center gap-4 bg-card border rounded-xl p-4 hover:shadow-md transition-all group">
                        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
                          {supplier.name.substring(0,1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold group-hover:text-primary transition-colors flex items-center gap-2 truncate">
                            {supplier.name}
                            {supplier.isVerified && <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full shrink-0">موثق ✓</span>}
                          </h3>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {supplier.city}</span>
                            <span className="text-gold-ink">★ {supplier.averageRating.toFixed(1)}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
