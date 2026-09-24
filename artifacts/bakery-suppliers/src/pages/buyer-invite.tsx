import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "wouter";
import { AlertCircle, CheckCircle2, LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getGetBuyerInvitationQueryKey, useActivateBuyerInvitation, useGetBuyerInvitation } from "@workspace/api-client-react";

type FormState = { password: string; confirmation: string; email: string; newsletterWeekly: boolean; buyersGroup: boolean; termsAccepted: boolean };

export default function BuyerInvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const invite = useGetBuyerInvitation(token, { query: { enabled: Boolean(token), queryKey: getGetBuyerInvitationQueryKey(token) } });
  const activate = useActivateBuyerInvitation();
  const [form, setForm] = useState<FormState>({ password: "", confirmation: "", email: "", newsletterWeekly: false, buyersGroup: false, termsAccepted: false });
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState("");
  const passwordMismatch = form.confirmation.length > 0 && form.password !== form.confirmation;
  const errorMessage = useMemo(() => invite.error instanceof Error ? invite.error.message : "تعذر فتح رابط الدعوة.", [invite.error]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setLocalError("");
    if (form.password !== form.confirmation) { setLocalError("تأكد من تطابق كلمتي المرور."); return; }
    if (!form.termsAccepted) { setLocalError("يجب الموافقة على الشروط لإكمال التفعيل."); return; }
    activate.mutate({ token, data: { password: form.password, email: form.email.trim(), newsletterWeekly: form.newsletterWeekly, buyersGroup: form.buyersGroup, termsAccepted: true } }, {
      onSuccess: () => setSubmitted(true),
      onError: (error) => setLocalError(error instanceof Error ? error.message : "تعذر إنشاء الحساب. حاول مرة أخرى."),
    });
  };
  return <MainLayout><main dir="rtl" className="min-h-[calc(100dvh-5rem)] px-4 py-10 md:py-16"><div className="mx-auto max-w-2xl">
    <header className="mb-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-warm"><Store className="h-7 w-7" /></div><p data-testid="text-buyer-invite-kicker" className="mb-2 text-sm font-bold text-primary">دعوة خاصة إلى دليل موردي المخابز والحلويات</p><h1 data-testid="text-buyer-invite-title" className="text-3xl font-extrabold md:text-4xl">فعّل حساب منشأتك</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">أنشئ كلمة مرور للوصول إلى دليل الموردين والتواصل المباشر دون وسيط أو عمولة.</p></header>
    {invite.isLoading && <div data-testid="loading-buyer-invite" className="space-y-4 rounded-2xl border bg-card p-6"><div className="h-6 w-1/2 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-12 animate-pulse rounded-xl bg-muted" /></div>}
    {invite.isError && <StateCard kind="error" title="الرابط غير صالح أو منتهي" body={errorMessage} />}
    {invite.data?.alreadyActivated && <StateCard kind="complete" title="تم تفعيل هذه الدعوة مسبقاً" body="هذا الرابط لم يعد متاحاً لتفعيل حساب جديد. استخدم تسجيل الدخول للوصول إلى حسابك." />}
    {submitted && <StateCard kind="success" title="تم إنشاء حسابك بنجاح" body="يمكنك الآن تسجيل الدخول والوصول إلى دليل الموردين. لم يتم إرسال رسالة واتساب تلقائياً." />}
    {invite.data && !invite.data.alreadyActivated && !submitted && <form data-testid="form-buyer-activation" onSubmit={submit} className="space-y-5">
      <section data-testid="panel-buyer-invite-business" className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-secondary p-2.5 text-primary"><UserRound className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold">تفاصيل الدعوة</h2><p className="text-sm text-muted-foreground">تأكد أن هذه البيانات تخص منشأتك.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><Detail data-testid="text-buyer-invite-full-name" label="الاسم" value={invite.data.fullName} /><Detail data-testid="text-buyer-invite-business-name" label="المنشأة" value={invite.data.businessName} /><Detail data-testid="text-buyer-invite-business-type" label="النشاط" value={invite.data.businessType} /><Detail data-testid="text-buyer-invite-city" label="المدينة" value={invite.data.city} /></div></section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><LockKeyhole className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold">بيانات الدخول</h2><p className="text-sm text-muted-foreground">استخدم كلمة مرور من 6 أحرف أو أرقام على الأقل.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-bold">كلمة المرور</span><input data-testid="input-buyer-activation-password" type="password" minLength={6} maxLength={128} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-12 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">تأكيد كلمة المرور</span><input data-testid="input-buyer-activation-confirmation" type="password" minLength={6} maxLength={128} required aria-invalid={passwordMismatch} value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} className={`h-12 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${passwordMismatch ? "border-destructive" : ""}`} />{passwordMismatch && <span data-testid="status-buyer-activation-password-mismatch" className="mt-1 block text-xs text-destructive">كلمتا المرور غير متطابقتين.</span>}</label><label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-bold">البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span></span><input data-testid="input-buyer-activation-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-12 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label></div></section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><h2 className="text-lg font-extrabold">اختيارات التواصل</h2><p className="mt-1 text-sm text-muted-foreground">اختيارات اختيارية ويمكن تعديلها حسب تفضيلاتك.</p><div className="mt-4 space-y-3"><Check data-testid="checkbox-buyer-activation-newsletter" checked={form.newsletterWeekly} onChange={(checked) => setForm({ ...form, newsletterWeekly: checked })} label="أرغب في النشرة الأسبوعية لأخبار وأسعار القطاع" /><Check data-testid="checkbox-buyer-activation-group" checked={form.buyersGroup} onChange={(checked) => setForm({ ...form, buyersGroup: checked })} label="أرغب في الانضمام إلى مجموعة أصحاب الأعمال" /></div></section>
      <label data-testid="label-buyer-activation-terms" className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm"><input data-testid="checkbox-buyer-activation-terms" type="checkbox" required checked={form.termsAccepted} onChange={(event) => setForm({ ...form, termsAccepted: event.target.checked })} className="mt-1 h-4 w-4 accent-primary" /><span>أوافق على <a data-testid="link-buyer-activation-terms" href="/terms" target="_blank" rel="noreferrer" className="font-bold text-primary underline">الشروط والأحكام</a> وسياسة استخدام الدليل.</span></label>
      {(localError || activate.isError) && <p data-testid="status-buyer-activation-error" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{localError || "تعذر إكمال التفعيل."}</p>}
      <button data-testid="button-submit-buyer-activation" type="submit" disabled={activate.isPending || passwordMismatch || !form.termsAccepted} className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">{activate.isPending ? "جاري إنشاء الحساب..." : "إنشاء حسابي"}</button><p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> حسابك محمي، ولا تُرسل رسالة واتساب من الموقع بعد التفعيل.</p>
    </form>}
  </div></main></MainLayout>;
}

function Detail({ label, value, "data-testid": testId }: { label: string; value: string; "data-testid": string }) {
  return <div data-testid={testId}><span className="block text-xs text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}
function Check({ checked, onChange, label, "data-testid": testId }: { checked: boolean; onChange: (value: boolean) => void; label: string; "data-testid": string }) {
  return <label data-testid={testId} className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" />{label}</label>;
}
function StateCard({ kind, title, body }: { kind: "error" | "complete" | "success"; title: string; body: string }) {
  const success = kind === "success";
  return <div data-testid={`state-buyer-invite-${kind}`} className="rounded-2xl border bg-card p-8 text-center shadow-sm md:p-12"><div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${success ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{success ? <CheckCircle2 className="h-9 w-9" /> : <AlertCircle className="h-8 w-8" />}</div><h2 className="text-2xl font-extrabold">{title}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">{body}</p></div>;
}