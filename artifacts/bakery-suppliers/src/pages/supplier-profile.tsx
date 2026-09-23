import { ArrowRight, BadgeCheck, ChevronLeft, Clock3, ExternalLink, MapPin, MessageCircle, Package, Phone, ShieldCheck, Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAddReview, useGetSupplier, getGetSupplierQueryKey } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { ProtectedWhatsAppButton } from "@/components/whatsapp/protected-whatsapp-button";

const reviewSchema = z.object({
  reviewerName: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").max(80),
  rating: z.coerce.number().min(1, "الرجاء اختيار التقييم").max(5),
  comment: z.string().min(3, "التعليق قصير جداً").max(500),
});
type ReviewFormValues = z.infer<typeof reviewSchema>;

function Stars({ rating, large = false }: { rating: number; large?: boolean }) {
  return <span className={`inline-flex items-center gap-0.5 ${large ? "text-lg" : "text-sm"} text-accent`} aria-label={`التقييم ${rating} من 5`}>{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`${large ? "h-5 w-5" : "h-4 w-4"} ${index < Math.round(rating) ? "fill-current" : "text-border"}`} />)}</span>;
}

function LogoBadge({ name, verified }: { name: string; verified: boolean }) {
  return <div className="relative shrink-0"><div className="flex h-24 w-24 items-center justify-center rounded-full border-8 border-background bg-secondary text-4xl font-extrabold text-primary shadow-warm md:h-32 md:w-32 md:text-5xl">{name.slice(0, 1)}</div>{verified && <span className="absolute bottom-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground"><ShieldCheck className="h-4 w-4" /></span>}</div>;
}

