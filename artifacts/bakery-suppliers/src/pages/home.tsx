import { Search, Package, Wheat, Candy, Milk, Cookie, Nut, FlaskConical, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useGetHome } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useState } from "react";

export default function Home() {
  const { data: homeData, isLoading, error } = useGetHome();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !homeData) return <MainLayout><div className="text-center p-12 text-destructive">حدث خطأ في تحميل البيانات.</div></MainLayout>;

  return (
    <MainLayout>
      <section className="bg-primary text-primary-foreground py-4">
        <div className="container mx-auto px-4 text-center text-sm md:text-base font-semibold leading-7">
          <p>الدليل متاح حالياً للمنطقة الشرقية فقط</p>
          <p className="font-normal">الدمام <span className="mx-1">•</span> الخبر <span className="mx-1">•</span> الظهران <span className="mx-1">•</span> الأحساء <span className="mx-1">•</span> الجبيل</p>
          <p className="font-normal opacity-90">قريباً: الرياض وجدة وباقي المناطق</p>
        </div>
      </section>
      {/* Hero Section */}
      <section className="relative bg-secondary/10 py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-40 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)/0.24),transparent_30%),radial-gradient(circle_at_80%_70%,hsl(var(--secondary)/0.2),transparent_32%)]"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight max-w-4xl mx-auto">
            ابحث عن أفضل <span className="text-primary">موردي</span> المخابز والحلويات والمقاهي
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            منصة متخصصة تربط أصحاب الأعمال بالموردين المعتمدين لتوفير أجود المكونات والمعدات في المملكة.
          </p>
          
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex items-center relative group">
            <input 
              type="text" 
              placeholder="ابحث عن دقيق، شوكولاتة، معدات، أو اسم مورد..." 
              className="w-full h-14 pl-4 pr-12 rounded-full border-2 border-primary/20 bg-background focus:border-primary focus:ring-0 outline-none shadow-lg transition-all text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="absolute right-3 top-2 bottom-2 aspect-square bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors shadow-md">
              <Search className="w-5 h-5" />
            </button>
          </form>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mt-12 bg-background/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-border/50">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{homeData.stats.suppliers}+</div>
              <div className="text-sm text-muted-foreground font-medium">مورد معتمد</div>
            </div>
            <div className="text-center border-r border-l border-border/50">
              <div className="text-3xl font-bold text-primary mb-1">{homeData.stats.products}+</div>
              <div className="text-sm text-muted-foreground font-medium">منتج</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-1">{homeData.stats.cities}</div>
              <div className="text-sm text-muted-foreground font-medium">مدن التغطية</div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="py-16 container mx-auto px-4 scroll-mt-20">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 flex items-center gap-3">
          <div className="w-2 h-8 bg-primary rounded-full"></div>
          تصفح بالأقسام
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {homeData.categories.map((category) => {
            const icons = [Wheat, Candy, Milk, Cookie, Nut, FlaskConical, Sparkles, Package];
            const CategoryIcon = icons[category.id - 1] ?? Package;
            return (
              <Link key={category.id} href={`/category/${category.id}`} className="group flex flex-col items-center justify-center p-6 bg-card border rounded-xl hover:border-primary hover:shadow-md transition-all">
                <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <CategoryIcon className="w-8 h-8 text-secondary" />
                </div>
                <h3 className="font-semibold text-center text-foreground group-hover:text-primary transition-colors">{category.name}</h3>
                <span className="text-xs text-muted-foreground mt-1">{category.productCount} منتج</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Suppliers */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <div className="w-2 h-8 bg-primary rounded-full"></div>
              الموردون المميزون
            </h2>
            <Link href="/suppliers" className="text-sm font-semibold text-primary hover:underline">عرض الكل &larr;</Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homeData.featuredSuppliers.map((supplier) => (
              <Link key={supplier.id} href={`/supplier/${supplier.id}`} className="flex flex-col bg-card border rounded-xl overflow-hidden hover:shadow-lg transition-all group">
                <div className="p-6 pb-0 flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors flex items-center gap-2">
                      {supplier.name}
                      {supplier.isVerified && (
                        <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium" title="موثق">
                          موثق ✓
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{supplier.description}</p>
                  </div>
                </div>
                <div className="p-6 mt-auto">
                  <div className="flex items-center justify-between text-sm pt-4 border-t">
                    <span className="text-muted-foreground flex items-center gap-1">📍 {supplier.city}</span>
                    <span className="font-medium text-amber-600 flex items-center gap-1">★ {supplier.averageRating.toFixed(1)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Products */}
      <section className="py-16 container mx-auto px-4 mb-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 flex items-center gap-3">
          <div className="w-2 h-8 bg-primary rounded-full"></div>
          أحدث المنتجات
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {homeData.latestProducts.map((product) => (
            <Link key={product.id} href={`/product/${product.id}`} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary/5 text-secondary">
                    <Package className="w-12 h-12 opacity-50" />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="text-xs text-muted-foreground mb-1">{product.categoryName}</div>
                <h3 className="font-semibold text-sm md:text-base group-hover:text-primary transition-colors line-clamp-2 mb-2">{product.name}</h3>
                <div className="mt-auto pt-3 flex flex-col gap-1 border-t border-border/50">
                  <div className="text-xs text-muted-foreground truncate" title={product.supplierName}>{product.supplierName}</div>
                  <div className="text-xs font-medium">الحد الأدنى: {product.minOrder} {product.unit}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </MainLayout>
  );
}
