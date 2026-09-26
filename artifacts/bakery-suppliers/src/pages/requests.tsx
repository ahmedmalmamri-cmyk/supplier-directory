import { Link } from "wouter";
import { useMemo, type ReactNode } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, ClipboardList, MapPin, Package, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useListRequests, getListRequestsQueryKey } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";
import type { Request } from "@workspace/api-client-react";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "تاريخ غير متاح";
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function RequestCard({ item, supplierView }: { item: Request; supplierView: boolean }) {
  return (
    <article className="group relative overflow-hidden rounded-[1.35rem] border border-border/80 bg-card p-5 shadow-warm transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-warm-lg md:p-6" data-testid={`card-request-${item.id}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-primary/80" />
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary" data-testid={`text-request-category-${item.id}`}>
                <Package className="h-3.5 w-3.5" />
                {item.categoryName}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-extrabold text-success" data-testid={`status-request-${item.id}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {item.status === "active" ? "نشط" : item.status === "closed" ? "مغلق" : "منتهٍ"}
              </span>
            </div>
            <h2 className="text-xl font-extrabold leading-9 text-balance" data-testid={`text-request-title-${item.id}`}>{item.title}</h2>
          </div>
          <div className="hidden shrink-0 rounded-2xl bg-secondary/70 p-3 text-primary sm:block">
            <ClipboardList className="h-5 w-5" />
          </div>
        </div>

        <p className="line-clamp-3 text-sm leading-7 text-muted-foreground" data-testid={`text-request-description-${item.id}`}>{item.description || "لا توجد تفاصيل إضافية."}</p>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/45 p-3 sm:grid-cols-4">
          <InfoCell label="الكمية" value={`${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(item.quantity)} ${item.unit}`} testId={`text-request-quantity-${item.id}`} />
          <InfoCell label="التكرار" value={item.frequency} testId={`text-request-frequency-${item.id}`} />
          <InfoCell label="المدينة" value={item.city} icon={<MapPin className="h-3.5 w-3.5" />} testId={`text-request-city-${item.id}`} />
          <InfoCell label={supplierView ? "ينتهي في" : "نُشر في"} value={formatDate(supplierView ? item.expiresAt : item.createdAt)} icon={<CalendarClock className="h-3.5 w-3.5" />} testId={`text-request-date-${item.id}`} />
        </div>
      </div>
    </article>
  );
}

function InfoCell({ label, value, icon, testId }: { label: string; value: string; icon?: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 px-1">
      <p className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold" data-testid={testId}>{value}</p>
    </div>
  );
}

function RequestsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="جارٍ تحميل الاحتياجات">
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-[1.35rem] border bg-card/70 p-6"><div className="h-5 w-28 rounded bg-muted" /><div className="mt-5 h-7 w-3/4 rounded bg-muted" /><div className="mt-4 h-12 w-full rounded bg-muted" /><div className="mt-8 h-14 w-full rounded-2xl bg-muted" /></div>)}
      <span className="sr-only">جارٍ تحميل الاحتياجات</span>
    </div>
  );
}

