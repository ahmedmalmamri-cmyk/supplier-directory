import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpLeft, Bell, BookOpen, Check, Eye, MessageCircle, Star, TrendingUp, Users, Sparkles } from "lucide-react";
import { EmptySection, formatCount, formatRating, SupplierWorkspace, WorkspaceError, WorkspaceSkeleton } from "@/components/supplier/SupplierWorkspace";
import { useReadOpportunity, useSupplierDashboard } from "@/hooks/use-supplier-insights";

const monthLabel = new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(new Date());
function Change({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-muted-foreground">لا تتوفر مقارنة بالأسبوع السابق</span>;
  return <span className={value >= 0 ? "text-success" : "text-warning"} dir="rtl">{value > 0 ? "+" : ""}{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value)}٪ مقارنة بالأسبوع السابق</span>;
}

export default function SupplierDashboardPage() {
  const { data, isPending, error, refetch } = useSupplierDashboard();
  const read = useReadOpportunity();
  const [readError, setReadError] = useState("");
  return <SupplierWorkspace title={data ? `مرحباً، ${data.supplier.name}` : "لوحة المورد"} eyebrow="نظرة عامة" subtitle="أداء ملفك في الدليل، وما يستحق انتباهك هذا الأسبوع." error={error}>
    {isPending ? <WorkspaceSkeleton /> : error ? <WorkspaceError error={error} retry={() => void refetch()} /> : data && <>
      <Link href="/supplier/catalog" data-testid="link-dashboard-catalog" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-secondary/70 px-5 py-4 transition-colors hover:bg-secondary md:px-6"><span className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><BookOpen className="h-5 w-5" /></span><span><strong className="block text-sm">كتالوج التوريد الخاص بك</strong><span className="block text-xs leading-6 text-muted-foreground">حدد الأنواع التي تبيعها ليتمكن المشترون من العثور عليك؛ يلزم عرض نوع معتمد نشط للظهور في البحث.</span></span></span><span className="inline-flex items-center gap-1 text-xs font-extrabold text-primary">إدارة العروض <ArrowLeft className="h-4 w-4" /></span></Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>بيانات شهر {monthLabel} · {data.supplier.city}</span><span>الأرقام تعكس نشاط الدليل، وليست مبيعات مؤكدة.</span></div>
      <section aria-label="أداء هذا الشهر" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<Eye className="h-5 w-5" />} label="مشاهدات الملف" value={formatCount(data.month.views)} detail="خلال الشهر الحالي" testId="text-month-views" />
        <Metric icon={<MessageCircle className="h-5 w-5" />} label="طلبات تواصل عبر الدليل" value={formatCount(data.month.contacts)} detail="خلال الشهر الحالي" testId="text-month-contacts" />
        <Metric icon={<Star className="h-5 w-5" />} label="تقييم ملفك" value={data.month.rating == null ? "—" : `${formatRating(data.month.rating)} / ٥`} detail={data.month.totalReviews ? `${formatCount(data.month.totalReviews)} تقييم إجمالاً` : "لا توجد تقييمات بعد"} testId="text-month-rating" />
        <Metric icon={<Users className="h-5 w-5" />} label="مراجعات" value={formatCount(data.month.reviewsCount)} detail="خلال الشهر الحالي" testId="text-month-reviews" />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="supplier-panel p-5 md:p-7" aria-labelledby="weekly-heading">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-primary">تقرير الأسبوع</p><h2 id="weekly-heading" className="mt-1 text-xl font-extrabold">هذا الأسبوع بالأرقام</h2></div><TrendingUp className="h-6 w-6 text-primary" /></div>
          <div className="mt-6 divide-y divide-border">
            <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-bold">مشاهدات الملف</p><p className="mt-1 text-xs"><Change value={data.weekly.viewsChangePercent} /></p></div><strong className="text-3xl" data-testid="text-weekly-views">{formatCount(data.weekly.views)}</strong></div>
            <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-bold">فرص التواصل</p><p className="mt-1 text-xs"><Change value={data.weekly.contactsChangePercent} /></p></div><strong className="text-3xl" data-testid="text-weekly-contacts">{formatCount(data.weekly.contacts)}</strong></div>
            <div className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-bold">مراجعات جديدة</p><p className="mt-1 text-xs text-muted-foreground">مراجعات وردت هذا الأسبوع</p></div><strong className="text-3xl" data-testid="text-weekly-reviews">{formatCount(data.weekly.newReviews)}</strong></div>
          </div>
        </section>
        <section className="supplier-panel p-5 md:p-7" aria-labelledby="position-heading">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-primary">موقعك في الدليل</p><h2 id="position-heading" className="mt-1 text-xl font-extrabold">حسب الصنف</h2></div><Sparkles className="h-6 w-6 text-primary" /></div>
          {data.position.length ? <ul className="mt-5 divide-y divide-border">{data.position.map((item, index) => <li key={`${item.categoryName}-${index}`} className="flex items-center justify-between gap-4 py-3.5"><span className="font-bold">{item.categoryName}</span><span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground" data-testid={`text-category-position-${index}`}>{item.total > 0 && item.rank > 0 ? `المركز ${formatCount(item.rank)} من ${formatCount(item.total)}` : "لا يتوفر ترتيب"}</span></li>)}</ul> : <div className="mt-5"><EmptySection title="لا يتوفر ترتيب بعد" detail="سيظهر موقعك عندما تتوفر بيانات كافية لأصنافك." /></div>}
          <div className="mt-5 border-t border-border pt-4 text-sm leading-7 text-muted-foreground">
            <p>متوسط تقييم السوق: <strong className="text-foreground" data-testid="text-market-average-rating">{data.marketAverageRating == null ? "غير متاح" : `${formatRating(data.marketAverageRating)} / ٥`}</strong></p>
            {data.month.totalReviews > 0 && data.ratingPercentile != null && Number.isFinite(data.ratingPercentile) && <p>تقييمك أعلى من: <strong className="text-foreground" data-testid="text-rating-percentile">{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(data.ratingPercentile)}٪ من الموردين ذوي التقييمات</strong></p>}
          </div>
          <Link href="/supplier/market" data-testid="link-view-market" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-primary hover:underline">استكشف بيانات السوق <ArrowUpLeft className="h-4 w-4" /></Link>
        </section>
      </div>

      <section className="mt-5 supplier-panel p-5 md:p-7" aria-labelledby="opportunity-heading">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold text-primary">فرص ونصائح</p><h2 id="opportunity-heading" className="mt-1 text-xl font-extrabold">ما الذي يستحق انتباهك؟</h2></div><Bell className="h-6 w-6 text-primary" /></div>
        {readError && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" data-testid="status-opportunity-error">{readError}</p>}
        {data.opportunities.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{data.opportunities.map((item) => <article key={item.id} className={`rounded-2xl border p-5 ${item.isRead ? "bg-muted/20" : "border-primary/20 bg-primary/5"}`} data-testid={`card-opportunity-${item.id}`}>
          <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">{item.type === "tip" ? "نصيحة" : item.type === "opportunity" ? "فرصة" : item.type}</span>{!item.isRead && <span className="h-2 w-2 rounded-full bg-primary" aria-label="لم تقرأ بعد" />}</div>
          <h3 className="mt-4 font-extrabold">{item.title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{item.description}</p>
          {item.isRead ? <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-success"><Check className="h-4 w-4" /> تمت القراءة</p> : <button type="button" data-testid={`button-read-opportunity-${item.id}`} disabled={read.isPending} onClick={() => { setReadError(""); read.mutate(item.id, { onError: (e) => setReadError(e.message) }); }} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-primary hover:underline disabled:opacity-50">تحديد كمقروء <ArrowLeft className="h-4 w-4" /></button>}
        </article>)}</div> : <div className="mt-5"><EmptySection title="لا توجد فرص جديدة حالياً" detail="سنضع هنا فرصاً ونصائح مرتبطة بأداء ملفك عند توفرها." /></div>}
      </section>
      <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">جهات التواصل المؤهلة تُحتسب مرة واحدة لكل صاحب عمل خلال الفترة المحددة. لمراجعة المحادثات أو تقديم بلاغ، انتقل إلى <Link href="/supplier/portal" className="font-bold text-primary underline">سجل التواصل</Link>.</p>
    </>}
  </SupplierWorkspace>;
}

function Metric({ icon, label, value, detail, testId }: { icon: React.ReactNode; label: string; value: string; detail: string; testId: string }) {
  return <div className="supplier-panel p-5 md:p-6"><div className="flex items-center justify-between gap-2 text-primary"><span className="text-xs font-bold text-muted-foreground">{label}</span>{icon}</div><p className="mt-5 text-3xl font-extrabold tracking-tight md:text-4xl" data-testid={testId}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}