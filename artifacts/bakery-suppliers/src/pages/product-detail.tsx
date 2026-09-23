import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getGetProductQueryKey, useGetProduct } from "@workspace/api-client-react";
import { Link, useRoute } from "wouter";
import { Package, MapPin, ChevronLeft, Info, FileText, Calendar, Box, Droplets, ThermometerSnowflake, ShieldCheck } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { ProtectedWhatsAppButton } from "@/components/whatsapp/protected-whatsapp-button";

export default function ProductDetailPage() {
  const [, params] = useRoute("/product/:id");
  const productId = params?.id ? parseInt(params.id) : null;

  const { data: product, isLoading, error } = useGetProduct(productId!, {
    query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId!) }
  });

  if (!productId) return <MainLayout><div className="text-center p-12 text-destructive">معرف المنتج غير صحيح</div></MainLayout>;
  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !product) return <MainLayout><div className="text-center p-12 text-destructive">حدث خطأ في تحميل بيانات المنتج.</div></MainLayout>;

  return (
    <MainLayout>
      {/* Breadcrumb */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground overflow-x-auto whitespace-nowrap">
          <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <Link href={`/category/${product.categoryId}`} className="hover:text-primary transition-colors">{product.categoryName}</Link>
          <ChevronLeft className="w-4 h-4 shrink-0" />
          <span className="text-foreground truncate">{product.name}</span>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Product Image */}
          <div className="bg-card border rounded-3xl overflow-hidden aspect-square flex items-center justify-center p-8 relative">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="max-w-full max-h-full object-contain drop-shadow-xl" />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground opacity-30">
                <Package className="w-32 h-32 mb-4" />
                <span>لا توجد صورة للمنتج</span>
              </div>
            )}
            <div className="absolute top-4 right-4 bg-background/90 backdrop-blur text-primary text-xs font-bold px-3 py-1.5 rounded-full border shadow-sm">
              {product.categoryName}
            </div>
          </div>

          {/* Product Info */}
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">{product.name}</h1>
            
            <Link href={`/supplier/${product.supplierId}`} className="inline-flex items-center gap-3 bg-muted/50 p-2 pr-2 pl-4 rounded-full hover:bg-muted transition-colors mb-8 border border-transparent hover:border-border">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                {product.supplierName.substring(0,1)}
              </div>
              <span className="font-medium text-sm">المورد: {product.supplierName}</span>
              {product.supplier.isVerified && <ShieldCheck className="w-4 h-4 text-green-600" />}
            </Link>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5"><Box className="w-3.5 h-3.5"/> الوزن / الحجم</span>
                <span className="font-bold text-lg">{product.weight} {product.unit}</span>
              </div>
              <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> بلد المنشأ</span>
                <span className="font-bold text-lg">{product.countryOfOrigin}</span>
              </div>
              <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5"><Package className="w-3.5 h-3.5"/> الحد الأدنى للطلب</span>
                <span className="font-bold text-lg">{product.minOrder} {product.unit}</span>
              </div>
              <div className="bg-card border rounded-xl p-4 flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> السعر التقريبي</span>
                <span className="font-bold text-lg text-primary">{product.price ? `${product.price} ريال` : "عند الطلب"}</span>
              </div>
            </div>

            <div className="flex gap-4">
              <ProtectedWhatsAppButton supplierId={product.supplierId} supplierName={product.supplierName} hasWhatsApp={Boolean(buildWhatsAppUrl(product.supplier.whatsapp))} className="flex-1 rounded-xl bg-primary py-3.5 text-center font-bold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary/90" label="طلب تسعيرة (واتساب)" />
              <a href={`tel:${product.supplier.phone}`} className="flex-1 bg-card border-2 text-center py-3.5 rounded-xl font-bold hover:bg-muted transition-colors">
                اتصال بالمورد
              </a>
            </div>
          </div>
        </div>

        {/* Technical Details Tabs-like structure */}
        <div className="mt-16 bg-card border rounded-3xl overflow-hidden">
          <div className="p-6 md:p-10 border-b">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Info className="w-6 h-6 text-primary" /> المواصفات الفنية للمنتج</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2"><Droplets className="w-4 h-4"/> المكونات الأساسية</h3>
                  <p className="leading-relaxed bg-muted/30 p-4 rounded-xl text-sm">{product.ingredients}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2"><FileText className="w-4 h-4"/> البيانات الفنية</h3>
                  <p className="leading-relaxed bg-muted/30 p-4 rounded-xl text-sm">{product.technicalData}</p>
                </div>
              </div>
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2"><Box className="w-4 h-4"/> الاستخدام الموصى به</h3>
                  <p className="leading-relaxed bg-muted/30 p-4 rounded-xl text-sm">{product.recommendedUse}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-secondary mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> فترة الصلاحية</h3>
                    <p className="font-medium">{product.shelfLife}</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5"><ThermometerSnowflake className="w-3.5 h-3.5"/> ظروف الحفظ</h3>
                    <p className="font-medium">{product.storageConditions}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {product.similarProducts && product.similarProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
              <div className="w-2 h-8 bg-secondary rounded-full"></div>
              منتجات مشابهة
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {product.similarProducts.map(similar => (
                <Link key={similar.id} href={`/product/${similar.id}`} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all group flex flex-col">
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {similar.imageUrl ? (
                      <img src={similar.imageUrl} alt={similar.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <Package className="w-10 h-10 text-muted-foreground opacity-30" />
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2 mb-2">{similar.name}</h3>
                    <div className="mt-auto text-[10px] text-muted-foreground truncate border-t pt-2">
                      {similar.supplierName}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
