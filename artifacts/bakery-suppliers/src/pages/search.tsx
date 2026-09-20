import { MainLayout } from "@/components/layout/MainLayout";
import { Link, useLocation } from "wouter";
import { Search as SearchIcon, Package, Users } from "lucide-react";
import { getSearchDirectoryQueryKey, useSearchDirectory } from "@workspace/api-client-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function SearchPage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || "");
  const q = searchParams.get("q") || "";

  const { data, isLoading, error } = useSearchDirectory(
    { q },
    { query: { enabled: true, queryKey: getSearchDirectoryQueryKey({ q }) } }
  );

  return (
    <MainLayout>
      <div className="bg-muted/30 border-b py-8">
        <div className="container mx-auto px-4">
          <form action="/search" method="get" className="max-w-3xl mx-auto relative flex">
            <input 
              type="text" 
              name="q"
              defaultValue={q}
              placeholder="ابحث عن منتج، مورد، مدينة..." 
              className="w-full h-14 pl-4 pr-12 rounded-lg border-2 border-primary/20 bg-background focus:border-primary focus:ring-0 outline-none shadow-sm transition-all text-lg"
            />
            <button type="submit" className="absolute right-3 top-2.5 text-muted-foreground hover:text-primary">
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
            <p>أدخل اسم منتج أو مورد للبدء في البحث في الدليل.</p>
          </div>
        ) : isLoading ? (
          <LoadingSpinner className="min-h-[40vh]" />
        ) : error ? (
          <div className="text-center text-destructive py-20">حدث خطأ في البحث.</div>
        ) : (
          <div className="space-y-12">
            <div className="text-sm text-muted-foreground border-b pb-4">
              نتائج البحث عن: <span className="font-bold text-foreground text-base">"{q}"</span>
            </div>

            {/* Suppliers Results */}
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                الموردون ({data?.suppliers.length || 0})
              </h2>
              {data?.suppliers.length === 0 ? (
                <div className="p-6 bg-muted/20 border border-dashed rounded-xl text-center text-muted-foreground text-sm">لا يوجد موردون يطابقون بحثك.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data?.suppliers.map(supplier => (
                    <Link key={supplier.id} href={`/supplier/${supplier.id}`} className="flex items-center gap-4 bg-card border rounded-xl p-4 hover:shadow-md transition-all group">
                      <div className="w-14 h-14 rounded-full bg-secondary/10 flex items-center justify-center text-primary font-bold shrink-0">
                        {supplier.name.substring(0,1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold group-hover:text-primary transition-colors truncate">{supplier.name}</h3>
                        <div className="text-xs text-muted-foreground mt-1 truncate">{supplier.city}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Products Results */}
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Package className="w-6 h-6 text-primary" />
                المنتجات ({data?.products.length || 0})
              </h2>
              {data?.products.length === 0 ? (
                <div className="p-6 bg-muted/20 border border-dashed rounded-xl text-center text-muted-foreground text-sm">لا توجد منتجات تطابق بحثك.</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {data?.products.map(product => (
                    <Link key={product.id} href={`/product/${product.id}`} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <Package className="w-10 h-10 text-muted-foreground opacity-30" />
                        )}
                      </div>
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="text-[10px] text-muted-foreground mb-1">{product.categoryName}</div>
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2">{product.name}</h3>
                        <div className="mt-auto pt-2 text-[10px] text-muted-foreground truncate border-t border-border/50">
                          {product.supplierName}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </div>
    </MainLayout>
  );
}
