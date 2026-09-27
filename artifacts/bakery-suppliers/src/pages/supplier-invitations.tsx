import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clipboard,
  Download,
  ExternalLink,
  CheckCircle2,
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
  getGetSupplierSourceStatsQueryKey,
  getListSupplierInvitationsQueryKey,
  useCreateSupplierInvitationDraft,
  useGenerateSupplierInvitation,
  useGetSupplierInvitationOptions,
  useGetSupplierInvitationStats,
  useGetSupplierSourceStats,
  useListSupplierInvitations,
  useMarkSupplierInvitationSent,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildWhatsAppChatUrl,
  buildWhatsAppMessageUrl,
  buildWhatsAppTestUrl,
  invalidSaudiPhoneMessage,
  normalizeSaudiMobile,
} from "@/lib/saudi-phone";
import { isDevelopmentPreview, publishedPageUrl } from "@/lib/public-site-url";

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
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [draft, setDraft] = useState<Draft>({ name: "", whatsapp: "", city: "" });
  const [manualPhoneError, setManualPhoneError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [links, setLinks] = useState<Record<number, string>>({});
  const [whatsAppFallbacks, setWhatsAppFallbacks] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const invitations = useListSupplierInvitations({ status });
  const stats = useGetSupplierInvitationStats();
  const sourceStats = useGetSupplierSourceStats();
  const formOptions = useGetSupplierInvitationOptions();
  const createDraft = useCreateSupplierInvitationDraft();
  const generate = useGenerateSupplierInvitation();
  const markSent = useMarkSupplierInvitationSent();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListSupplierInvitationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSupplierInvitationStatsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetSupplierSourceStatsQueryKey() });
  };

  const submitDraft = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const phone = normalizeSaudiMobile(draft.whatsapp);
    if (!phone) {
      setManualPhoneError(invalidSaudiPhoneMessage);
      return;
    }
    setManualPhoneError("");
    createDraft.mutate({ data: { ...draft, whatsapp: phone.local, source: "manual" } }, {
      onSuccess: () => {
        setDraft({ name: "", whatsapp: "", city: "" });
        setShowDraft(false);
        setNotice("تمت إضافة المورد كمسودة. أنشئ الرابط عند الاستعداد للإرسال.");
        refresh();
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "تعذر إضافة المورد."),
    });
  };

  const testWhatsAppNumber = (value: string, setPhoneError: (message: string) => void, setMessage: (message: string) => void) => {
    const testUrl = buildWhatsAppTestUrl(value);
    if (!testUrl) {
      setPhoneError(invalidSaudiPhoneMessage);
      return;
    }
    setPhoneError("");
    window.open(testUrl, "_blank", "noopener,noreferrer");
    setMessage("أرسل رسالة الاختبار من واتساب بنفسك؛ لا يستطيع الموقع تأكيد وصولها.");
  };

  const markInvitationSent = (supplierId: number, successMessage: string) => {
    markSent.mutate({ id: supplierId }, {
      onSuccess: () => {
        setNotice(successMessage);
        refresh();
      },
      onError: (markError) => setError(markError instanceof Error ? markError.message : "تعذر تسجيل فتح رابط الدعوة."),
      onSettled: () => setBusyId(null),
    });
  };

  const openWhatsAppFallback = (supplierId: number) => {
    setError("");
    setBusyId(supplierId);
    markSent.mutate({ id: supplierId }, {
      onSuccess: () => {
        setWhatsAppFallbacks((current) => {
          const next = { ...current };
          delete next[supplierId];
          return next;
        });
        setNotice("تم فتح واتساب. أرسل الرسالة يدوياً؛ لا يستطيع الموقع تأكيد الإرسال.");
        refresh();
      },
      onError: (markError) => setError(markError instanceof Error ? markError.message : "تعذر تسجيل فتح رابط الدعوة."),
      onSettled: () => setBusyId(null),
    });
  };

  const makeLink = (supplierId: number, openWhatsApp = false, recipientWhatsApp?: string) => {
    setError("");
    setNotice("");
    if (isDevelopmentPreview()) {
      setError("رابط الدعوة الخاص من معاينة Replit لا يفتح للموردين. افتح لوحة الموقع المنشور بعد نقل بيانات الموردين، ثم أنشئ الدعوة من هناك.");
      return;
    }
    if (openWhatsApp && !buildWhatsAppChatUrl(recipientWhatsApp ?? "")) {
      setError(invalidSaudiPhoneMessage);
      return;
    }
    setBusyId(supplierId);
    setWhatsAppFallbacks((current) => {
      const next = { ...current };
      delete next[supplierId];
      return next;
    });
    const popup = openWhatsApp ? (() => {
      try {
        const opened = window.open("about:blank", "_blank");
        if (opened) opened.opener = null;
        return opened;
      } catch {
        return null;
      }
    })() : null;
    generate.mutate({ id: supplierId }, {
      onSuccess: (result) => {
        const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
        const link = `${window.location.origin}${basePath}/invite/${result.token}`;
        setLinks((current) => ({ ...current, [supplierId]: link }));
        const message = `مرحباً ${result.supplierName}،\nيسر دليل موردي المخابز والحلويات دعوتكم لاستكمال ملف منشأتكم عبر الرابط:\n${link}\nنراجع المعلومات قبل نشرها لضمان دقة الدليل.`;
        if (!openWhatsApp) {
          if (!navigator.clipboard?.writeText) {
            setError("النسخ غير متاح في هذا المتصفح.");
            setBusyId(null);
            return;
          }
          void navigator.clipboard.writeText(link)
            .then(() => markInvitationSent(supplierId, "تم إنشاء الرابط ونسخه. شاركه مع المورد لإكمال التسجيل."))
            .catch(() => {
              setError("تعذر نسخ الرابط تلقائياً. اسمح للمتصفح بالنسخ ثم حاول مجدداً.");
              setBusyId(null);
            });
          return;
        }
        const whatsappUrl = buildWhatsAppMessageUrl(result.whatsapp, message);
        if (openWhatsApp) {
          if (!whatsappUrl) {
            popup?.close();
            setBusyId(null);
            setError(invalidSaudiPhoneMessage);
            return;
          }
          if (popup && !popup.closed) {
            try {
              popup.location.href = whatsappUrl;
            } catch {
              popup.close();
              setWhatsAppFallbacks((current) => ({ ...current, [supplierId]: whatsappUrl }));
              setNotice("تم إنشاء الدعوة، لكن تعذر فتح نافذة واتساب تلقائياً. اضغط «متابعة الإرسال عبر واتساب» في بطاقة المورد.");
              setBusyId(null);
              return;
            }
            markInvitationSent(supplierId, "تم فتح واتساب. أرسل الرسالة يدوياً؛ لا يستطيع الموقع تأكيد الإرسال.");
          } else {
            setWhatsAppFallbacks((current) => ({ ...current, [supplierId]: whatsappUrl }));
            setNotice("تم إنشاء الدعوة، لكن المتصفح منع فتح واتساب تلقائياً. اضغط «متابعة الإرسال عبر واتساب» في بطاقة المورد.");
            setBusyId(null);
          }
        }
      },
      onError: (mutationError) => {
        popup?.close();
        setBusyId(null);
        setError(mutationError instanceof Error ? mutationError.message : "تعذر إنشاء رابط الدعوة.");
      },
    });
  };

  const copyExisting = (supplierId: number, link: string) => {
    if (!navigator.clipboard?.writeText) {
      setError("النسخ غير متاح في هذا المتصفح.");
      return;
    }
    void navigator.clipboard.writeText(link).then(() => {
      setNotice("تم نسخ رابط الدعوة.");
      markSent.mutate({ id: supplierId }, { onSuccess: refresh, onError: (markError) => setError(markError instanceof Error ? markError.message : "تعذر تسجيل الإرسال.") });
    }).catch(() => setError("تعذر نسخ الرابط. تحقق من أذونات المتصفح وحاول مجدداً."));
  };

  const currentItems = useMemo(() => invitations.data ?? [], [invitations.data]);
  const registrationUrl = publishedPageUrl("/register/supplier");
  const registrationMessage = `السلام عليكم، ندعوكم للتسجيل كمورد في دليل موردي المخابز والحلويات عبر الرابط:\n${registrationUrl}\nيرجى اختيار الأصناف المتوفرة لديكم وكتابة تفاصيل منتجاتكم وبيانات منشأتكم. ستراجع الإدارة الطلب قبل قبوله ونشره.`;
  const whatsAppShareUrl = `https://wa.me/?text=${encodeURIComponent(registrationMessage)}`;

  return (
    <section className="space-y-6" dir="rtl">
      <datalist id="supplier-city-options">
        {(formOptions.data?.cities ?? []).map((city) => <option key={city} value={city} />)}
      </datalist>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><Send className="h-5 w-5" /><span className="text-sm font-bold">مسار دعوة الموردين</span></div>
          <h2 className="text-2xl font-extrabold">دعوات استكمال الملف</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">أرسل رابطاً خاصاً للمورد ليضيف بياناته بنفسه، ثم راجع الطلب قبل نشره في الدليل.</p>
          <p className="mt-2 text-xs text-muted-foreground">تُسجل الدعوة عند نسخ الرابط أو فتح واتساب؛ لا يستطيع التطبيق التحقق من إرسال الرسالة أو وصولها.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="button-add-supplier-invitation" type="button" onClick={() => setShowDraft((value) => !value)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5">
            <Plus className="h-4 w-4" /> إضافة مورد جديد
          </button>
          <button data-testid="button-add-supplier-whatsapp" type="button" onClick={() => {
            setError("");
            setShowWhatsApp(true);
          }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-bold text-primary transition-colors hover:bg-primary/15">
            <MessageCircle className="h-4 w-4" /> دعوة مورد عبر واتساب
          </button>
        </div>
      </div>

      {showDraft && <form onSubmit={submitDraft} className="animate-rise-in rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Store className="h-5 w-5" /></div><div><h3 className="font-extrabold">مسودة مورد جديدة</h3><p className="text-xs text-muted-foreground">هذه البيانات تظهر مسبقاً في نموذج الدعوة.</p></div></div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block"><span className="mb-1.5 block text-xs font-bold">اسم المنشأة</span><input data-testid="input-invitation-name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="مثال: مخابز رواسي" className="h-11 w-full rounded-xl border bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <PhoneField value={draft.whatsapp} onChange={(value) => {
            setDraft({ ...draft, whatsapp: value });
            setManualPhoneError("");
          }} onVerify={() => testWhatsAppNumber(draft.whatsapp, setManualPhoneError, setNotice)} error={manualPhoneError} inputTestId="input-invitation-whatsapp" verifyTestId="button-verify-invitation-whatsapp" />
          <label className="block"><span className="mb-1.5 block text-xs font-bold">المدينة</span><input data-testid="input-invitation-city" list="supplier-city-options" required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} placeholder="ابدأ بكتابة المدينة" className="h-11 w-full rounded-xl border bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="mt-1 block text-[11px] text-muted-foreground">{formOptions.isLoading ? "جاري تحميل المدن المقترحة…" : "اختر مدينة من القائمة المقترحة."}</span></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><button data-testid="button-save-invitation-draft" type="submit" disabled={createDraft.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">{createDraft.isPending ? "جاري الحفظ..." : "حفظ المسودة"}</button><button data-testid="button-cancel-invitation-draft" type="button" onClick={() => setShowDraft(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-muted">إلغاء</button></div>
      </form>}

      <Dialog open={showWhatsApp} onOpenChange={setShowWhatsApp}>
        <DialogContent dir="rtl" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>دعوة مورد للتسجيل في الدليل</DialogTitle>
            <DialogDescription>اختر جهة الاتصال من واتساب، ثم أرسل لها رابط التسجيل الرسمي.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-3 text-sm leading-6">
              <p>سيفتح واتساب لاختيار المستلم، وستحتاج إلى الضغط على إرسال داخل واتساب.</p>
               <p className="mt-2 text-muted-foreground">على المورد اختيار الأصناف المتوفرة وكتابة تفاصيل منتجاته بنفسه. يبقى الطلب بانتظار مراجعة الإدارة قبل قبوله ونشره.</p>
              {isDevelopmentPreview() && <p className="mt-2 font-bold text-destructive">هذا رابط تسجيل عام في الموقع المنشور، وليس تحديثاً للموردين المحفوظين في المعاينة.</p>}
              <p className="mt-2 break-all text-xs text-muted-foreground" dir="ltr">{registrationUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a data-testid="button-share-supplier-registration-whatsapp" href={whatsAppShareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                <MessageCircle className="h-4 w-4" /> اختيار مستلم في واتساب
              </a>
              <button data-testid="button-copy-supplier-registration-link" type="button" onClick={() => {
                if (!navigator.clipboard?.writeText) {
                  setError("النسخ غير متاح في هذا المتصفح.");
                  return;
                }
                void navigator.clipboard.writeText(registrationUrl).then(() => {
                  setNotice("تم نسخ رابط التسجيل الرسمي.");
                  setShowWhatsApp(false);
                }).catch(() => setError("تعذر نسخ الرابط. تحقق من أذونات المتصفح وحاول مجدداً."));
              }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold hover:bg-muted">
                <Clipboard className="h-4 w-4" /> نسخ رابط التسجيل
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="مرسلة" value={stats.data?.sent} icon={<Send className="h-4 w-4" />} accent="text-primary" />
        <StatCard label="فتحت الرابط" value={stats.data?.opened} icon={<ExternalLink className="h-4 w-4" />} accent="text-warning" />
        <StatCard label="مكتملة" value={stats.data?.completed} icon={<Clipboard className="h-4 w-4" />} accent="text-success" />
        <StatCard label="نسبة الاستجابة" value={stats.data ? `${stats.data.responseRate}%` : undefined} icon={<Users className="h-4 w-4" />} accent="text-primary" />
      </div>

      <section aria-labelledby="supplier-source-stats-title" className="space-y-3">
        <div><h3 id="supplier-source-stats-title" className="font-extrabold">مصدر إضافة الموردين</h3><p className="text-xs text-muted-foreground">تشمل الأرقام سجلات الموردين المعروفة المصدر، بما فيها المسودات. السجلات القديمة التي لا يتوفر لها مصدر موثق لا تُنسب تلقائياً لأي فئة.</p></div>
        {sourceStats.isError && <div role="alert" data-testid="status-supplier-source-stats-error" className="text-sm text-destructive">تعذر تحميل إحصاءات مصدر الإضافة. <button data-testid="button-retry-supplier-source-stats" type="button" onClick={() => void sourceStats.refetch()} className="font-bold underline">إعادة المحاولة</button></div>}
        {formOptions.isError && <p role="status" data-testid="status-supplier-city-options-error" className="text-xs text-destructive">تعذر تحميل اقتراحات المدن. يمكنك مراجعة إعدادات المدن.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="أُضيف يدوياً" value={sourceStats.data?.manual} icon={<Store className="h-4 w-4" />} accent="text-primary" />
          <StatCard label="أُضيف عبر واتساب" value={sourceStats.data?.whatsapp} icon={<MessageCircle className="h-4 w-4" />} accent="text-primary" />
          <StatCard label="تسجيل ذاتي معتمد" value={sourceStats.data?.selfRegistered} icon={<Users className="h-4 w-4" />} accent="text-success" />
        </div>
      </section>

        {(notice || error) && <div role="status" data-testid={error ? "status-invitation-error" : "status-invitation-notice"} className={`rounded-xl border p-3 text-sm ${error ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-success/25 bg-success/10 text-success"}`}>{error || notice} {error && isDevelopmentPreview() && <a href={publishedPageUrl("/admin")} target="_blank" rel="noopener noreferrer" className="font-bold underline">فتح لوحة الموقع المنشور</a>}</div>}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1">{tabs.map((item) => <button data-testid={`tab-invitations-${item.id}`} type="button" key={item.id} onClick={() => setStatus(item.id)} className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${status === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>
          <a data-testid={`link-export-invitations-${status}`} href={`/api/admin/invitations/export?status=${status}`} download className="inline-flex items-center gap-2 self-start rounded-lg border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted sm:self-auto"><Download className="h-4 w-4" /> تنزيل CSV</a>
        </div>
        <div className="border-b px-4 py-3 text-xs text-muted-foreground">{tabs.find((item) => item.id === status)?.hint} · {currentItems.length} مورد</div>
        {invitations.isLoading ? <InvitationSkeleton /> : invitations.isError ? <div className="p-10 text-center text-sm text-destructive">تعذر تحميل الدعوات. <button data-testid="button-retry-invitations" type="button" onClick={() => void invitations.refetch()} className="font-bold underline">إعادة المحاولة</button></div> : currentItems.length === 0 ? <div className="p-12 text-center"><Send className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" /><h3 className="font-bold">لا توجد دعوات في هذه القائمة</h3><p className="mt-1 text-sm text-muted-foreground">أضف مورداً جديداً لتبدأ.</p></div> : <div className="divide-y">{currentItems.map((item) => <InvitationRow key={item.supplierId} item={item} link={links[item.supplierId]} whatsAppFallback={whatsAppFallbacks[item.supplierId]} busy={busyId === item.supplierId} onGenerate={() => makeLink(item.supplierId)} onWhatsApp={() => makeLink(item.supplierId, true, item.whatsapp)} onWhatsAppFallback={() => openWhatsAppFallback(item.supplierId)} onCopy={() => links[item.supplierId] && copyExisting(item.supplierId, links[item.supplierId])} />)}</div>}
      </div>
    </section>
  );
}

function PhoneField({ value, onChange, onVerify, error, inputTestId, verifyTestId }: {
  value: string;
  onChange: (value: string) => void;
  onVerify: () => void;
  error: string;
  inputTestId: string;
  verifyTestId: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold">رقم واتساب</span>
      <div className="flex gap-2" dir="ltr">
        <input data-testid={inputTestId} type="tel" inputMode="tel" autoComplete="tel" required value={value} onChange={(event) => onChange(event.target.value)} placeholder="0551234567 أو 966551234567" aria-invalid={Boolean(error)} className={`h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 ${error ? "border-destructive" : ""}`} />
        <button data-testid={verifyTestId} type="button" onClick={onVerify} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted" dir="rtl"><CheckCircle2 className="h-4 w-4 text-primary" />تحقق</button>
      </div>
      {error && <span role="alert" data-testid={`${inputTestId}-error`} className="mt-1 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value?: string | number; icon: ReactNode; accent: string }) {
  return <div data-testid={`stat-invitation-${label}`} className="rounded-2xl border bg-card p-4 shadow-sm"><div className={`mb-3 flex items-center gap-2 text-xs font-bold ${accent}`}>{icon}{label}</div><div className="text-2xl font-extrabold">{value ?? "—"}</div></div>;
}

function InvitationRow({ item, link, whatsAppFallback, busy, onGenerate, onWhatsApp, onWhatsAppFallback, onCopy }: { item: { supplierId: number; name: string; city: string; whatsapp: string; inviteSentAt: string | null; inviteOpenedAt: string | null; inviteCompletedAt: string | null; requestStatus: string | null }; link?: string; whatsAppFallback?: string; busy: boolean; onGenerate: () => void; onWhatsApp: () => void; onWhatsAppFallback: () => void; onCopy: () => void }) {
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
          <span className={`h-2 w-2 rounded-full ${rejected ? "bg-destructive" : completed ? "bg-success" : item.inviteSentAt ? "bg-warning" : "bg-muted-foreground/40"}`} />
          <h3 data-testid={`text-invitation-name-${item.supplierId}`} className="font-extrabold">{item.name}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">{stateLabel}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{item.city} <span className="px-1">·</span> <span dir="ltr" className="inline-block">{item.whatsapp}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">الإرسال: {dateLabel(item.inviteSentAt)} · الفتح: {dateLabel(item.inviteOpenedAt)} · الإكمال: {dateLabel(item.inviteCompletedAt)}</p>
        {item.requestStatus && <p className={`mt-1 text-xs font-bold ${rejected ? "text-destructive" : "text-success"}`}>حالة طلب التسجيل: {requestLabel[item.requestStatus] || item.requestStatus}</p>}
      </div>
      {(!completed || rejected) && <div className="flex flex-wrap gap-2">
        {link && <button data-testid={`button-copy-invitation-${item.supplierId}`} type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted"><Clipboard className="h-3.5 w-3.5" /> نسخ الرابط</button>}
        <button data-testid={`button-generate-invitation-${item.supplierId}`} type="button" disabled={busy} onClick={onGenerate} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-60">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} إنشاء ونسخ الرابط</button>
        <button data-testid={`button-whatsapp-invitation-${item.supplierId}`} type="button" disabled={busy} onClick={onWhatsApp} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><MessageCircle className="h-3.5 w-3.5" /> فتح واتساب</button>
        {whatsAppFallback && <a data-testid={`link-whatsapp-fallback-${item.supplierId}`} href={whatsAppFallback} target="_blank" rel="noopener noreferrer" onClick={onWhatsAppFallback} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15"><MessageCircle className="h-3.5 w-3.5" /> متابعة الإرسال عبر واتساب</a>}
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