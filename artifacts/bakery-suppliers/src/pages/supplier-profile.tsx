import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useGetSupplier, useAddReview, getGetSupplierQueryKey } from "@workspace/api-client-react";
import { Link, useRoute } from "wouter";
import { MapPin, Phone, MessageSquare, Star, CheckCircle2, ShieldCheck, Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const reviewSchema = z.object({
  reviewerName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").max(80),
  rating: z.number().min(1, "الرجاء اختيار التقييم").max(5),
  comment: z.string().min(3, "التعليق قصير جداً").max(500),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

export default function SupplierProfilePage() {
  const [, params] = useRoute("/supplier/:id");
  const supplierId = params?.id ? parseInt(params.id) : null;
  const queryClient = useQueryClient();
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const { data: supplier, isLoading, error } = useGetSupplier(supplierId!, {
    query: { enabled: !!supplierId, queryKey: getGetSupplierQueryKey(supplierId!) }
  });

  const addReview = useAddReview({
    mutation: {
      onSuccess: () => {
        setIsReviewOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId!) });
      }
    }
  });

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      reviewerName: "",
      rating: 5,
      comment: "",
    }
  });

  const onSubmit = (data: ReviewFormValues) => {
    if (supplierId) {
      addReview.mutate({ id: supplierId, data });
    }
  };

  if (!supplierId) return <MainLayout><div className="text-center p-12 text-destructive">معرف المورد غير صحيح</div></MainLayout>;
  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !supplier) return <MainLayout><div className="text-center p-12 text-destructive">حدث خطأ في تحميل بيانات المورد.</div></MainLayout>;

  return (
    <MainLayout>
      <div className="bg-gradient-to-b from-secondary/10 to-background border-b pt-12 pb-16">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-card border-4 border-background shadow-lg flex items-center justify-center text-primary text-4xl md:text-5xl font-bold shrink-0 -mt-20 md:-mt-0 relative">
              {supplier.name.substring(0,1)}
              {supplier.isVerified && (
                <div className="absolute -bottom-2 -left-2 bg-green-500 text-white p-1 rounded-full border-2 border-background" title="مورد موثق">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
                    {supplier.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 md:gap-6 mt-3 text-muted-foreground text-sm">
                    <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4"/> {supplier.city}، {supplier.region}</span>
                    <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500 fill-amber-500"/> {supplier.averageRating.toFixed(1)} تقييم</span>
                    <span>انضم {new Date(supplier.createdAt).toLocaleDateString('ar-SA')}</span>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <a href={`https://wa.me/${supplier.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً، وصلت إلى بياناتكم عبر دليل موردي المخابز والحلويات وأرغب في الاستفسار عن منتجاتكم.`)}`} target="_blank" rel="noopener noreferrer" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-sm">
                    <MessageSquare className="w-4 h-4" />
                    واتساب
                  </a>
                  <a href={`tel:${supplier.phone}`} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-card hover:bg-muted border px-5 py-2.5 rounded-xl font-medium transition-colors">
                    <Phone className="w-4 h-4" />
                    اتصال
                  </a>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed max-w-3xl mt-4 md:mt-6 bg-card/50 p-4 rounded-xl border border-border/50">
                {supplier.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-10">
            {/* Products */}
            <section>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Package className="w-6 h-6 text-primary" />
                منتجات المورد ({supplier.products.length})
              </h2>
              {supplier.products.length === 0 ? (
                <div className="text-center p-8 bg-muted/20 border border-dashed rounded-xl">لا توجد منتجات مضافة بعد.</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {supplier.products.map(product => (
                    <Link key={product.id} href={`/product/${product.id}`} className="bg-card border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all group flex flex-col">
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <Package className="w-8 h-8 text-muted-foreground opacity-30" />
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-[10px] text-muted-foreground mb-1">{product.categoryName}</div>
                        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2">{product.name}</h3>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Reviews */}
            <section>
              <div className="flex items-center justify-between mb-6 border-b pb-4">
                <h2 className="text-2xl font-bold">التقييمات والآراء</h2>
                <button 
                  onClick={() => setIsReviewOpen(!isReviewOpen)} 
                  className="text-sm font-medium text-primary bg-primary/10 px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  أضف تقييمك
                </button>
              </div>

              {isReviewOpen && (
                <div className="bg-card border rounded-xl p-6 mb-8 shadow-sm">
                  <h3 className="font-bold text-lg mb-4">تقييم تجربتك مع {supplier.name}</h3>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="reviewerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الاسم</FormLabel>
                              <FormControl>
                                <input {...field} className="w-full h-10 px-3 rounded-md border bg-background text-sm" placeholder="اسمك الكريم" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="rating"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>التقييم (من 5)</FormLabel>
                              <FormControl>
                                <select 
                                  {...field} 
                                  onChange={e => field.onChange(Number(e.target.value))}
                                  className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                                >
                                  <option value={5}>⭐⭐⭐⭐⭐ (ممتاز)</option>
                                  <option value={4}>⭐⭐⭐⭐ (جيد جداً)</option>
                                  <option value={3}>⭐⭐⭐ (جيد)</option>
                                  <option value={2}>⭐⭐ (مقبول)</option>
                                  <option value={1}>⭐ (سيء)</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="comment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>التعليق</FormLabel>
                            <FormControl>
                              <textarea {...field} rows={4} className="w-full p-3 rounded-md border bg-background text-sm resize-none" placeholder="اكتب تجربتك مع المورد..." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => setIsReviewOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors">إلغاء</button>
                        <button type="submit" disabled={addReview.isPending} className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                          {addReview.isPending ? "جاري الحفظ..." : "نشر التقييم"}
                        </button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}

              {supplier.reviews.length === 0 ? (
                <div className="text-center p-8 bg-muted/20 border border-dashed rounded-xl">لا توجد تقييمات حتى الآن. كن أول من يقيم!</div>
              ) : (
                <div className="space-y-4">
                  {supplier.reviews.map(review => (
                    <div key={review.id} className="bg-card border rounded-xl p-5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold">{review.reviewerName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{new Date(review.createdAt).toLocaleDateString('ar-SA')}</div>
                        </div>
                        <div className="flex text-amber-500">
                          {Array.from({length: 5}).map((_, i) => (
                            <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-amber-500' : 'text-muted/30 fill-transparent'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm mt-3 leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-card border rounded-2xl p-6 sticky top-24 shadow-sm">
              <h3 className="font-bold text-lg mb-6 border-b pb-3">معلومات التواصل</h3>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-primary shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">رقم الهاتف</div>
                    <div className="font-medium dir-ltr text-right">{supplier.phone}</div>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366] shrink-0">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">واتساب</div>
                    <div className="font-medium dir-ltr text-right">{supplier.whatsapp}</div>
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">العنوان</div>
                    <div className="font-medium">{supplier.city}، {supplier.region}</div>
                  </div>
                </li>
              </ul>
              
              <div className="mt-8 pt-6 border-t border-dashed">
                <div className="bg-green-50 text-green-800 p-4 rounded-xl flex items-start gap-3 border border-green-200">
                  <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    هذا المورد موثق في منصتنا. ننصح دائماً بالتأكد من جودة المنتجات قبل الطلب بكميات كبيرة.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
