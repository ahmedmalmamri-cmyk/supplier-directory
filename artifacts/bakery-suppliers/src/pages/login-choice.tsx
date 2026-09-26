import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BriefcaseBusiness, Eye, EyeOff, LockKeyhole, Store } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

type Role = "buyer" | "supplier";

export default function LoginPage({ preferredRole }: { preferredRole?: Role } = {}) {
  const [, navigate] = useLocation();
  const { isLoading: buyerLoading, refresh: refreshBuyer } = useBuyerAuth();
  const { isLoading: supplierLoading, refresh: refreshSupplier } = useSupplierAuth();
  const queryRole = new URLSearchParams(window.location.search).get("role");
  const [role, setRole] = useState<Role>(preferredRole ?? (queryRole === "supplier" ? "supplier" : "buyer"));
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checking = role === "buyer" ? buyerLoading : supplierLoading;

  const selectRole = (next: Role) => {
    if (submitting) return;
    setRole(next);
    setIdentifier("");
    setPassword("");
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(role === "buyer" ? "/api/buyer/login" : "/api/supplier/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(role === "buyer"
          ? { identifier: identifier.trim(), password, rememberMe }
          : { phone: identifier.trim(), password, rememberMe }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; user?: unknown; supplier?: unknown };
      if (!response.ok) throw new Error(result.error || "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.");
      if (role === "buyer" ? !result.user : !result.supplier) throw new Error("تعذر تأكيد الحساب. حاول مرة أخرى.");
      // Login can clear the other role's cookie; reconcile both contexts before routing.
      const [confirmedBuyer, confirmedSupplier] = await Promise.all([refreshBuyer(), refreshSupplier()]);
      if (role === "buyer") {
        if (!confirmedBuyer) throw new Error("تعذر تحميل حسابك. حاول مرة أخرى.");
        navigate("/buyer/profile");
      } else {
        if (!confirmedSupplier) throw new Error("تعذر تحميل حساب المورد. حاول مرة أخرى.");
        navigate("/supplier/portal");
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "تعذر الاتصال. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return <MainLayout>
    <div className="relative flex flex-1 items-center overflow-hidden bg-background px-4 py-10 md:py-16">
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-secondary/40 blur-3xl" />
      <div className="container relative mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-warm lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-4 py-1.5 text-xs font-bold">دليل موردي المخابز والحلويات</span>
            <h2 className="mt-16 max-w-sm text-4xl font-extrabold leading-[1.5]">مكان واحد<br />لكل ما يحتاجه نشاطك.</h2>
            <p className="mt-6 max-w-xs text-sm leading-8 text-primary-foreground/80">حسابك يقرّبك من الموردين، والطلبات، وفرص التعاون التي تهمك فعلاً.</p>
          </div>
          <div className="border-t border-primary-foreground/25 pt-5 text-sm text-primary-foreground/75">مرحباً بعودتك إلى الدليل</div>
        </aside>
        <section className="px-5 py-8 sm:px-10 sm:py-11 lg:px-14" aria-labelledby="login-title">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/50 text-primary"><LockKeyhole className="h-6 w-6" /></div>
          <p className="mb-2 text-xs font-extrabold text-primary">العودة إلى حسابك</p>
          <h1 id="login-title" className="text-3xl font-extrabold tracking-tight sm:text-4xl">تسجيل الدخول</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">اختر نوع حسابك وأدخل بيانات الدخول للمتابعة.</p>

          <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl bg-muted/65 p-1.5" role="group" aria-label="نوع الحساب">
            <button data-testid="button-role-buyer" type="button" disabled={submitting} aria-pressed={role === "buyer"} onClick={() => selectRole("buyer")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold transition-colors disabled:opacity-60 ${role === "buyer" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><BriefcaseBusiness className="h-4 w-4" /> صاحب عمل</button>
            <button data-testid="button-role-supplier" type="button" disabled={submitting} aria-pressed={role === "supplier"} onClick={() => selectRole("supplier")} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold transition-colors disabled:opacity-60 ${role === "supplier" ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Store className="h-4 w-4" /> مورد</button>
          </div>
          {checking ? <div role="status" className="mt-8 space-y-4 animate-pulse"><div className="h-5 w-36 rounded bg-muted" /><div className="h-12 rounded-xl bg-muted" /><div className="h-5 w-28 rounded bg-muted" /><div className="h-12 rounded-xl bg-muted" /></div> : <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="login-identifier" className="mb-2 block text-sm font-bold">{role === "buyer" ? "رقم الجوال أو البريد الإلكتروني" : "رقم الجوال المسجل"}</label>
              <input id="login-identifier" data-testid="input-login-identifier" type="text" dir="ltr" inputMode={role === "supplier" ? "tel" : "text"} autoComplete="username" placeholder={role === "supplier" ? "05XXXXXXXX" : "05XXXXXXXX / name@example.com"} required value={identifier} onChange={(event) => setIdentifier(event.target.value)} disabled={submitting} className="h-12 w-full rounded-xl border border-input bg-background px-4 text-left outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" />
              {role === "supplier" && <p className="mt-2 text-xs leading-6 text-muted-foreground">حساب المورد مرتبط برقم الجوال المسجل، وليس بالبريد الإلكتروني.</p>}
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block text-sm font-bold">كلمة المرور</label>
              <div className="relative">
                <input id="login-password" data-testid="input-login-password" type={showPassword ? "text" : "password"} dir="ltr" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} className="h-12 w-full rounded-xl border border-input bg-background px-4 pl-12 text-left outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60" />
                <button data-testid="button-toggle-password" type="button" disabled={submitting} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="absolute left-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold"><input data-testid="checkbox-remember-me" type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={submitting} className="h-4 w-4 accent-primary" /> تذكرني</label>
            {error && <p role="alert" data-testid="status-login-error" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}
            <button data-testid="button-submit-login" type="submit" disabled={submitting || !identifier.trim() || !password} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55">{submitting ? "جاري التحقق..." : <>دخول الحساب <ArrowLeft className="h-4 w-4" /></>}</button>
          </form>}
          <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
            ليس لديك حساب؟ <Link data-testid="link-login-register" href={role === "buyer" ? "/register/buyer" : "/register/supplier"} className="font-extrabold text-primary hover:underline">أنشئ حساباً جديداً</Link>
          </div>
        </section>
      </div>
    </div>
  </MainLayout>;
}