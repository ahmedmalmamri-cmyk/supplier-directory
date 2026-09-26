import { MainLayout } from "@/components/layout/MainLayout";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Eye, LogOut, MessageCircle, ShieldCheck, Store, TrendingUp, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSupplierAuth } from "@/lib/supplier-auth";

type Supplier = { id: number; name: string; city: string; phone: string; whatsapp: string; isVerified: boolean };
type Contact = { id: number; message: string; messageId: string; sentAt: string; buyerId: number; buyerName: string; buyerPhone: string; businessName: string | null; businessType: string; buyerStatus: string; reportId: number | null; reportStatus: string | null };
type SupplierAnalytics = { totalContacts: number; uniqueBuyers: number; contacts30d: number; qualifiedContacts30d: number; pageViews30d: number; totalPageViews: number; contactRate30d: number; monthly: Array<{ month: string; contactRequests: number; uniqueBuyers: number }> };

const reportReasons = ["إساءة أو إزعاج", "بيانات غير صحيحة", "طلب مخالف", "احتيال أو انتحال", "أخرى"];
const statusLabels: Record<string, string> = { active: "نشط", under_review: "قيد المراجعة", restricted: "مقيّد", suspended: "موقوف", blocked: "محظور" };

export default function SupplierPortalPage() {
  const [, navigate] = useLocation();
  const { logout: logoutSupplier } = useSupplierAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [analytics, setAnalytics] = useState<SupplierAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState<Contact | null>(null);
  const [reason, setReason] = useState(reportReasons[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [meResponse, contactsResponse, analyticsResponse] = await Promise.all([
        fetch("/api/supplier/me", { credentials: "same-origin" }),
        fetch("/api/supplier/contacts", { credentials: "same-origin" }),
        fetch("/api/supplier/analytics", { credentials: "same-origin" }),
      ]);
      if (meResponse.status === 401 || contactsResponse.status === 401 || analyticsResponse.status === 401) {
        navigate("/supplier/login");
        return;
      }
      const me = await meResponse.json() as { supplier?: Supplier; error?: string };
      const contactList = await contactsResponse.json() as Contact[] | { error?: string };
      const analyticsData = await analyticsResponse.json() as SupplierAnalytics | { error?: string };
      if (!meResponse.ok || !me.supplier || !Array.isArray(contactList) || !analyticsResponse.ok || !("monthly" in analyticsData)) throw new Error(me.error || "تعذر تحميل لوحة المورد.");
      setSupplier(me.supplier);
      setContacts(contactList);
      setAnalytics(analyticsData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submitReport = async () => {
    if (!reporting) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/supplier/reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactLogId: reporting.id, reason, note }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر رفع البلاغ.");
      setReporting(null);
      setNote("");
      await load();
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "تعذر رفع البلاغ.");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      await logoutSupplier();
      navigate("/supplier/login");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "تعذر تسجيل الخروج.");
    }
  };

  return <MainLayout>
    <div className="border-b bg-secondary/10 py-10"><div className="container mx-auto px-4"><div className="flex items-center gap-2 text-primary"><Store className="h-5 w-5" /><span className="font-bold">مساحة المورد</span></div><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-extrabold md:text-4xl">{supplier?.name || "لوحة المورد"}</h1><p className="mt-2 text-muted-foreground">مراجعة التواصل ورفع البلاغات للإدارة فقط.</p></div><button type="button" onClick={() => void logout()} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold hover:bg-muted"><LogOut className="h-4 w-4" /> تسجيل الخروج</button></div></div></div>
    <div className="container mx-auto max-w-5xl px-4 py-10">
      {error && <div className="mb-5 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</div>}
       <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={<MessageCircle className="h-5 w-5 text-primary" />} value={analytics?.qualifiedContacts30d ?? 0} label="فرص تواصل مؤهلة · آخر 30 يوماً" /><MetricCard icon={<Eye className="h-5 w-5 text-primary" />} value={analytics?.pageViews30d ?? 0} label="زيارات الملف · آخر 30 يوماً" /><MetricCard icon={<TrendingUp className="h-5 w-5 text-primary" />} value={`${analytics?.contactRate30d ?? 0}%`} label="نسبة التحويل إلى تواصل" /><MetricCard icon={<UserRound className="h-5 w-5 text-primary" />} value={analytics?.uniqueBuyers ?? 0} label="أصحاب أعمال تواصلوا إجمالاً" /></div>
       <section className="mb-8 rounded-2xl border border-primary/15 bg-primary/5 p-5"><div className="flex items-start gap-3"><BarChart3 className="mt-1 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-extrabold">كيف يتم الاحتساب؟</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">تُحسب فرصة تواصل مؤهلة مرة واحدة لكل صاحب عمل مع هذا المورد خلال 30 يوماً. الأرقام تقيس الفرص التي أنشأها الدليل، وليست مبيعات مؤكدة أو دليلاً على إتمام المحادثة في واتساب.</p></div></div></section>
       <section className="mb-8 rounded-2xl border bg-card p-5"><div className="mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><h2 className="text-xl font-extrabold">الاتجاه الشهري</h2></div>{analytics?.monthly.length ? <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-right text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3 font-bold">الشهر</th><th className="p-3 font-bold">طلبات التواصل</th><th className="p-3 font-bold">أصحاب أعمال فريدون</th></tr></thead><tbody>{analytics.monthly.map((item) => <tr key={item.month} className="border-b last:border-0"><td className="p-3 font-bold" dir="ltr">{formatMonth(item.month)}</td><td className="p-3">{item.contactRequests}</td><td className="p-3">{item.uniqueBuyers}</td></tr>)}</tbody></table></div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">ستظهر الاتجاهات بعد تسجيل أولى فرص التواصل.</p>}</section>
      <div className="mb-4"><h2 className="text-2xl font-bold">سجل تواصل أصحاب الأعمال</h2><p className="mt-1 text-sm text-muted-foreground">لا يظهر هنا إلا التواصل الذي تم عبر حساب هذا المورد.</p></div>
      {loading ? <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">جاري تحميل السجلات...</div> : contacts.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><Clock3 className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-bold">لا توجد سجلات تواصل بعد</p><p className="mt-1 text-sm text-muted-foreground">ستظهر البلاغات المتاحة بعد تواصل أصحاب الأعمال معك عبر الدليل.</p></div> : <div className="space-y-4">{contacts.map((contact) => <article key={contact.id} className="rounded-2xl border bg-card p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{contact.buyerName}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{statusLabels[contact.buyerStatus] || contact.buyerStatus}</span>{contact.reportId && <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">تم الإبلاغ</span>}</div><p className="mt-2 text-sm text-muted-foreground">{contact.businessName || "منشأة غير محددة"} · {contact.businessType} · {contact.buyerPhone}</p><p className="mt-1 text-xs text-muted-foreground">مرجع التواصل: {contact.messageId} · {formatDate(contact.sentAt)}</p><p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-7">{contact.message}</p></div><div className="shrink-0">{contact.reportId ? <span className="inline-flex items-center gap-1 text-sm font-bold text-success"><CheckCircle2 className="h-4 w-4" /> البلاغ محفوظ</span> : <button type="button" onClick={() => { setReporting(contact); setReason(reportReasons[0]); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl border border-warning/25 px-4 py-2 text-sm font-bold text-warning hover:bg-warning/10"><AlertTriangle className="h-4 w-4" /> إبلاغ الإدارة</button>}</div></div></article>)}</div>}
    </div>
    {reporting && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReporting(null); }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-extrabold">إبلاغ عن تواصل</h2><p className="mt-1 text-sm text-muted-foreground">سيصل البلاغ إلى الإدارة للمراجعة فقط.</p></div><button type="button" onClick={() => setReporting(null)} aria-label="إغلاق" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-sm font-bold">سبب البلاغ</span><select value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3">{reportReasons.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-bold">تفاصيل إضافية <span className="font-normal text-muted-foreground">(اختياري)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="اذكر ما يساعد الإدارة على فهم الحالة..." className="w-full resize-none rounded-xl border bg-background p-3 leading-7 outline-none focus:border-primary" /></label><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={() => setReporting(null)} className="flex-1 rounded-xl border px-4 py-3 font-bold hover:bg-muted">إلغاء</button><button type="button" disabled={saving} onClick={() => void submitReport()} className="flex-1 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">{saving ? "جاري الحفظ..." : "رفع البلاغ"}</button></div></div></section></div>}
  </MainLayout>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  return year && month ? new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("ar-SA", { year: "numeric", month: "long" }) : value;
}

function MetricCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return <div className="rounded-2xl border bg-card p-5"><div>{icon}</div><p className="mt-3 text-2xl font-extrabold">{value}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{label}</p></div>;
}
