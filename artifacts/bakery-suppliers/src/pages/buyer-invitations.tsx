import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BuyerInvitation,
  BuyerInvitationInputBusinessType,
  getExportBuyerInvitationsQueryKey,
  getGetBuyerInvitationStatsQueryKey,
  getListBuyerInvitationsQueryKey,
  useCreateBuyerInvitation,
  useDeleteBuyerInvitation,
  useExportBuyerInvitations,
  useGetBuyerInvitationLink,
  useGetBuyerInvitationStats,
  useListBuyerInvitations,
  useMarkBuyerInvitationSent,
  useUpdateBuyerInvitation,
  useUpdateInvitedBuyerAccountStatus,
} from "@workspace/api-client-react";
import { Clipboard, Download, FilePenLine, Link2, LoaderCircle, MessageCircle, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";

type Status = "invited" | "activated" | "active" | "suspended";
type BusinessType = typeof BuyerInvitationInputBusinessType[keyof typeof BuyerInvitationInputBusinessType];
type FormState = { fullName: string; phone: string; businessName: string; businessType: BusinessType; city: string; internalNotes: string };
const statuses: { id: Status; label: string; tone: string }[] = [
  { id: "invited", label: "مدعوون", tone: "bg-amber-100 text-amber-800" },
  { id: "activated", label: "مفعّلون", tone: "bg-sky-100 text-sky-800" },
  { id: "active", label: "نشطون", tone: "bg-emerald-100 text-emerald-800" },
  { id: "suspended", label: "موقوفون مؤقتاً", tone: "bg-rose-100 text-rose-800" },
];
const businessTypes = Object.values(BuyerInvitationInputBusinessType);
const ADMIN_CONTACT_NUMBER = "0566866805";
const emptyForm: FormState = { fullName: "", phone: "", businessName: "", businessType: "مخبز", city: "", internalNotes: "" };

export function BuyerInvitationsPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("invited");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<BuyerInvitation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [details, setDetails] = useState<number | null>(null);
  const [suspendId, setSuspendId] = useState<number | null>(null);
  const [durationDays, setDurationDays] = useState("7");
  const [reason, setReason] = useState("");

  const list = useListBuyerInvitations({ status });
  const stats = useGetBuyerInvitationStats();
  const exportQuery = useExportBuyerInvitations({ status }, { query: { enabled: false, queryKey: getExportBuyerInvitationsQueryKey({ status }) } });
  const create = useCreateBuyerInvitation();
  const update = useUpdateBuyerInvitation();
  const remove = useDeleteBuyerInvitation();
  const linkMutation = useGetBuyerInvitationLink();
  const markSent = useMarkBuyerInvitationSent();
  const accountStatus = useUpdateInvitedBuyerAccountStatus();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListBuyerInvitationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetBuyerInvitationStatsQueryKey() });
  };
  const items = useMemo(() => (list.data ?? []).filter((item) => {
    const needle = search.trim().toLowerCase();
    return !needle || [item.fullName, item.phone, item.businessName, item.city].some((value) => value.toLowerCase().includes(needle));
  }), [list.data, search]);
  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError(""); };
  const openEdit = (item: BuyerInvitation) => { setEditing(item); setForm({ fullName: item.fullName, phone: item.phone, businessName: item.businessName, businessType: item.businessType as BusinessType, city: item.city, internalNotes: item.internalNotes || "" }); setShowForm(true); setError(""); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const payload = { ...form, fullName: form.fullName.trim(), phone: form.phone.trim(), businessName: form.businessName.trim(), city: form.city.trim(), internalNotes: form.internalNotes.trim() };
    const onSuccess = () => { setShowForm(false); setForm(emptyForm); setNotice(editing ? "تم تحديث بيانات الدعوة." : "تم إنشاء مسودة دعوة جديدة."); refresh(); };
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : "تعذر حفظ الدعوة.");
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    else create.mutate({ data: payload }, { onSuccess, onError });
  };
  const copyLink = (item: BuyerInvitation, openWhatsApp = false) => {
    setError(""); setNotice("");
    linkMutation.mutate({ id: item.id }, {
      onSuccess: (link) => {
        void navigator.clipboard?.writeText(link.url);
        if (openWhatsApp) {
          const message = `السلام عليكم ${item.fullName}،\nندعوك للانضمام إلى دليل موردي المخابز والحلويات المجاني لأصحاب المخابز والحلويات والمقاهي.\nلا توجد رسوم وسيط أو عمولة على التواصل مع الموردين.\nرابط تفعيل حسابك: ${link.url}\nللاستفسار مع فريق الدليل: ${ADMIN_CONTACT_NUMBER}\n\nملاحظة: سيفتح واتساب لتراجع الرسالة وتضغط إرسال بنفسك، ولا يستطيع النظام تأكيد وصولها.`;
          window.open(`https://wa.me/${item.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
          markSent.mutate({ id: item.id }, { onSuccess: refresh });
          setNotice("تم فتح واتساب. راجع الرسالة واضغط إرسال؛ لا يؤكد النظام التسليم.");
        } else setNotice("تم نسخ رابط الدعوة الثابت.");
        refresh();
      },
      onError: (err) => setError(err instanceof Error ? err.message : "تعذر إنشاء الرابط."),
    });
  };
  const exportCsv = async () => {
    setError("");
    const result = await exportQuery.refetch();
    if (result.data instanceof Blob) {
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `buyer-invitations-${status}.csv`; anchor.click();
      URL.revokeObjectURL(url); setNotice("تم تنزيل ملف CSV المتوافق مع Excel.");
    } else setError("تعذر تجهيز ملف التصدير.");
  };
  const updateStatus = (id: number, next: "active" | "suspended", days?: number) => {
    accountStatus.mutate({ id, data: { status: next, ...(next === "suspended" ? { durationDays: days, reason: reason.trim() || undefined } : {}) } }, {
      onSuccess: () => { setSuspendId(null); setReason(""); setNotice(next === "suspended" ? "تم إيقاف الحساب مؤقتاً مع حفظ سجل التواصل." : "تمت إعادة تفعيل الحساب."); refresh(); },
      onError: (err) => setError(err instanceof Error ? err.message : "تعذر تحديث حالة الحساب."),
    });
  };

  return (
    <section className="space-y-6" dir="rtl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><UserPlus className="h-5 w-5" /><span data-testid="text-buyer-invitation-kicker" className="text-sm font-bold">مسار تفعيل أصحاب الأعمال</span></div>
          <h2 data-testid="text-buyer-invitations-title" className="text-2xl font-extrabold">دعوات أصحاب الأعمال</h2>
          <p data-testid="text-buyer-invitations-description" className="mt-1 max-w-2xl text-sm text-muted-foreground">أنشئ دعوة واضحة، تابع التفعيل، وحافظ على سجل التواصل حتى عند إيقاف الحساب مؤقتاً.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="button-create-buyer-invitation" type="button" onClick={openCreate} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-warm"><Plus className="h-4 w-4" /> دعوة جديدة</button>
          <button data-testid="button-export-buyer-invitations" type="button" onClick={() => void exportCsv()} disabled={exportQuery.isFetching} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-bold hover:bg-muted disabled:opacity-60"><Download className="h-4 w-4" /> {exportQuery.isFetching ? "جاري التجهيز..." : "تصدير Excel"}</button>
        </div>
      </div>
      {showForm && <form data-testid="form-buyer-invitation" onSubmit={submit} className="animate-rise-in rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 data-testid="text-buyer-form-title" className="font-extrabold">{editing ? "تعديل الدعوة" : "مسودة دعوة جديدة"}</h3><p className="text-xs text-muted-foreground">{editing ? "يمكن تعديل الدعوة قبل تفعيل الحساب فقط." : "ستبقى الدعوة في حالة مدعو حتى تفعيلها."}</p></div><button data-testid="button-close-buyer-form" type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field id="input-buyer-invitation-full-name" label="الاسم الكامل" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} required />
          <Field id="input-buyer-invitation-phone" label="رقم الجوال" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required ltr />
          <Field id="input-buyer-invitation-business-name" label="اسم المنشأة" value={form.businessName} onChange={(value) => setForm({ ...form, businessName: value })} required />
          <label className="block"><span className="mb-1.5 block text-sm font-bold">نوع النشاط</span><select data-testid="select-buyer-invitation-business-type" value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value as BusinessType })} className="h-11 w-full rounded-xl border bg-background px-3">{businessTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <Field id="input-buyer-invitation-city" label="المدينة" value={form.city} onChange={(value) => setForm({ ...form, city: value })} required />
          <label className="block md:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-sm font-bold">ملاحظات داخلية <span className="font-normal text-muted-foreground">(اختياري)</span></span><textarea data-testid="textarea-buyer-invitation-notes" value={form.internalNotes} onChange={(event) => setForm({ ...form, internalNotes: event.target.value })} maxLength={1000} rows={3} className="w-full resize-y rounded-xl border bg-background p-3" /></label>
        </div>
        {error && <p data-testid="status-buyer-invitation-form-error" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button data-testid="button-save-buyer-invitation" type="submit" disabled={create.isPending || update.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">{create.isPending || update.isPending ? "جاري الحفظ..." : "حفظ الدعوة"}</button><button data-testid="button-cancel-buyer-invitation" type="button" onClick={() => setShowForm(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-muted">إلغاء</button></div>
      </form>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statuses.map((item) => <div data-testid={`stat-buyer-invitations-${item.id}`} key={item.id} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.tone}`}>{item.label}</span><Users className="h-4 w-4 text-muted-foreground" /></div><strong className="text-2xl">{stats.data?.[item.id] ?? "—"}</strong><span className="mr-2 text-xs text-muted-foreground">حساب</span></div>)}
      </div>
      {stats.data && <div className="grid gap-4 lg:grid-cols-2"><Insight title="أكثر عمليات البحث" items={stats.data.topSearches.map((item) => `${item.term} · ${item.count}`)} testId="buyer-top-searches" /><Insight title="محاولات التواصل اليومية" items={stats.data.dailyContactAttempts.slice(-5).map((item) => `${item.date} · ${item.count}`)} testId="buyer-daily-contact-attempts" /></div>}
      {notice && <div data-testid="status-buyer-invitation-notice" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      {error && !showForm && <div data-testid="status-buyer-invitation-error" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">{statuses.map((item) => <button data-testid={`tab-buyer-invitations-${item.id}`} type="button" key={item.id} onClick={() => setStatus(item.id)} className={`rounded-lg px-3 py-2 text-sm font-bold ${status === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
          <label className="relative block"><Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" /><input data-testid="input-search-buyer-invitations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو المنشأة" className="h-10 w-full rounded-xl border bg-background py-2 pr-9 pl-3 text-sm outline-none focus:border-primary md:w-64" /></label>
        </div>
        {list.isLoading ? <InvitationSkeleton /> : list.isError ? <div className="p-10 text-center text-sm text-destructive">تعذر تحميل الدعوات. <button data-testid="button-retry-buyer-invitations" type="button" onClick={() => void list.refetch()} className="font-bold underline">إعادة المحاولة</button></div> : items.length === 0 ? <div data-testid="empty-buyer-invitations" className="p-12 text-center"><UserPlus className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" /><h3 className="font-bold">لا توجد دعوات في هذه القائمة</h3><p className="mt-1 text-sm text-muted-foreground">أنشئ دعوة جديدة لتبدأ متابعة التفعيل.</p></div> : <div className="divide-y">{items.map((item) => <InvitationCard key={item.id} item={item} details={details === item.id} onDetails={() => setDetails(details === item.id ? null : item.id)} onEdit={() => openEdit(item)} onDelete={() => { if (window.confirm("هل تريد حذف الدعوة غير المفعّلة؟")) remove.mutate({ id: item.id }, { onSuccess: () => { setNotice("تم حذف الدعوة."); refresh(); }, onError: () => setError("تعذر حذف الدعوة.") }); }} onCopy={() => copyLink(item)} onWhatsApp={() => copyLink(item, true)} onSuspend={() => { setSuspendId(item.id); setReason(""); }} onReactivate={() => updateStatus(item.id, "active")} />)}</div>}
      </div>
      {suspendId !== null && <div data-testid="dialog-suspend-buyer" className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-4"><div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-warm-lg"><h3 className="text-xl font-extrabold">إيقاف الحساب مؤقتاً</h3><p className="mt-1 text-sm text-muted-foreground">سيبقى سجل التواصل محفوظاً ويمكن إعادة التفعيل لاحقاً.</p><label className="mt-5 block"><span className="mb-1.5 block text-sm font-bold">مدة الإيقاف بالأيام</span><select data-testid="select-suspend-duration" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3">{[1, 3, 7, 14, 30, 90].map((day) => <option key={day} value={day}>{day} يوم</option>)}</select></label><label className="mt-4 block"><span className="mb-1.5 block text-sm font-bold">سبب داخلي <span className="font-normal text-muted-foreground">(اختياري)</span></span><textarea data-testid="textarea-suspend-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full rounded-xl border bg-background p-3" /></label><div className="mt-5 flex gap-2"><button data-testid="button-confirm-suspend-buyer" type="button" onClick={() => updateStatus(suspendId, "suspended", Number(durationDays))} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white">تأكيد الإيقاف</button><button data-testid="button-cancel-suspend-buyer" type="button" onClick={() => setSuspendId(null)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">إلغاء</button></div></div></div>}
    </section>
  );
}

function Field({ id, label, value, onChange, required, ltr }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; ltr?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold">{label}</span><input data-testid={id} required={required} value={value} onChange={(event) => onChange(event.target.value)} dir={ltr ? "ltr" : undefined} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>;
}

function Insight({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  return <section data-testid={`panel-${testId}`} className="rounded-2xl border bg-card p-4"><h3 className="font-extrabold">{title}</h3>{items.length ? <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{items.map((item, index) => <li data-testid={`text-${testId}-${index}`} key={item} className="rounded-lg bg-muted/40 px-3 py-2">{item}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">لا توجد بيانات كافية بعد.</p>}</section>;
}

function InvitationCard({ item, details, onDetails, onEdit, onDelete, onCopy, onWhatsApp, onSuspend, onReactivate }: { item: BuyerInvitation; details: boolean; onDetails: () => void; onEdit: () => void; onDelete: () => void; onCopy: () => void; onWhatsApp: () => void; onSuspend: () => void; onReactivate: () => void }) {
  const status = statuses.find((value) => value.id === item.accountStatus) ?? statuses[0];
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString("ar-SA") : "—";
  const canEdit = item.accountStatus === "invited";
  return <article data-testid={`card-buyer-invitation-${item.id}`} className="p-4 transition-colors hover:bg-muted/20"><div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 data-testid={`text-buyer-invitation-name-${item.id}`} className="font-extrabold">{item.fullName}</h3><span data-testid={`status-buyer-invitation-${item.id}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span></div><p data-testid={`text-buyer-invitation-business-${item.id}`} className="mt-1 text-sm text-muted-foreground">{item.businessName} · {item.businessType} · {item.city}</p><p data-testid={`text-buyer-invitation-meta-${item.id}`} className="mt-1 text-xs text-muted-foreground">الدعوة: {date(item.invitedAt)} · المنشئ: {item.createdBy} · آخر دخول: {date(item.lastLogin)}</p></div><div className="flex flex-wrap gap-2"><button data-testid={`button-details-buyer-invitation-${item.id}`} type="button" onClick={onDetails} className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted">تفاصيل</button>{canEdit && <><button data-testid={`button-edit-buyer-invitation-${item.id}`} type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><FilePenLine className="h-3.5 w-3.5" /> تعديل</button><button data-testid={`button-delete-buyer-invitation-${item.id}`} type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> حذف</button></>}<button data-testid={`button-copy-buyer-invitation-${item.id}`} type="button" onClick={onCopy} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><Clipboard className="h-3.5 w-3.5" /> نسخ الرابط</button>{item.accountStatus === "invited" && <button data-testid={`button-whatsapp-buyer-invitation-${item.id}`} type="button" onClick={onWhatsApp} className="inline-flex items-center gap-1 rounded-lg bg-[#287c62] px-3 py-2 text-xs font-bold text-white hover:bg-[#21674f]"><MessageCircle className="h-3.5 w-3.5" /> واتساب</button>}{item.accountStatus === "active" && <button data-testid={`button-suspend-buyer-invitation-${item.id}`} type="button" onClick={onSuspend} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">إيقاف مؤقت</button>}{item.accountStatus === "suspended" && <button data-testid={`button-reactivate-buyer-invitation-${item.id}`} type="button" onClick={onReactivate} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">إعادة التفعيل</button>}</div></div>{details && <div data-testid={`panel-buyer-invitation-details-${item.id}`} className="mt-4 grid gap-3 rounded-xl bg-muted/35 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="الهاتف" value={item.phone} ltr /><Info label="رقم صاحب العمل" value={item.buyerId ? String(item.buyerId) : "لم يُفعّل بعد"} /><Info label="أُرسلت الدعوة" value={date(item.inviteSentAt)} /><Info label="تاريخ التفعيل" value={date(item.activatedAt)} /><Info label="تاريخ الإنشاء" value={date(item.createdAt)} /><Info label="الإيقاف حتى" value={date(item.suspendedUntil)} /><div className="sm:col-span-2 lg:col-span-4"><span className="font-bold">الملاحظات الداخلية</span><p data-testid={`text-buyer-invitation-notes-${item.id}`} className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.internalNotes || "لا توجد ملاحظات."}</p></div><div className="sm:col-span-2 lg:col-span-4 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> يتم حفظ سجل التواصل عند تغيير الحالة.</div></div>}</article>;
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return <div><span className="block text-xs text-muted-foreground">{label}</span><strong dir={ltr ? "ltr" : undefined}>{value}</strong></div>;
}

function InvitationSkeleton() {
  return <div data-testid="loading-buyer-invitations" className="space-y-3 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>;
}

export default function BuyerInvitationsPage() {
  return <main className="container mx-auto max-w-7xl px-4 py-10"><BuyerInvitationsPanel /></main>;
}