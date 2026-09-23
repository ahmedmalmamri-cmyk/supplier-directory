import { MainLayout } from "@/components/layout/MainLayout";
import { AlertTriangle, CheckCircle2, Clock3, LogOut, MessageCircle, ShieldCheck, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type Supplier = { id: number; name: string; city: string; phone: string; whatsapp: string; isVerified: boolean };
type Contact = { id: number; message: string; messageId: string; sentAt: string; buyerId: number; buyerName: string; buyerPhone: string; businessName: string | null; businessType: string; buyerStatus: string; reportId: number | null; reportStatus: string | null };

const reportReasons = ["إساءة أو إزعاج", "بيانات غير صحيحة", "طلب مخالف", "احتيال أو انتحال", "أخرى"];
const statusLabels: Record<string, string> = { active: "نشط", under_review: "قيد المراجعة", restricted: "مقيّد", suspended: "موقوف", blocked: "محظور" };

export default function SupplierPortalPage() {
  const [, navigate] = useLocation();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState<Contact | null>(null);
  const [reason, setReason] = useState(reportReasons[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [meResponse, contactsResponse] = await Promise.all([
        fetch("/api/supplier/me", { credentials: "same-origin" }),
        fetch("/api/supplier/contacts", { credentials: "same-origin" }),
      ]);
      if (meResponse.status === 401 || contactsResponse.status === 401) {
        navigate("/supplier/login");
        return;
      }
      const me = await meResponse.json() as { supplier?: Supplier; error?: string };
      const contactList = await contactsResponse.json() as Contact[] | { error?: string };
      if (!meResponse.ok || !me.supplier || !Array.isArray(contactList)) throw new Error(me.error || "تعذر تحميل لوحة المورد.");
      setSupplier(me.supplier);
      setContacts(contactList);
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
    await fetch("/api/supplier/logout", { method: "POST", credentials: "same-origin" });
    navigate("/supplier/login");
  };

  return <MainLayout>
    <div className="border-b bg-secondary/10 py-10"><div className="container mx-auto px-4"><div className="flex items-center gap-2 text-primary"><Store className="h-5 w-5" /><span className="font-bold">مساحة المورد</span></div><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-extrabold md:text-4xl">{supplier?.name || "لوحة المورد"}</h1><p className="mt-2 text-muted-foreground">مراجعة التواصل ورفع البلاغات للإدارة فقط.</p></div><button type="button" onClick={() => void logout()} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold hover:bg-muted"><LogOut className="h-4 w-4" /> تسجيل الخروج</button></div></div></div>
    <div className="container mx-auto max-w-5xl px-4 py-10">
      {error && <div className="mb-5 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</div>}
      <div className="mb-7 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-card p-5"><MessageCircle className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-extrabold">{contacts.length}</p><p className="text-sm text-muted-foreground">سجلات التواصل</p></div><div className="rounded-2xl border bg-card p-5"><AlertTriangle className="h-5 w-5 text-amber-600" /><p className="mt-3 text-2xl font-extrabold">{contacts.filter((contact) => contact.reportId).length}</p><p className="text-sm text-muted-foreground">بلاغات مرفوعة</p></div><div className="rounded-2xl border bg-card p-5"><ShieldCheck className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-sm font-bold">صلاحية محدودة</p><p className="text-sm text-muted-foreground">الإبلاغ فقط، والقرار للإدارة</p></div></div>
      <div className="mb-4"><h2 className="text-2xl font-bold">سجل تواصل أصحاب الأعمال</h2><p className="mt-1 text-sm text-muted-foreground">لا يظهر هنا إلا التواصل الذي تم عبر حساب هذا المورد.</p></div>
      {loading ? <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">جاري تحميل السجلات...</div> : contacts.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center"><Clock3 className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-bold">لا توجد سجلات تواصل بعد</p><p className="mt-1 text-sm text-muted-foreground">ستظهر البلاغات المتاحة بعد تواصل أصحاب الأعمال معك عبر الدليل.</p></div> : <div className="space-y-4">{contacts.map((contact) => <article key={contact.id} className="rounded-2xl border bg-card p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{contact.buyerName}</h3><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{statusLabels[contact.buyerStatus] || contact.buyerStatus}</span>{contact.reportId && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">تم الإبلاغ</span>}</div><p className="mt-2 text-sm text-muted-foreground">{contact.businessName || "منشأة غير محددة"} · {contact.businessType} · {contact.buyerPhone}</p><p className="mt-1 text-xs text-muted-foreground">مرجع التواصل: {contact.messageId} · {formatDate(contact.sentAt)}</p><p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/40 p-4 text-sm leading-7">{contact.message}</p></div><div className="shrink-0">{contact.reportId ? <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> البلاغ محفوظ</span> : <button type="button" onClick={() => { setReporting(contact); setReason(reportReasons[0]); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50"><AlertTriangle className="h-4 w-4" /> إبلاغ الإدارة</button>}</div></div></article>)}</div>}
    </div>
    {reporting && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReporting(null); }}><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-extrabold">إبلاغ عن تواصل</h2><p className="mt-1 text-sm text-muted-foreground">سيصل البلاغ إلى الإدارة للمراجعة فقط.</p></div><button type="button" onClick={() => setReporting(null)} aria-label="إغلاق" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block"><span className="mb-2 block text-sm font-bold">سبب البلاغ</span><select value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3">{reportReasons.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-bold">تفاصيل إضافية <span className="font-normal text-muted-foreground">(اختياري)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="اذكر ما يساعد الإدارة على فهم الحالة..." className="w-full resize-none rounded-xl border bg-background p-3 leading-7 outline-none focus:border-primary" /></label><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={() => setReporting(null)} className="flex-1 rounded-xl border px-4 py-3 font-bold hover:bg-muted">إلغاء</button><button type="button" disabled={saving} onClick={() => void submitReport()} className="flex-1 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-60">{saving ? "جاري الحفظ..." : "رفع البلاغ"}</button></div></div></section></div>}
  </MainLayout>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}