export default function RequestsPage() {
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const isLoadingAuth = buyerLoading || supplierLoading;
  const view = user ? "buyer" : supplier ? "supplier" : null;
  const requestKey = useMemo(() => [...getListRequestsQueryKey(), view, view === "buyer" ? user?.id : supplier?.id], [view, user?.id, supplier?.id]);
  const requestsQuery = useListRequests({ query: { enabled: !isLoadingAuth && !!view, queryKey: requestKey } });
  const requests = requestsQuery.data ?? [];
  const pageTitle = view === "supplier" ? "احتياجات أصحاب الأعمال" : "احتياجاتي";

  return (
    <MainLayout>
      <section className="relative overflow-hidden border-b border-border/70 bg-secondary/35">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="container relative mx-auto px-4 py-10 md:py-14">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><ClipboardList className="h-4 w-4" /> سوق الاحتياج</div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl" data-testid="heading-requests">{pageTitle}</h1>
              <p className="mt-3 max-w-xl text-sm leading-8 text-muted-foreground md:text-base">
                {view === "supplier" ? "طلبات توريد نشطة من مخابز ومحلات حلويات في المنطقة الشرقية، مع الحفاظ على خصوصية أصحابها." : "تابع احتياجات التوريد التي نشرتها لنشاطك، واعرف متى تنتهي صلاحية كل طلب."}
              </p>
            </div>
            {view === "buyer" && user?.isOwner && (
              <Link href="/requests/new" data-testid="link-new-request-hero" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-extrabold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 hover:bg-primary/90">
                <Plus className="h-5 w-5" /> انشر احتياجاً
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto flex-1 px-4 py-8 md:py-10">
        {isLoadingAuth ? (
          <RequestsSkeleton />
        ) : !view ? (
          <AuthState />
        ) : requestsQuery.isLoading ? (
          <RequestsSkeleton />
        ) : requestsQuery.error ? (
          <ErrorState onRetry={() => void requestsQuery.refetch()} />
        ) : requests.length === 0 ? (
          <EmptyState supplierView={view === "supplier"} owner={!!user?.isOwner} />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-muted-foreground" data-testid="text-request-count">{new Intl.NumberFormat("ar-SA").format(requests.length)} {view === "supplier" ? "احتياج نشط" : "احتياج منشور"}</p>
              {view === "supplier" && <span className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground"><ShieldCheck className="h-4 w-4 text-success" /> بيانات أصحاب الأعمال مخفية</span>}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {requests.map((item) => <RequestCard key={item.id} item={item} supplierView={view === "supplier"} />)}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

function AuthState() {
  return (
    <div className="mx-auto max-w-xl rounded-[1.5rem] border border-dashed border-primary/35 bg-primary/5 p-8 text-center md:p-12" data-testid="state-requests-auth">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></div>
      <h2 className="mt-5 text-2xl font-extrabold">سجّل الدخول لرؤية الاحتياجات</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">هذه المساحة مخصصة لأصحاب الأعمال والموردين المعتمدين.</p>
      <Link href="/login" data-testid="link-requests-login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2 font-extrabold text-primary-foreground">تسجيل الدخول</Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-[1.5rem] border border-destructive/25 bg-destructive/5 p-8 text-center" role="alert" data-testid="state-requests-error">
      <AlertCircle className="mx-auto h-9 w-9 text-destructive" />
      <h2 className="mt-4 text-xl font-extrabold">تعذر تحميل الاحتياجات</h2>
      <p className="mt-2 text-sm text-muted-foreground">حدثت مشكلة مؤقتة. حاول تحديث القائمة مرة أخرى.</p>
      <button type="button" onClick={onRetry} data-testid="button-retry-requests" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 font-extrabold text-destructive hover:bg-destructive/10"><RefreshCw className="h-4 w-4" /> إعادة المحاولة</button>
    </div>
  );
}

function EmptyState({ supplierView, owner }: { supplierView: boolean; owner: boolean }) {
  return (
    <div className="mx-auto max-w-2xl rounded-[1.5rem] border border-dashed border-border bg-card/70 p-8 text-center md:p-14" data-testid="state-requests-empty">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary"><ClipboardList className="h-8 w-8" /></div>
      <h2 className="mt-5 text-2xl font-extrabold">{supplierView ? "لا توجد احتياجات نشطة الآن" : "لم تنشر أي احتياج بعد"}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{supplierView ? "عُد لاحقاً؛ تظهر هنا طلبات التوريد التي يمكن لموردي الدليل خدمتها." : "صف ما تحتاجه من مكونات أو مواد تغليف، ودع الموردين المعتمدين يطلعون عليه."}</p>
      {!supplierView && owner && <Link href="/requests/new" data-testid="link-new-request-empty" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 font-extrabold text-primary-foreground"><Plus className="h-4 w-4" /> انشر أول احتياج</Link>}
      {!supplierView && !owner && <p className="mt-5 text-xs font-bold text-warning">النشر متاح لحسابات أصحاب الأعمال فقط.</p>}
    </div>
  );
}