import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  MapPin,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  X,
} from "lucide-react";
import {
  getGetRequestOptionsQueryKey,
  getListItemCategoriesQueryKey,
  getListRequestsQueryKey,
  useCreateSupplierRequestContact,
  useGetRequestOptions,
  useListItemCategories,
  useListRequests,
  type Request,
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

const previewRequests: Request[] = [
  {
    id: 901,
    categoryId: 1,
    categoryName: "الزبدة والسمن",
    title: "زبدة طبيعية للمخبوزات",
    description: "نبحث عن زبدة طبيعية مناسبة للكرواسون والمعجنات، مع إمكانية التوريد الأسبوعي.",
    quantity: 500,
    unit: "كيلو",
    frequency: "أسبوعي",
    city: "الدمام",
    businessName: "مخبز رغيف الشرقية",
    status: "active",
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 902,
    categoryId: 2,
    categoryName: "الشوكولاتة والكاكاو",
    title: "شوكولاتة داكنة للكيك",
    description: "نحتاج شوكولاتة بجودة ثابتة ونسبة كاكاو مرتفعة، مع إرفاق سعر الكرتون.",
    quantity: 80,
    unit: "كرتون",
    frequency: "شهري",
    city: "الخبر",
    businessName: "حلويات سما",
    status: "active",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 24 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 903,
    categoryId: 3,
    categoryName: "مواد التغليف",
    title: "علب كرتونية للحلويات",
    description: "علب بمقاسات متعددة مناسبة للتورتات والحلويات الشرقية.",
    quantity: 1200,
    unit: "كرتون",
    frequency: "مرة واحدة",
    city: "الظهران",
    businessName: "مخبز التنور العصري",
    status: "active",
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const previewContactMessage = [
  "السلام عليكم ورحمة الله وبركاته",
  "",
  "📢 طلب عرض سعر عبر دليل موردي المخابز والحلويات",
  "",
  "👤 المورد: مؤسسة مذاق الشرقية",
  "📞 رقم التواصل: \u2066+966 55 000 0000\u2069",
  "📍 مدينة المورد: الدمام",
  "",
  "━━━━━━━━━━━━━━━━━━━━",
  "🏢 اسم النشاط: مخبز رغيف الشرقية",
  "📦 الاحتياج: زبدة طبيعية للمخبوزات",
  "🗂️ التصنيف: الزبدة والسمن",
  "⚖️ الكمية: ٥٠٠ كيلو",
  "🔁 التكرار: أسبوعي",
  "📍 مدينة الطلب: الدمام",
  "📝 التفاصيل: نبحث عن زبدة طبيعية مناسبة للكرواسون والمعجنات، مع إمكانية التوريد الأسبوعي.",
  "━━━━━━━━━━━━━━━━━━━━",
  "",
  "نأمل تزويدنا بسعركم والتوفر المتوقع لهذا الاحتياج.",
].join("\n");

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function formatAge(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "تاريخ غير متاح";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "نُشر الآن";

  const units = [
    { seconds: 60 * 60 * 24 * 365, unit: "year" as const },
    { seconds: 60 * 60 * 24 * 30, unit: "month" as const },
    { seconds: 60 * 60 * 24, unit: "day" as const },
    { seconds: 60 * 60, unit: "hour" as const },
    { seconds: 60, unit: "minute" as const },
  ];
  const relative = new Intl.RelativeTimeFormat("ar-SA", { numeric: "auto" });
  const match = units.find(({ seconds: unitSeconds }) => seconds >= unitSeconds);
  if (!match) return "نُشر الآن";
  return relative.format(-Math.floor(seconds / match.seconds), match.unit);
}

function formatQuantity(value: number, unit: string) {
  return `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value)} ${unit}`;
}

function RequestCard({
  item,
  supplierView,
  contacting,
  contactError,
  onContact,
}: {
  item: Request;
  supplierView: boolean;
  contacting: boolean;
  contactError?: string;
  onContact: () => void;
}) {
  return (
    <article
      className="group relative overflow-hidden rounded-[1.4rem] border border-border/80 bg-card p-5 shadow-warm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-warm-lg md:p-6"
      data-testid={`card-request-${item.id}`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-primary/80" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-extrabold text-primary" data-testid={`text-request-business-${item.id}`}>
            <Store className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.businessName || "نشاط تجاري"}</span>
          </p>
          <h2 className="mt-2 text-xl font-extrabold leading-8 text-balance" data-testid={`text-request-title-${item.id}`}>
            {item.title}
          </h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid={`text-request-age-${item.id}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {formatAge(item.createdAt)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary" data-testid={`text-request-category-${item.id}`}>
          <Package className="h-3.5 w-3.5" />
          {item.categoryName}
        </span>
        <span className="rounded-full bg-accent/15 px-3 py-1.5 text-xs font-extrabold text-foreground" data-testid={`text-request-frequency-${item.id}`}>
          {item.frequency}
        </span>
      </div>

      <p className="mt-4 min-h-14 text-sm leading-7 text-muted-foreground" data-testid={`text-request-description-${item.id}`}>
        {item.description || "لا توجد تفاصيل إضافية."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-muted/45 p-3">
        <InfoCell label="الكمية المطلوبة" value={formatQuantity(item.quantity, item.unit)} />
        <InfoCell label="المدينة" value={item.city} icon={<MapPin className="h-3.5 w-3.5" />} />
      </div>

      {supplierView && (
        <div className="mt-5 border-t border-border/70 pt-4">
          <button
            type="button"
            onClick={onContact}
            disabled={contacting}
            data-testid={`button-contact-request-${item.id}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-warm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-52"
          >
            <MessageCircle className="h-4 w-4" />
            {contacting ? "جارٍ تجهيز الرسالة..." : "تواصل مع صاحب الطلب"}
          </button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">يفتح واتساب برسالة جاهزة للمراجعة؛ لا تُرسل تلقائياً.</p>
          {contactError && <p className="mt-2 text-sm font-bold text-destructive" role="alert">{contactError}</p>}
        </div>
      )}
    </article>
  );
}

function InfoCell({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="min-w-0 px-1">
      <p className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold">{value}</p>
    </div>
  );
}

function RequestsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="جارٍ تحميل الطلبات">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-72 animate-pulse rounded-[1.4rem] border bg-card/70 p-6">
          <div className="h-4 w-36 rounded bg-muted" />
          <div className="mt-4 h-7 w-3/4 rounded bg-muted" />
          <div className="mt-5 h-16 rounded bg-muted" />
          <div className="mt-5 h-14 rounded-2xl bg-muted" />
        </div>
      ))}
      <span className="sr-only">جارٍ تحميل الطلبات</span>
    </div>
  );
}