export default function SupplierProfilePage() {
  const [, params] = useRoute("/supplier/:id");
  const supplierId = params?.id ? Number(params.id) : null;
  const queryClient = useQueryClient();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const { data: supplier, isLoading, error } = useGetSupplier(supplierId ?? 0, { query: { enabled: !!supplierId, queryKey: getGetSupplierQueryKey(supplierId ?? 0) } });
  const form = useForm<ReviewFormValues>({ resolver: zodResolver(reviewSchema), defaultValues: { reviewerName: "", rating: 5, comment: "" } });
  const addReview = useAddReview({ mutation: { onSuccess: () => { setIsReviewOpen(false); form.reset(); if (supplierId) void queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) }); } } });

  if (!supplierId) return <MainLayout><EmptyState title="معرف المورد غير صحيح" description="الرابط الذي وصلت منه غير مكتمل." /></MainLayout>;
  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !supplier) return <MainLayout><EmptyState title="تعذر تحميل بيانات المورد" description="حاول تحديث الصفحة أو العودة إلى قائمة الموردين." /></MainLayout>;

  const hasWhatsApp = Boolean(buildWhatsAppUrl(supplier.whatsapp));
  const submitReview = (values: ReviewFormValues) => addReview.mutate({ id: supplierId, data: values });

  return <MainLayout>
    <section className="border-b border-border bg-[linear-gradient(135deg,hsl(var(--secondary)/.24),hsl(var(--background))_55%)]">
      <div className="container mx-auto px-4 pb-14 pt-8 md:pb-16 md:pt-12">
        <Link href="/suppliers" data-testid="link-back-suppliers" className="mb-9 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary"><ArrowRight className="h-4 w-4" /> العودة إلى دليل الموردين</Link>
        <div className="flex flex-col gap-7 md:flex-row md:items-center">
          <LogoBadge name={supplier.name} verified={supplier.isVerified} />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 data-testid="text-supplier-name" className="text-3xl font-extrabold md:text-5xl">{supplier.name}</h1>{supplier.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" /> مورد موثق</span>}{supplier.googleCategory && <span className="rounded-full bg-secondary/30 px-3 py-1 text-xs font-bold text-primary">{supplier.googleCategory}</span>}</div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> {supplier.city}، {supplier.region}</span>{supplier.googleRating ? <span className="inline-flex items-center gap-1.5"><Stars rating={supplier.googleRating} /> <b className="text-foreground">{supplier.googleRating.toFixed(1)}</b> تقييم Google Maps{supplier.googleReviewCount ? ` (${supplier.googleReviewCount})` : ""}</span> : <span className="inline-flex items-center gap-1.5"><Stars rating={supplier.averageRating} /> <b className="text-foreground">{supplier.averageRating.toFixed(1)}</b> تقييم الدليل</span>}</div></div>
           <div className="flex shrink-0 flex-col gap-2 sm:flex-row">{hasWhatsApp ? <ProtectedWhatsAppButton supplierId={supplier.id} supplierName={supplier.name} hasWhatsApp={hasWhatsApp} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#287d56] px-5 py-3 font-extrabold text-white transition-transform hover:-translate-y-0.5" label="تواصل عبر واتساب" /> : <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-muted px-5 py-3 font-extrabold text-muted-foreground">لا يوجد واتساب</span>}{supplier.phone && <a data-testid="button-supplier-phone" href={`tel:${supplier.phone}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-3 font-bold hover:border-primary"><Phone className="h-4 w-4" /> اتصال</a>}</div>
        </div>
        <p className="mt-8 max-w-3xl whitespace-pre-line rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-8 text-muted-foreground">{supplier.description || "نبذة المورد ستُضاف قريباً."}</p>
      </div>
    </section>

    <div className="container mx-auto grid grid-cols-1 gap-10 px-4 py-12 lg:grid-cols-[1fr_330px]">
      <main className="min-w-0">
        <section data-testid="section-supplier-products"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary">كتالوج المورد</p><h2 className="text-2xl font-extrabold md:text-3xl">أبرز المنتجات</h2></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{supplier.products.length} منتجات</span></div>
          {supplier.products.length ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{supplier.products.map((product) => <Link key={product.id} href={`/product/${product.id}`} data-testid={`card-supplier-product-${product.id}`} className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-warm"><div className="aspect-square overflow-hidden bg-muted">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-primary/40"><Package className="h-10 w-10" /></div>}</div><div className="p-4"><p className="mb-1 text-[11px] font-bold text-muted-foreground">{product.categoryName}</p><h3 className="line-clamp-2 text-sm font-extrabold group-hover:text-primary">{product.name}</h3><p className="mt-2 text-xs text-muted-foreground">الحد الأدنى: {product.minOrder} {product.unit}</p></div></Link>)}</div> : <EmptyState title="لا توجد منتجات منشورة بعد" description="سيتم عرض المنتجات هنا عند إضافتها إلى ملف المورد." compact />}
        </section>

        <section className="mt-16" data-testid="section-supplier-reviews"><div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-accent">تجارب أصحاب الأعمال</p><h2 className="text-2xl font-extrabold md:text-3xl">التقييمات والآراء</h2></div><button data-testid="button-open-review" type="button" onClick={() => setIsReviewOpen((open) => !open)} className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-4 py-2.5 text-sm font-extrabold text-primary hover:bg-primary/15">{isReviewOpen ? "إغلاق النموذج" : "أضف تقييمك"} <ChevronLeft className="h-4 w-4" /></button></div>
          {isReviewOpen && <div className="mb-7 rounded-2xl border border-border bg-card p-5 shadow-warm"><h3 className="mb-4 text-lg font-extrabold">كيف كانت تجربتك مع {supplier.name}؟</h3><Form {...form}><form onSubmit={form.handleSubmit(submitReview)} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><FormField control={form.control} name="reviewerName" render={({ field }) => <FormItem><FormLabel>الاسم</FormLabel><FormControl><input data-testid="input-reviewer-name" {...field} className="h-11 w-full rounded-xl border border-input bg-background px-3 outline-none focus:border-primary" placeholder="اسمك الكريم" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="rating" render={({ field }) => <FormItem><FormLabel>التقييم</FormLabel><FormControl><select data-testid="select-review-rating" {...field} onChange={(event) => field.onChange(Number(event.target.value))} className="h-11 w-full rounded-xl border border-input bg-background px-3 outline-none focus:border-primary"><option value="5">ممتاز — 5 من 5</option><option value="4">جيد جداً — 4 من 5</option><option value="3">جيد — 3 من 5</option><option value="2">مقبول — 2 من 5</option><option value="1">يحتاج تحسين — 1 من 5</option></select></FormControl><FormMessage /></FormItem>} /></div><FormField control={form.control} name="comment" render={({ field }) => <FormItem><FormLabel>التعليق</FormLabel><FormControl><textarea data-testid="textarea-review-comment" {...field} rows={4} className="w-full resize-none rounded-xl border border-input bg-background p-3 outline-none focus:border-primary" placeholder="شارك ملاحظتك مع أصحاب المخابز والحلويات..." /></FormControl><FormMessage /></FormItem>} /><button data-testid="button-submit-review" type="submit" disabled={addReview.isPending} className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60">{addReview.isPending ? "جاري النشر..." : "نشر التقييم"}</button></form></Form></div>}
          {supplier.reviews.length ? <div className="space-y-4">{supplier.reviews.map((review) => <article key={review.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-extrabold">{review.reviewerName}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString("ar-SA")}</p></div><Stars rating={review.rating} /></div><p className="mt-4 text-sm leading-7 text-muted-foreground">{review.comment}</p></article>)}</div> : <EmptyState title="لا توجد تقييمات حتى الآن" description="كن أول من يشارك تجربته مع هذا المورد." compact />}</section>
      </main>

        <aside><div className="sticky top-24 rounded-2xl border border-border bg-card p-6 shadow-warm"><h2 className="border-b border-border pb-4 text-lg font-extrabold">بيانات التواصل</h2><div className="space-y-5 pt-5"><ContactLine icon={<MapPin className="h-5 w-5" />} label="العنوان" value={supplier.address || `${supplier.city}، ${supplier.region}`} /><ContactLine icon={<Phone className="h-5 w-5" />} label="الهاتف" value={supplier.phone || "ستُضاف لاحقاً"} /><ContactLine icon={<MessageCircle className="h-5 w-5" />} label="واتساب" value={supplier.whatsapp || "ستُضاف لاحقاً"} />{supplier.website && <a href={supplier.website} target="_blank" rel="noreferrer" className="flex items-start gap-3 text-primary hover:underline"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/25"><ExternalLink className="h-5 w-5" /></span><span><span className="block text-xs text-muted-foreground">الموقع الإلكتروني</span><span className="mt-1 block break-all text-sm font-bold" dir="ltr">{supplier.website.replace(/^https?:\/\//, "")}</span></span></a>}</div>{hasWhatsApp && <ProtectedWhatsAppButton supplierId={supplier.id} supplierName={supplier.name} hasWhatsApp={hasWhatsApp} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#287d56] px-4 py-3 text-center text-sm font-extrabold text-white" label="للاستفسار عن باقي المنتجات" />}{(supplier.googleRating || supplier.googleCategory || supplier.hoursNote) && <div className="mt-7 rounded-2xl border border-accent/30 bg-accent/10 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-accent-foreground"><MapPin className="h-4 w-4" /> معلومات Google Maps</div>{supplier.googleCategory && <p className="text-sm text-muted-foreground">التصنيف: <strong className="text-foreground">{supplier.googleCategory}</strong></p>}{supplier.googleRating && <p className="mt-2 text-sm text-muted-foreground">التقييم: <strong className="text-foreground">{supplier.googleRating.toFixed(1)} من 5</strong>{supplier.googleReviewCount ? ` (${supplier.googleReviewCount} مراجعة)` : ""}</p>}{supplier.hoursNote && <p className="mt-2 flex items-start gap-2 text-xs leading-6 text-muted-foreground"><Clock3 className="mt-1 h-3.5 w-3.5 shrink-0" />{supplier.hoursNote}</p>}<p className="mt-3 text-[11px] leading-5 text-muted-foreground">المعلومات منقولة من المصدر المرفق وقد تتغير في Google Maps.</p></div>}<div className="mt-7 flex gap-3 rounded-xl bg-secondary/20 p-4 text-xs leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>ننصح دائماً بالتأكد من جودة المنتج وشروط التوريد قبل الطلب بكميات كبيرة.</p></div></div></aside>
    </div>
  </MainLayout>;
}

function ContactLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/25 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div></div>;
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-dashed border-border bg-muted/20 text-center ${compact ? "p-9" : "mx-auto min-h-[50vh] max-w-xl p-12"}`}><Package className="mx-auto mb-3 h-9 w-9 text-primary/50" /><h2 className="font-extrabold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></div>;
}