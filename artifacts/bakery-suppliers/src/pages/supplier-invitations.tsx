import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clipboard,
  Download,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Store,
  Users,
} from "lucide-react";
import {
  getGetSupplierInvitationStatsQueryKey,
  getListSupplierInvitationsQueryKey,
  useCreateSupplierInvitationDraft,
  useGenerateSupplierInvitation,
  useGetSupplierInvitationStats,
  useListSupplierInvitations,
  useMarkSupplierInvitationSent,
} from "@workspace/api-client-react";

type InvitationStatus = "unsent" | "sent" | "completed";
type Draft = { name: string; whatsapp: string; city: string };

const tabs: { id: InvitationStatus; label: string; hint: string }[] = [
  { id: "unsent", label: "غير مرسلة", hint: "مسودات جاهزة للإرسال" },
  { id: "sent", label: "مرسلة", hint: "بانتظار رد المورد" },
  { id: "completed", label: "مكتملة", hint: "ملفات قيد المراجعة" },
];

export function SupplierInvitationsPanel() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<InvitationStatus>("unsent");
  const [showDraft, setShowDraft] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", whatsapp: "", city: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [links, setLinks] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const invitations = useListSupplierInvitations({ status });
  const stats = useGetSupplierInvitationStats();
  const createDraft = useCreateSupplierInvitationDraft();
  const generate = useGenerateSupplierInvitation();
  const markSent = useMarkSupplierInvitationSent();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListSupplierInvitationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSupplierInvitationStatsQueryKey() });
  };

  const submitDraft = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    createDraft.mutate({ data: draft }, {
      onSuccess: () => {
        setDraft({ name: "", whatsapp: "", city: "" });
        setShowDraft(false);
        setNotice("تمت إضافة المورد كمسودة. أنشئ الرابط عند الاستعداد للإرسال.");
        refresh();
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "تعذر إضافة المورد."),
    });
  };

  const makeLink = (supplierId: number, openWhatsApp = false) => {
    setError("");
    setBusyId(supplierId);
    const popup = openWhatsApp ? window.open("about:blank", "_blank") : null;
    generate.mutate({ id: supplierId }, {
      onSuccess: (result) => {
        const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
        const link = `${window.location.origin}${basePath}/invite/${result.token}`;
        setLinks((current) => ({ ...current, [supplierId]: link }));
        const message = `مرحباً ${result.supplierName}،\nيسر دليل موردي المخابز والحلويات دعوتكم لاستكمال ملف منشأتكم عبر الرابط:\n${link}\nنراجع المعلومات قبل نشرها لضمان دقة الدليل.`;
        void navigator.clipboard?.writeText(link);
        if (openWhatsApp) {
          const whatsappUrl = `https://wa.me/${result.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
          if (popup) popup.location.href = whatsappUrl;
          else window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        } else setNotice("تم إنشاء الرابط ونسخه. سجّل الإرسال عند مشاركة الدعوة.");
        markSent.mutate({ id: supplierId }, {
          onSuccess: () => {
            setNotice(openWhatsApp ? "تم فتح رسالة واتساب وتسجيل الدعوة كمرسلة." : "تم نسخ الرابط وتسجيل الدعوة كمرسلة.");
            refresh();
          },
          onError: (markError) => setError(markError instanceof Error ? markError.message : "تم إنشاء الرابط لكن تعذر تسجيل الإرسال."),
          onSettled: () => setBusyId(null),
        });
      },
      onError: (mutationError) => {
        popup?.close();
        setBusyId(null);
        setError(mutationError instanceof Error ? mutationError.message : "تعذر إنشاء رابط الدعوة.");
      },
    });
  };

  const copyExisting = (supplierId: number, link: string) => {
    void navigator.clipboard?.writeText(link);
    setNotice("تم نسخ رابط الدعوة.");
    markSent.mutate({ id: supplierId, }, { onSuccess: refresh, onError: (markError) => setError(markError instanceof Error ? markError.message : "تعذر تسجيل الإرسال.") });
  };

  const currentItems = useMemo(() => invitations.data ?? [], [invitations.data]);

  return (
    <section className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><Send className="h-5 w-5" /><span className="text-sm font-bold">مسار دعوة الموردين</span></div>
          <h2 className="text-2xl font-extrabold">دعوات استكمال الملف</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">أرسل رابطاً خاصاً للمورد ليضيف بياناته بنفسه، ثم راجع الطلب قبل نشره في الدليل.</p>
          <p className="mt-2 text-xs text-muted-foreground">تُسجل الدعوة عند نسخ الرابط أو فتح واتساب؛ لا يستطيع التطبيق التحقق من إرسال الرسالة أو وصولها.</p>
        </div>
        <button data-testid="button-add-supplier-invitation" type="button" onClick={() => setShowDraft((value) => !value)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5">
          <Plus className="h-4 w-4" /> إضافة مورد جديد
        </button>
      </div>

      {showDraft && <form onSubmit={submitDraft} className="animate-rise-in rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Store className="h-5 w-5" /></div><div><h3 className="font-extrabold">مسودة مورد جديدة</h3><p className="text-xs text-muted-foreground">هذه البيانات تظهر مسبقاً في نموذج الدعوة.</p></div></div>
        <div className="grid gap-3 md:grid-cols-3">
          {([["name", "اسم المنشأة", "مثال: مخابز رواسي"], ["whatsapp", "رقم واتساب", "9665XXXXXXXX"], ["city", "المدينة", "الدمام"]] as const).map(([field, label, placeholder]) => <label key={field} className="block"><span className="mb-1.5 block text-xs font-bold">{label}</span><input data-testid={`input-invitation-${field}`} required value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} placeholder={placeholder} className="h-11 w-full rounded-xl border bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" dir={field === "whatsapp" ? "ltr" : undefined} /></label>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button data-testid="button-save-invitation-draft" type="submit" disabled={createDraft.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">{createDraft.isPending ? "جاري الحفظ..." : "حفظ المسودة"}</button><button data-testid="button-cancel-invitation-draft" type="button" onClick={() => setShowDraft(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-muted">إلغاء</button></div>
      </form>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مرسلة" value={stats.data?.sent} icon={<Send className="h-4 w-4" />} accent="text-primary" />
        <StatCard label="فتحت الرابط" value={stats.data?.opened} icon={<ExternalLink className="h-4 w-4" />} accent="text-amber-700" />
        <StatCard label="مكتملة" value={stats.data?.completed} icon={<Clipboard className="h-4 w-4" />} accent="text-emerald-700" />
        <StatCard label="نسبة الاستجابة" value={stats.data ? `${stats.data.responseRate}%` : undefined} icon={<Users className="h-4 w-4" />} accent="text-sky-700" />
      </div>

      {(notice || error) && <div role="status" data-testid={error ? "status-invitation-error" : "status-invitation-notice"} className={`rounded-xl border p-3 text-sm ${error ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1">{tabs.map((item) => <button data-testid={`tab-invitations-${item.id}`} type="button" key={item.id} onClick={() => setStatus(item.id)} className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${status === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
          <a data-testid={`link-export-invitations-${status}`} href={`/api/admin/invitations/export?status=${status}`} download className="inline-flex items-center gap-2 self-start rounded-lg border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted sm:self-auto"><Download className="h-4 w-4" /> تنزيل CSV</a>
        </div>
        <div className="border-b px-4 py-3 text-xs text-muted-foreground">{tabs.find((item) => item.id === status)?.hint} · {currentItems.length} مورد</div>
        {invitations.isLoading ? <InvitationSkeleton /> : invitations.isError ? <div className="p-10 text-center text-sm text-destructive">تعذر تحميل الدعوات. <button data-testid="button-retry-invitations" type="button" onClick={() => void invitations.refetch()} className="font-bold underline">إعادة المحاولة</button></div> : currentItems.length === 0 ? <div className="p-12 text-center"><Send className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" /><h3 className="font-bold">لا توجد دعوات في هذه القائمة</h3><p className="mt-1 text-sm text-muted-foreground">أضف مورداً جديداً لتبدأ.</p></div> : <div className="divide-y">{currentItems.map((item) => <InvitationRow key={item.supplierId} item={item} link={links[item.supplierId]} busy={busyId === item.supplierId} onGenerate={() => makeLink(item.supplierId)} onWhatsApp={() => makeLink(item.supplierId, true)} onCopy={() => links[item.supplierId] && copyExisting(item.supplierId, links[item.supplierId])} />)}</div>}
      </div>
    </section>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value?: string | number; icon: ReactNode; accent: string }) {
  return <div data-testid={`stat-invitation-${label}`} className="rounded-2xl border bg-card p-4 shadow-sm"><div className={`mb-3 flex items-center gap-2 text-xs font-bold ${accent}`}>{icon}{label}</div><div className="text-2xl font-extrabold">{value ?? "—"}</div></div>;
}

function InvitationRow({ item, link, busy, onGenerate, onWhatsApp, onCopy }: { item: { supplierId: number; name: string; city: string; whatsapp: string; inviteSentAt: string | null; inviteOpenedAt: string | null; inviteCompletedAt: string | null; requestStatus: string | null }; link?: string; busy: boolean; onGenerate: () => void; onWhatsApp: () => void; onCopy: () => void }) {
  const completed = Boolean(item.inviteCompletedAt);
  const rejected = item.requestStatus === "rejected";
  const stateLabel = rejected ? "مرفوض" : completed ? "مكتمل" : item.inviteSentAt ? "مرسلة" : "غير مرسلة";
  const requestLabel: Record<string, string> = {
    pending: "بانتظار المراجعة",
    pending_review: "بانتظار مراجعة الإدارة",
    approved: "معتمد",
    rejected: "مرفوض",
  };
  const dateLabel = (value: string | null) => value
    ? new Date(value).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  return (
    <article data-testid={`card-invitation-${item.supplierId}`} className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/20 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${rejected ? "bg-red-500" : completed ? "bg-emerald-500" : item.inviteSentAt ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
          <h3 data-testid={`text-invitation-name-${item.supplierId}`} className="font-extrabold">{item.name}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">{stateLabel}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{item.city} <span className="px-1">·</span> <span dir="ltr" className="inline-block">{item.whatsapp}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">الإرسال: {dateLabel(item.inviteSentAt)} · الفتح: {dateLabel(item.inviteOpenedAt)} · الإكمال: {dateLabel(item.inviteCompletedAt)}</p>
        {item.requestStatus && <p className={`mt-1 text-xs font-bold ${rejected ? "text-red-700" : "text-emerald-700"}`}>حالة طلب التسجيل: {requestLabel[item.requestStatus] || item.requestStatus}</p>}
      </div>
      {(!completed || rejected) && <div className="flex flex-wrap gap-2">
        {link && <button data-testid={`button-copy-invitation-${item.supplierId}`} type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><Clipboard className="h-3.5 w-3.5" /> نسخ الرابط</button>}
        <button data-testid={`button-generate-invitation-${item.supplierId}`} type="button" disabled={busy} onClick={onGenerate} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} إنشاء ونسخ الرابط</button>
        <button data-testid={`button-whatsapp-invitation-${item.supplierId}`} type="button" disabled={busy} onClick={onWhatsApp} className="inline-flex items-center gap-1.5 rounded-lg bg-[#287c62] px-3 py-2 text-xs font-bold text-white hover:bg-[#21674f] disabled:opacity-60"><MessageCircle className="h-3.5 w-3.5" /> فتح واتساب</button>
      </div>}
    </article>
  );
}

function InvitationSkeleton() {
  return <div className="space-y-3 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>;
}

export default function SupplierInvitationsPage() {
  return <main className="container mx-auto max-w-7xl px-4 py-10"><SupplierInvitationsPanel /></main>;
}