export default function RequestsPage() {
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [messagePreview, setMessagePreview] = useState("");
  const [contactError, setContactError] = useState<{ requestId: number; message: string } | null>(null);
  const [contactingId, setContactingId] = useState<number | null>(null);
  const isLoadingAuth = buyerLoading || supplierLoading;
  const previewKind = import.meta.env.DEV && typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("preview")
    : null;
  const previewMode = previewKind === "market" || previewKind === "message";
  const view = previewMode ? "supplier" : user ? "buyer" : supplier ? "supplier" : null;
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const filters = useMemo(() => ({
    categoryId: selectedCategory ? Number(selectedCategory) : undefined,
    city: selectedCity || undefined,
    q: debouncedSearch || undefined,
  }), [selectedCategory, selectedCity, debouncedSearch]);

  const requestKey = useMemo(
    () => [...getListRequestsQueryKey(filters), view, view === "buyer" ? user?.id : supplier?.id],
    [filters, view, user?.id, supplier?.id],
  );
  const requestsQuery = useListRequests(filters, {
    query: { enabled: !isLoadingAuth && !!view && !previewMode, queryKey: requestKey },
  });
  const categoriesQuery = useListItemCategories({
    query: { queryKey: getListItemCategoriesQueryKey(), enabled: !!view || previewMode },
  });
  const optionsQuery = useGetRequestOptions({
    query: { queryKey: getGetRequestOptionsQueryKey(), enabled: !!view || previewMode },
  });
  const contactMutation = useCreateSupplierRequestContact();

  const categoryOptions = categoriesQuery.data?.length
    ? categoriesQuery.data
    : previewMode
      ? previewRequests.map(({ categoryId, categoryName }) => ({ id: categoryId, name: categoryName }))
      : [];
  const cityOptions = optionsQuery.data?.cities?.length
    ? optionsQuery.data.cities
    : previewMode
      ? ["الدمام", "الخبر", "الظهران"]
      : [];
  const previewResults = previewRequests.filter((item) => {
    if (filters.categoryId && item.categoryId !== filters.categoryId) return false;
    if (filters.city && item.city !== filters.city) return false;
    if (filters.q) {
      const needle = filters.q.toLocaleLowerCase("ar");
      const searchable = [item.title, item.description, item.categoryName, item.businessName ?? "", item.city]
        .join(" ")
        .toLocaleLowerCase("ar");
      if (!searchable.includes(needle)) return false;
    }
    return true;
  });
  const requests = previewMode ? previewResults : requestsQuery.data ?? [];
  const pageTitle = view === "supplier" ? "طلبات السوق" : "احتياجاتي";

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("");
    setSelectedCity("");
  };

  const contactRequest = (requestId: number) => {
    setContactError(null);
    if (previewMode) {
      setMessagePreview(previewContactMessage);
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setContactError({ requestId, message: "اسمح بالنوافذ المنبثقة لفتح واتساب." });
      return;
    }
    setContactingId(requestId);
    contactMutation.mutate({ requestId }, {
      onSuccess: (result) => {
        setContactingId(null);
        if (result.simulated) {
          popup.close();
          setMessagePreview(result.message);
          return;
        }
        if (!result.whatsappUrl) {
          popup.close();
          setContactError({ requestId, message: "تعذر تجهيز رابط واتساب لهذا الطلب." });
          return;
        }
        popup.opener = null;
        popup.location.href = result.whatsappUrl;
      },
      onError: () => {
        setContactingId(null);
        popup.close();
        setContactError({ requestId, message: "تعذر تجهيز الرسالة. حاول مرة أخرى." });
      },
    });
  };

  if (previewKind === "message") {
    return <MessagePreview message={previewContactMessage} />;
  }

  return (
    <MainLayout>
      <section className="relative overflow-hidden border-b border-border/70 bg-secondary/35">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="container relative mx-auto px-4 py-8 md:py-11">
          <Link href="/" className="mb-5 inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground transition-colors hover:text-primary">
            <ArrowRight className="h-4 w-4" />
            العودة إلى الدليل
          </Link>
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
                <ClipboardList className="h-4 w-4" />
                سوق الاحتياج
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl" data-testid="heading-requests">
                {pageTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-8 text-muted-foreground md:text-base">
                {view === "supplier"
                  ? "تصفّح احتياجات المخابز ومحلات الحلويات، وابحث حسب الصنف والمدينة. يظهر اسم النشاط، بينما يبقى رقم التواصل خارج القائمة."
                  : "تابع احتياجات التوريد التي نشرتها لنشاطك، وراجع الطلبات أو صفِّها حسب الصنف والمدينة."}
              </p>
            </div>
            {view === "buyer" && user?.isOwner && (
              <Link href="/requests/new" data-testid="link-new-request-hero" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-extrabold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 hover:bg-primary/90">
                <Package className="h-5 w-5" />
                انشر احتياجاً
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto flex-1 px-4 py-7 md:py-9">
        {isLoadingAuth && !previewMode ? (
          <RequestsSkeleton />
        ) : !view ? (
          <AuthState />
        ) : (
          <>
            <section className="mb-6 rounded-[1.4rem] border border-border/80 bg-card p-4 shadow-warm md:p-5" aria-label="تصفية طلبات السوق">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-extrabold">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  ابحث عن احتياج
                </h2>
                {(search || selectedCategory || selectedCity) && (
                  <button type="button" onClick={clearFilters} data-testid="button-clear-request-filters" className="text-xs font-extrabold text-primary hover:underline">
                    مسح الفلاتر
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-12">
                <label className="relative block md:col-span-6">
                  <span className="sr-only">ابحث في الطلبات</span>
                  <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    maxLength={100}
                    placeholder="ابحث عن صنف أو نشاط أو تفاصيل..."
                    data-testid="input-request-search"
                    className="h-12 w-full rounded-xl border border-input bg-background pe-10 ps-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="relative md:col-span-3">
                  <span className="sr-only">التصنيف</span>
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    data-testid="select-request-filter-category"
                    className="h-12 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-10 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">جميع الأصناف</option>
                    {categoryOptions.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </label>
                <label className="relative md:col-span-3">
                  <span className="sr-only">المدينة</span>
                  <select
                    value={selectedCity}
                    onChange={(event) => setSelectedCity(event.target.value)}
                    data-testid="select-request-filter-city"
                    className="h-12 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-10 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">جميع المدن</option>
                    {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
                  </select>
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </label>
              </div>
              {!previewMode && (categoriesQuery.error || optionsQuery.error) && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs font-bold text-destructive" role="alert">
                  <span>تعذر تحميل خيارات التصنيف أو المدينة. يمكنك إعادة المحاولة.</span>
                  <button
                    type="button"
                    onClick={() => {
                      void categoriesQuery.refetch();
                      void optionsQuery.refetch();
                    }}
                    className="underline underline-offset-2"
                  >
                    إعادة تحميل الخيارات
                  </button>
                </div>
              )}
            </section>

            {isLoadingAuth && !previewMode ? (
              <RequestsSkeleton />
            ) : requestsQuery.isLoading && !previewMode ? (
              <RequestsSkeleton />
            ) : requestsQuery.error && !previewMode ? (
              <ErrorState onRetry={() => void requestsQuery.refetch()} />
            ) : requests.length === 0 ? (
              <EmptyState
                supplierView={view === "supplier"}
                owner={!!user?.isOwner}
                hasFilters={!!(search || selectedCategory || selectedCity)}
                onClear={clearFilters}
              />
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-muted-foreground" data-testid="text-request-count">
                    {new Intl.NumberFormat("ar-SA").format(requests.length)} {view === "supplier" ? "طلب متاح" : "طلب منشور"}
                  </p>
                  {view === "supplier" && (
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 text-success" />
                      أرقام التواصل لا تظهر في قائمة السوق
                    </span>
                  )}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {requests.map((item) => (
                    <RequestCard
                      key={item.id}
                      item={item}
                      supplierView={view === "supplier"}
                      contacting={contactingId === item.id && contactMutation.isPending}
                      contactError={contactError?.requestId === item.id ? contactError.message : undefined}
                      onContact={() => contactRequest(item.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {messagePreview && <MessageDialog message={messagePreview} onClose={() => setMessagePreview("")} />}
    </MainLayout>
  );
}

function AuthState() {
  return (
    <div className="mx-auto max-w-xl rounded-[1.5rem] border border-dashed border-primary/35 bg-primary/5 p-8 text-center md:p-12" data-testid="state-requests-auth">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold">سجّل الدخول لرؤية طلبات السوق</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">هذه المساحة مخصصة لأصحاب الأعمال والموردين المعتمدين.</p>
      <Link href="/login" data-testid="link-requests-login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2 font-extrabold text-primary-foreground">
        تسجيل الدخول
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-[1.5rem] border border-destructive/25 bg-destructive/5 p-8 text-center" role="alert" data-testid="state-requests-error">
      <AlertCircle className="mx-auto h-9 w-9 text-destructive" />
      <h2 className="mt-4 text-xl font-extrabold">تعذر تحميل الطلبات</h2>
      <p className="mt-2 text-sm text-muted-foreground">حدثت مشكلة مؤقتة. حاول تحديث القائمة مرة أخرى.</p>
      <button type="button" onClick={onRetry} data-testid="button-retry-requests" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2 font-extrabold text-destructive hover:bg-destructive/10">
        <RefreshCw className="h-4 w-4" />
        إعادة المحاولة
      </button>
    </div>
  );
}

function EmptyState({
  supplierView,
  owner,
  hasFilters,
  onClear,
}: {
  supplierView: boolean;
  owner: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-[1.5rem] border border-dashed border-border bg-card/70 p-8 text-center md:p-14" data-testid="state-requests-empty">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary">
        <ClipboardList className="h-8 w-8" />
      </div>
      <h2 className="mt-5 text-2xl font-extrabold">
        {hasFilters ? "لا توجد طلبات مطابقة" : supplierView ? "لا توجد طلبات نشطة الآن" : "لم تنشر أي احتياج بعد"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
        {hasFilters
          ? "جرّب تغيير كلمات البحث أو اختيار مدينة وصنف آخر."
          : supplierView
            ? "عُد لاحقاً؛ تظهر هنا الطلبات النشطة التي يمكن لموردي الدليل خدمتها."
            : "صف ما تحتاجه من مكونات أو مواد تغليف، ودع الموردين المعتمدين يطلعون عليه."}
      </p>
      {hasFilters && (
        <button type="button" onClick={onClear} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 px-5 py-2 font-extrabold text-primary hover:bg-primary/5">
          <X className="h-4 w-4" />
          مسح الفلاتر
        </button>
      )}
      {!hasFilters && !supplierView && owner && (
        <Link href="/requests/new" data-testid="link-new-request-empty" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 font-extrabold text-primary-foreground">
          <Package className="h-4 w-4" />
          انشر أول احتياج
        </Link>
      )}
      {!hasFilters && !supplierView && !owner && <p className="mt-5 text-xs font-bold text-warning">النشر متاح لحسابات أصحاب الأعمال فقط.</p>}
    </div>
  );
}

function MessageDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="contact-message-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 p-5">
          <div>
            <h2 id="contact-message-title" className="font-extrabold">الرسالة الجاهزة</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">وضع المعاينة لا يفتح واتساب ولا يرسل الرسالة.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق المعاينة" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-5">
          <pre dir="auto" className="whitespace-pre-wrap break-words rounded-xl bg-muted/55 p-4 text-sm leading-7 font-sans">{message}</pre>
        </div>
        <div className="flex justify-end border-t border-border/70 p-4">
          <button type="button" onClick={onClose} className="min-h-10 rounded-xl bg-primary px-5 py-2 text-sm font-extrabold text-primary-foreground hover:bg-primary/90">
            إغلاق
          </button>
        </div>
      </section>
    </div>
  );
}

function MessagePreview({ message }: { message: string }) {
  return (
    <MainLayout>
      <section className="container mx-auto flex flex-1 flex-col px-4 py-8 md:py-12">
        <Link href="/requests?preview=market" className="mb-5 inline-flex items-center gap-2 text-sm font-extrabold text-primary hover:underline">
          <ArrowRight className="h-4 w-4" />
          العودة إلى طلبات السوق
        </Link>
        <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-border shadow-warm-lg">
          <header className="flex items-center justify-between bg-[#5d473b] px-5 py-4 text-primary-foreground">
            <div>
              <p className="text-xs font-bold opacity-80">دليل موردي المخابز والحلويات</p>
              <h1 className="mt-1 text-lg font-extrabold">رسالة واتساب جاهزة</h1>
            </div>
            <MessageCircle className="h-6 w-6" />
          </header>
          <div className="bg-[#efe9df] p-4 sm:p-7">
            <div className="max-w-[95%] rounded-2xl rounded-tr-sm border border-black/5 bg-white p-4 shadow-sm sm:p-6">
              <pre dir="auto" className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#302920]">{message}</pre>
              <p className="mt-4 border-t border-border/70 pt-3 text-[11px] font-semibold leading-5 text-muted-foreground">
                معاينة توضح بيانات المورد، اسم النشاط، تفاصيل الاحتياج وطلب عرض السعر.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}