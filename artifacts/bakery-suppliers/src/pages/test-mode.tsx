import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileText, LockKeyhole, LogIn, RefreshCw, ShieldCheck, ShoppingCart, Store, XCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

type TestRole = "buyer";
type TestModeView = "home" | "report";
type BuyerPreview = { available: boolean; name: string | null; route: "/buyer/profile" | "/buyer/login" };
type TestReport = {
  generatedAt: string;
  summary: { passed: number; warnings: number; failed: number };
  checks: Array<{ key: string; label: string; status: "pass" | "warning" | "fail"; detail: string }>;
};
type Overview = { buyerPreview: BuyerPreview; report: TestReport };

class AdminRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.error === "string"
      ? body.error
      : body && typeof body.message === "string"
        ? body.message
        : "تعذر إتمام الطلب الآن.";
    throw new AdminRequestError(response.status, message);
  }
  return body as T;
}

function formatArabicDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function TestModePage({ view = "home" }: { view?: TestModeView }) {
  const [, navigate] = useLocation();
  const buyerAuth = useBuyerAuth();
  const supplierAuth = useSupplierAuth();
  const [authState, setAuthState] = useState<"checking" | "unauthenticated" | "authenticated">("checking");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [startingRole, setStartingRole] = useState<TestRole | null>(null);

  const loadAdminData = async (requestedView: TestModeView = view) => {
    setIsLoading(true);
    setError("");
    try {
      if (requestedView === "report") {
        const nextReport = await adminRequest<TestReport>("/api/admin/test-mode/report");
        setReport(nextReport);
      } else {
        const nextOverview = await adminRequest<Overview>("/api/admin/test-mode");
        setOverview(nextOverview);
        setReport(nextOverview.report);
      }
      setAuthState("authenticated");
    } catch (requestError) {
      if (requestError instanceof AdminRequestError && requestError.status === 401) {
        setAuthState("unauthenticated");
        setOverview(null);
        setReport(null);
      } else {
        setAuthState("authenticated");
        setError(requestError instanceof Error ? requestError.message : "تعذر تحميل بيانات وضع المعاينة.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData(view);
  }, [view]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError("");
    setError("");
    try {
      await adminRequest<{ success: true }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await loadAdminData(view);
    } catch (loginRequestError) {
      if (loginRequestError instanceof AdminRequestError && loginRequestError.status === 401) {
        setLoginError("كلمة المرور غير صحيحة. حاول مرة أخرى.");
      } else if (loginRequestError instanceof AdminRequestError && loginRequestError.status === 429) {
        setLoginError("تكررت محاولات الدخول كثيراً. انتظر قليلاً ثم حاول مرة أخرى.");
      } else {
        setLoginError("تعذر تسجيل الدخول الآن. تحقق من الاتصال وحاول مرة أخرى.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const startAccount = async (role: TestRole) => {
    if (startingRole) return;
    setStartingRole(role);
    setError("");
    try {
      const result = await adminRequest<{ success: true; role: TestRole; redirectPath: string }>("/api/admin/test-mode/start", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      await Promise.all([buyerAuth.refresh(), supplierAuth.refresh()]);
      navigate(result.redirectPath);
    } catch (startError) {
      if (startError instanceof AdminRequestError && startError.status === 401) {
        setAuthState("unauthenticated");
        setError("انتهت جلسة المدير. سجّل الدخول مجدداً للمتابعة.");
      } else {
        setError(startError instanceof Error ? startError.message : "تعذر فتح حساب المعاينة.");
      }
    } finally {
      setStartingRole(null);
    }
  };

  return (
    <MainLayout>
      <section className="border-b bg-secondary/25">
        <div className="container mx-auto max-w-7xl px-4 py-10 md:py-14">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1.5 text-xs font-extrabold text-primary">
                <ShieldCheck className="h-4 w-4" />
                مساحة فحص محمية للمدير
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
                اختبر تجربة الدليل
                <span className="block text-primary">من دون أثر تجاري</span>
              </h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                أُلغي حساب المورد التجريبي. يمكنك معاينة واجهة صاحب العمل بحسابك الحالي، وتسجيل مورد حقيقي لاحقاً بعد تجهيز بياناته.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm shadow-warm">
              <LockKeyhole className="h-5 w-5 text-primary" />
              <span className="font-bold">وضع اختبار فقط</span>
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-label="الخدمة متاحة" />
            </div>
          </div>
          <nav className="mt-8 flex flex-wrap items-center gap-2 border-t pt-4 text-sm font-bold" aria-label="تنقل وضع المعاينة">
            <Link href="/test-mode" data-testid="link-test-mode-home" className={`rounded-lg px-3 py-2 ${view === "home" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}>
              المعاينة
            </Link>
            <Link href="/test-mode/report" data-testid="link-test-mode-report" className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${view === "report" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}>
              <FileText className="h-4 w-4" />
              تقرير الفحص
            </Link>
          </nav>
        </div>
      </section>

      <main className="container mx-auto max-w-7xl flex-1 px-4 py-8 md:py-12">
        {authState === "checking" || isLoading ? <LoadingState /> : authState === "unauthenticated" ? (
          <AdminGate password={password} setPassword={setPassword} onSubmit={login} isSubmitting={isLoggingIn} error={loginError} />
        ) : view === "report" ? (
          <ReportView report={report} error={error} onRetry={() => void loadAdminData("report")} />
        ) : (
          <HomeView overview={overview} error={error} startingRole={startingRole} onStart={startAccount} onRetry={() => void loadAdminData("home")} />
        )}
      </main>
    </MainLayout>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5" role="status" aria-label="جاري تحميل وضع المعاينة" data-testid="status-test-mode-loading">
      <div className="h-7 w-44 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="h-56 animate-pulse rounded-3xl bg-muted" />
        <div className="h-56 animate-pulse rounded-3xl bg-muted" />
      </div>
    </div>
  );
}

function AdminGate({ password, setPassword, onSubmit, isSubmitting, error }: { password: string; setPassword: (value: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; isSubmitting: boolean; error: string }) {
  return (
    <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-warm-lg md:grid-cols-[.8fr_1.2fr]">
      <div className="bg-primary p-7 text-primary-foreground md:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-foreground/15"><ShieldCheck className="h-6 w-6" /></div>
        <h2 className="mt-7 text-2xl font-extrabold">هذه المساحة للمدير فقط</h2>
        <p className="mt-3 text-sm leading-7 text-primary-foreground/80">تحقق من هويتك لفتح الحسابات الاختبارية وتقرير الفحص. لا نعرض كلمة المرور ولا نحتفظ بها في الصفحة.</p>
        <Link href="/admin" data-testid="link-test-mode-admin" className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold underline underline-offset-4">
          الانتقال إلى لوحة الإدارة
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      <form onSubmit={onSubmit} className="p-7 md:p-9">
        <div className="flex items-center gap-2 text-xs font-extrabold text-primary"><LockKeyhole className="h-4 w-4" /> بوابة المدير</div>
        <h2 className="mt-3 text-2xl font-extrabold">تسجيل الدخول للمتابعة</h2>
        <p className="mt-2 text-sm text-muted-foreground">استخدم كلمة مرور المدير الحالية للوصول إلى وضع المعاينة.</p>
        <label htmlFor="test-mode-password" className="mt-7 block text-sm font-extrabold">كلمة مرور المدير</label>
        <input
          id="test-mode-password"
          data-testid="input-test-mode-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "test-mode-login-error" : undefined}
          className="mt-2 h-12 w-full rounded-xl border bg-background px-4 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button type="submit" data-testid="button-test-mode-login" disabled={isSubmitting || !password} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          <LogIn className="h-4 w-4" />
          {isSubmitting ? "جارٍ التحقق..." : "فتح وضع المعاينة"}
        </button>
        {error && <p id="test-mode-login-error" role="alert" data-testid="status-test-mode-login-error" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}
      </form>
    </div>
  );
}

function HomeView({ overview, error, startingRole, onStart, onRetry }: { overview: Overview | null; error: string; startingRole: TestRole | null; onStart: (role: TestRole) => void; onRetry: () => void }) {
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">المعاينة المتاحة</p><h2 className="mt-2 text-2xl font-extrabold md:text-3xl">افحص واجهة صاحب العمل</h2></div>
         <p className="max-w-md text-sm leading-7 text-muted-foreground">لا يوجد حساب مورد تجريبي. يمكنك تسجيل مورد حقيقي لاحقاً ببيانات نشاطه الفعلية.</p>
      </div>
      {error && <ErrorNotice message={error} onRetry={onRetry} />}
      <div className="grid gap-5 md:grid-cols-2">
        {overview?.buyerPreview && <BuyerPreviewCard preview={overview.buyerPreview} isStarting={startingRole === "buyer"} onStart={() => onStart("buyer")} />}
        <article className="rounded-3xl border bg-card p-6 shadow-warm md:p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store className="h-6 w-6" /></div>
          <h3 className="mt-6 text-xl font-extrabold">حساب المورد الحقيقي لاحقاً</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">أُلغي حساب المورد التجريبي ولن يُنشأ مجدداً. عند جاهزية بيانات المورد الحقيقي، قدّم طلب التسجيل، وبعد موافقة المدير يمكن تفعيل حسابه.</p>
          <Link href="/register/supplier" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 px-4 py-2 text-sm font-extrabold text-primary hover:bg-primary/5">تسجيل مورد حقيقي <ArrowLeft className="h-4 w-4" /></Link>
        </article>
      </div>
      <section className="grid gap-4 rounded-3xl border border-primary/15 bg-primary/[0.06] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-7" aria-labelledby="test-mode-guardrails">
        <div className="flex gap-3"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h2 id="test-mode-guardrails" className="font-extrabold">حدود البيئة الاختبارية</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">زر التواصل لا يفتح واتساب، وأي نشاط تجريبي لا يُحفظ في سجلات النشاط التجاري. يمكنك العودة إلى هذه الصفحة في أي وقت.</p></div></div>
        <Link href="/test-mode/report" data-testid="link-test-mode-report-cta" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-card px-4 text-sm font-extrabold text-primary shadow-sm hover:bg-primary hover:text-primary-foreground">عرض تقرير الفحص <ArrowLeft className="h-4 w-4" /></Link>
      </section>
    </div>
  );
}

function BuyerPreviewCard({ preview, isStarting, onStart }: { preview: BuyerPreview; isStarting: boolean; onStart: () => void }) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-accent/35 bg-card p-6 shadow-warm md:p-7" data-testid="card-existing-buyer-preview">
      <div className="absolute inset-x-0 top-0 h-1 bg-accent" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/20 text-gold-ink"><ShoppingCart className="h-6 w-6" /></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground" data-testid="status-existing-buyer-preview">
          <ShieldCheck className="h-3.5 w-3.5" />
          حسابك الحالي
        </span>
      </div>
      <p className="mt-6 text-xs font-extrabold text-muted-foreground">معاينة شاشة صاحب العمل</p>
      <h3 className="mt-1 text-2xl font-extrabold" data-testid="text-existing-buyer-name">{preview.available && preview.name ? preview.name : "استخدم حسابك الحالي"}</h3>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        لا يوجد حساب صاحب عمل تجريبي. عند توفر جلسة صاحب العمل في هذا المتصفح، ستفتح المعاينة بحسابك الحالي فقط.
      </p>
      {preview.available ? (
        <button type="button" onClick={onStart} disabled={isStarting} data-testid="button-start-existing-buyer-preview" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
          {isStarting ? "جارٍ فتح حسابك..." : "المتابعة بحسابي الحالي"}
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : (
        <Link href="/buyer/login" data-testid="link-existing-buyer-login" className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 px-4 font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
          تسجيل الدخول بحساب صاحب العمل
          <ArrowLeft className="h-4 w-4" />
        </Link>
      )}
    </article>
  );
}

function ReportView({ report, error, onRetry }: { report: TestReport | null; error: string; onRetry: () => void }) {
  if (error || !report) return <ErrorNotice message={error || "لم يصل تقرير الفحص بعد."} onRetry={onRetry} />;
  const summaryItems = [
    { key: "passed", label: "فحوصات ناجحة", value: report.summary.passed, icon: CheckCircle2, tone: "text-success bg-success/10" },
    { key: "warnings", label: "تحتاج انتباهاً", value: report.summary.warnings, icon: AlertTriangle, tone: "text-warning bg-warning/10" },
    { key: "failed", label: "فحوصات متعثرة", value: report.summary.failed, icon: XCircle, tone: "text-destructive bg-destructive/10" },
  ] as const;
  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">تقرير حي</p><h2 className="mt-2 text-2xl font-extrabold md:text-3xl">نتيجة فحص وضع المعاينة</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />آخر توليد: <time dateTime={report.generatedAt} data-testid="text-test-report-generated-at">{formatArabicDate(report.generatedAt)}</time></p></div><Link href="/test-mode" data-testid="link-test-mode-return" className="inline-flex items-center gap-2 text-sm font-extrabold text-primary hover:underline"><ArrowLeft className="h-4 w-4" />العودة للمعاينة</Link></div>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="ملخص الفحص">
        {summaryItems.map(({ key, label, value, icon: Icon, tone }) => <div key={key} className="rounded-2xl border bg-card p-5 shadow-warm"><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-sm font-bold text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-extrabold" data-testid={`text-test-report-summary-${key}`}>{value}</p></div>)}
      </section>
      <section className="overflow-hidden rounded-3xl border bg-card shadow-warm" aria-labelledby="test-report-checks">
        <div className="border-b p-5 md:p-7"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-primary" /><h2 id="test-report-checks" className="text-xl font-extrabold">تفاصيل الفحوصات</h2></div><p className="mt-1 text-sm text-muted-foreground">النتائج التالية قادمة من آخر فحص فعلي للبيئة.</p></div>
        <div className="divide-y">
          {report.checks.length ? report.checks.map((check) => <CheckRow key={check.key} check={check} />) : <div className="p-8 text-center text-sm text-muted-foreground" data-testid="empty-test-report-checks">لا توجد فحوصات في هذا التقرير.</div>}
        </div>
      </section>
    </div>
  );
}

function CheckRow({ check }: { check: TestReport["checks"][number] }) {
  const config = check.status === "pass"
    ? { label: "ناجح", icon: CheckCircle2, style: "bg-success/10 text-success" }
    : check.status === "warning"
      ? { label: "تنبيه", icon: AlertTriangle, style: "bg-warning/10 text-warning" }
      : { label: "متعثر", icon: XCircle, style: "bg-destructive/10 text-destructive" };
  const Icon = config.icon;
  return <article className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between md:gap-6 md:p-6" data-testid={`row-test-report-check-${check.key}`}><div className="min-w-0"><h3 className="font-extrabold" data-testid={`text-test-report-check-label-${check.key}`}>{check.label}</h3><p className="mt-1 text-sm leading-7 text-muted-foreground" data-testid={`text-test-report-check-detail-${check.key}`}>{check.detail}</p></div><span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${config.style}`} data-testid={`status-test-report-check-${check.key}`}><Icon className="h-4 w-4" />{config.label}</span></article>;
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5" role="alert" data-testid="status-test-mode-error"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-extrabold text-destructive">{message}</p><button type="button" onClick={onRetry} data-testid="button-retry-test-mode" className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-destructive underline underline-offset-4"><RefreshCw className="h-4 w-4" />إعادة المحاولة</button></div></div></div>;
}