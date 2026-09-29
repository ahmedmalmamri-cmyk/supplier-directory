import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Layers3, PackagePlus, Pencil, Plus, Search, Send, Trash2, X } from "lucide-react";
import { getGetSupplierCatalogQueryKey, useGetSupplierCatalog, useCreateSupplierCatalogOffer, useUpdateSupplierCatalogOffer, useDeleteSupplierCatalogOffer, useCreateSupplierCatalogMasterProposal, type SupplierCatalogOfferInput } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useSupplierAuth } from "@/lib/supplier-auth";

type Status = "approved" | "pending" | "rejected";
type Subtype = { id: number; itemId?: number; nameAr: string; nameEn: string; status?: Status };
type MasterItem = { id: number; name: string; nameAr?: string; nameEn?: string; subtypes?: Subtype[] };
type Offer = { id: number; itemId: number; subtypeId: number | null; itemName?: string; subtypeNameAr?: string; subtypeNameEn?: string; subtype?: Subtype | null; newSubtype?: { nameAr: string; nameEn: string } | null; price: number | null; status: Status; isActive?: boolean; removedAt?: string | null; rejectionReason?: string | null };
type MasterProposal = { id: number; nameAr: string; nameEn: string; status: Status; rejectionReason?: string | null };
type Catalog = { profileComplete: boolean; items: MasterItem[]; subtypes?: Subtype[]; offers: Offer[]; masterProposals?: MasterProposal[] };
const catalogKey = getGetSupplierCatalogQueryKey();

function normalized(text: string) {
  return text.normalize("NFKD").replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLocaleLowerCase().trim();
}
function fuzzyScore(value: string, query: string) {
  const text = normalized(value);
  const needle = normalized(query);
  if (!needle) return 1;
  if (text === needle) return 100;
  if (text.startsWith(needle)) return 70;
  if (text.includes(needle)) return 50;
  let cursor = 0;
  for (const char of text) if (char === needle[cursor]) cursor++;
  return cursor === needle.length ? 10 : 0;
}
function statusInfo(status: Status) {
  if (status === "approved") return { text: "معتمد", icon: CheckCircle2, className: "bg-success/10 text-success border-success/20" };
  if (status === "rejected") return { text: "مرفوض", icon: AlertCircle, className: "bg-destructive/10 text-destructive border-destructive/20" };
  return { text: "قيد المراجعة", icon: Clock3, className: "bg-warning/10 text-warning border-warning/20" };
}
function StatusBadge({ status }: { status: Status }) {
  const info = statusInfo(status);
  const Icon = info.icon;
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${info.className}`}><Icon className="h-3.5 w-3.5" />{info.text}</span>;
}
function parsePrice(value: string): number | null | undefined {
  if (!value.trim()) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}
function priceLabel(price: number | null) {
  return price === null ? "السعر غير محدد" : `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(price)} ر.س`;
}
function Field({ label, value, onChange, placeholder, latin = false, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; latin?: boolean; testId: string }) {
  return <label className="block text-sm font-bold">{label}<input data-testid={testId} value={value} onChange={event => onChange(event.target.value)} dir={latin ? "ltr" : "rtl"} maxLength={120} placeholder={placeholder} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-medium outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>;
}

export default function SupplierCatalogPage() {
  const { supplier, isLoading } = useSupplierAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const query = useGetSupplierCatalog({ query: { queryKey: [...catalogKey, supplier?.id], enabled: !isLoading && !!supplier } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...catalogKey, supplier?.id] });
  const addOffer = useCreateSupplierCatalogOffer({ mutation: { onSuccess: refresh } });
  const changePrice = useUpdateSupplierCatalogOffer({ mutation: { onSuccess: refresh } });
  const removeOffer = useDeleteSupplierCatalogOffer({ mutation: { onSuccess: refresh } });
  const proposeMaster = useCreateSupplierCatalogMasterProposal({ mutation: { onSuccess: refresh } });
  const [itemId, setItemId] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [subtypeSearch, setSubtypeSearch] = useState("");
  const [selectedSubtype, setSelectedSubtype] = useState<Subtype | null>(null);
  const [subtypeOpen, setSubtypeOpen] = useState(false);
  const [newSubtypeOpen, setNewSubtypeOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [price, setPrice] = useState("");
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterAr, setMasterAr] = useState("");
  const [masterEn, setMasterEn] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !supplier) navigate("/supplier/login", { replace: true });
  }, [isLoading, supplier, navigate]);
  useEffect(() => {
    const error = query.error as (Error & { status?: number }) | null;
    if (error?.status === 401) navigate("/supplier/login", { replace: true });
  }, [query.error, navigate]);
  const catalog: Catalog | undefined = query.data && {
    profileComplete: query.data.profileComplete,
    items: query.data.masters.map(master => ({ id: master.id, name: master.name, nameEn: master.nameEn ?? undefined, subtypes: master.subtypes })),
    offers: query.data.masters.flatMap(master => master.offers.map(offer => {
      const subtype = master.subtypes.find(type => type.id === offer.subtypeId);
      return { ...offer, itemId: master.id, itemName: master.name, subtypeNameAr: subtype?.nameAr, subtypeNameEn: subtype?.nameEn, status: (subtype?.status === "rejected" ? "rejected" : offer.eligibilityStatus === "pending" || !subtype || subtype.status === "pending" ? "pending" : "approved") as Status };
    })),
    masterProposals: query.data.pendingProposals.masters,
  };
  const pendingSubtypes = query.data?.pendingProposals.subtypes ?? [];
  const items = catalog?.items ?? [];
  const currentItem = items.find(item => item.id === itemId);
  const availableSubtypes = useMemo(() => {
    const all = [...(currentItem?.subtypes ?? []), ...(catalog?.subtypes ?? []).filter(type => type.itemId === itemId)];
    return all.filter((type, index) => type.status !== "pending" && type.status !== "rejected" && all.findIndex(other => other.id === type.id) === index);
  }, [currentItem, catalog?.subtypes, itemId]);
  const matches = useMemo(() => availableSubtypes.map(type => ({ type, score: Math.max(fuzzyScore(type.nameAr, subtypeSearch), fuzzyScore(type.nameEn, subtypeSearch)) })).filter(match => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 8), [availableSubtypes, subtypeSearch]);
  const displayedItems = items.filter(item => fuzzyScore(`${item.nameAr ?? item.name} ${item.nameEn ?? ""}`, itemSearch) > 0);
  const offers = (catalog?.offers ?? []).filter(offer => offer.isActive !== false && !offer.removedAt);
  const visibleOffers = offers.filter(offer => filter === "all" || offer.status === filter);
  const counts = { approved: offers.filter(offer => offer.status === "approved").length, pending: offers.filter(offer => offer.status === "pending").length, rejected: offers.filter(offer => offer.status === "rejected").length };
  const busy = addOffer.isPending || changePrice.isPending || removeOffer.isPending || proposeMaster.isPending;

  const clearForm = () => { setSelectedSubtype(null); setSubtypeSearch(""); setNameAr(""); setNameEn(""); setPrice(""); setNewSubtypeOpen(false); setSubtypeOpen(false); };
  const chooseItem = (id: number) => { setItemId(id); clearForm(); setFeedback(null); };
  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    const parsed = parsePrice(price);
    if (parsed === undefined) return setFeedback({ kind: "error", text: "أدخل سعراً صالحاً لا يقل عن صفر، أو اترك الحقل فارغاً." });
    if (!itemId || (!selectedSubtype && !newSubtypeOpen)) return setFeedback({ kind: "error", text: "اختر نوعاً معتمداً أو اقترح نوعاً جديداً." });
    if (newSubtypeOpen && (!nameAr.trim() || !nameEn.trim())) return setFeedback({ kind: "error", text: "اكتب اسم النوع بالعربية والإنجليزية قبل الإضافة." });
    try {
      const input: SupplierCatalogOfferInput = { itemId, ...(newSubtypeOpen ? { newSubtype: { nameAr: nameAr.trim(), nameEn: nameEn.trim() } } : { subtypeId: selectedSubtype!.id }), price: parsed };
      await addOffer.mutateAsync({ data: input });
      clearForm();
      setFeedback({ kind: "success", text: newSubtypeOpen ? "أُضيف العرض وأُرسل النوع الجديد للمراجعة. لن يظهر للمشترين حتى اعتماده." : "أُضيف العرض إلى قائمتك بنجاح." });
    } catch (error) { setFeedback({ kind: "error", text: error instanceof Error ? error.message : "تعذر إضافة العرض." }); }
  };
  const submitMaster = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (!masterAr.trim() || !masterEn.trim()) return setFeedback({ kind: "error", text: "اكتب اسم الصنف الرئيسي بالعربية والإنجليزية." });
    try {
      await proposeMaster.mutateAsync({ data: { nameAr: masterAr.trim(), nameEn: masterEn.trim() } });
      setMasterAr(""); setMasterEn(""); setMasterOpen(false);
      setFeedback({ kind: "success", text: "وصل اقتراح الصنف الرئيسي للمراجعة. الأصناف المعتمدة لا تتغير أسماؤها." });
    } catch (error) { setFeedback({ kind: "error", text: error instanceof Error ? error.message : "تعذر إرسال الاقتراح." }); }
  };
  const savePrice = async (id: number) => {
    const parsed = parsePrice(editingPrice);
    if (parsed === undefined) return setFeedback({ kind: "error", text: "أدخل سعراً صالحاً لا يقل عن صفر، أو اترك الحقل فارغاً." });
    setFeedback(null);
    try { await changePrice.mutateAsync({ id, data: { price: parsed } }); setEditingId(null); setFeedback({ kind: "success", text: "تم تحديث السعر." }); }
    catch (error) { setFeedback({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحديث السعر." }); }
  };
  const confirmRemove = async (id: number) => {
    setFeedback(null);
    try { await removeOffer.mutateAsync({ id }); setRemovingId(null); setFeedback({ kind: "success", text: "أُزيل العرض من قائمتك." }); }
    catch (error) { setFeedback({ kind: "error", text: error instanceof Error ? error.message : "تعذر إزالة العرض." }); }
  };

  return <MainLayout><div dir="rtl" className="supplier-workspace min-h-[100dvh] flex-1 pb-20">
    <div className="supplier-hero border-b border-border/80"><div className="container mx-auto max-w-6xl px-4 pb-8 pt-8 md:pb-10 md:pt-12">
      <div className="mb-4 flex items-center gap-2 text-xs font-extrabold text-primary"><BookOpen className="h-4 w-4" /> مساحة المورد <span className="text-muted-foreground">/ كتالوج التوريد</span></div>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold md:text-[2.7rem]" data-testid="text-supplier-page-title">ما الذي تورّده؟</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">حدد الأصناف وأنواعها بدقة ليعثر عليك أصحاب الأعمال المناسبون. الإعلان هنا ليس تأكيداً للمخزون الفوري.</p></div><Link href="/supplier/dashboard" data-testid="link-catalog-dashboard" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-2.5 text-sm font-bold hover:bg-card"><ArrowLeft className="h-4 w-4" /> لوحة المورد</Link></div>
      <nav aria-label="أقسام مساحة المورد" className="mt-7 flex gap-2 overflow-x-auto pb-1 text-sm font-bold"><Link href="/supplier/dashboard" className="shrink-0 rounded-xl bg-card/80 px-4 py-2.5 text-muted-foreground hover:bg-muted">نظرة عامة</Link><span aria-current="page" className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground">كتالوج التوريد</span><Link href="/supplier/almond-variants" className="shrink-0 rounded-xl bg-card/80 px-4 py-2.5 text-muted-foreground hover:bg-muted">أصناف اللوز</Link><Link href="/supplier/market" className="shrink-0 rounded-xl bg-card/80 px-4 py-2.5 text-muted-foreground hover:bg-muted">السوق</Link></nav>
    </div></div>
    <div className="container mx-auto max-w-6xl px-4 pt-7 md:pt-9">
      {isLoading || (supplier && query.isPending) ? <div role="status" aria-label="جارٍ تحميل كتالوج التوريد" className="space-y-5"><span className="sr-only">جارٍ تحميل الكتالوج</span><div className="h-28 animate-pulse rounded-3xl bg-secondary" /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="h-96 animate-pulse rounded-3xl bg-secondary" /><div className="h-96 animate-pulse rounded-3xl bg-secondary" /></div></div>
      : query.error ? <div role="alert" className="supplier-panel max-w-xl p-7"><AlertCircle className="h-6 w-6 text-destructive" /><h2 className="mt-3 text-xl font-extrabold">تعذر تحميل الكتالوج</h2><p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p><button type="button" data-testid="button-retry-catalog" onClick={() => void query.refetch()} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">إعادة المحاولة</button></div>
      : catalog && <>
        <section data-testid="status-catalog-profile" className={`relative overflow-hidden rounded-[1.5rem] border p-5 md:p-7 ${catalog.profileComplete ? "border-success/25 bg-success/5" : "border-warning/30 bg-secondary/70"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className={`mt-0.5 rounded-2xl p-3 ${catalog.profileComplete ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{catalog.profileComplete ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}</span><div><p className="text-xs font-extrabold text-muted-foreground">حالة ظهور ملفك في بحث المشترين</p><h2 className="mt-0.5 text-xl font-extrabold" data-testid="text-catalog-profile-complete">{catalog.profileComplete ? "ملفك مؤهل للظهور" : "ملفك مخفي من نتائج البحث"}</h2><p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">{catalog.profileComplete ? "لديك عرض نشط لنوع معتمد واحد على الأقل. أكّد التوفر الفعلي عند التواصل مع المشتري." : "يلزم عرض نشط لنوع فرعي معتمد واحد على الأقل للظهور، حتى إن كان ملف المورد موجوداً من قبل. العروض قيد المراجعة أو المرفوضة لا تكفي."}</p></div></div><span className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold ${catalog.profileComplete ? "border-success/25 text-success" : "border-warning/30 text-warning"}`}>{catalog.profileComplete ? "ظاهر في البحث" : "غير ظاهر في البحث"}</span></div>
        </section>
        {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} data-testid="status-catalog-feedback" className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${feedback.kind === "error" ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-success/20 bg-success/5 text-success"}`}>{feedback.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}{feedback.text}<button type="button" data-testid="button-dismiss-catalog-feedback" aria-label="إغلاق الرسالة" onClick={() => setFeedback(null)} className="ms-auto rounded p-0.5 hover:bg-foreground/5"><X className="h-4 w-4" /></button></div>}
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,.76fr)_minmax(0,1.24fr)]">
          <section className="supplier-panel overflow-hidden" aria-labelledby="master-heading"><div className="border-b border-border bg-secondary/30 px-5 py-5 md:px-6"><div className="flex items-start gap-3"><Layers3 className="mt-1 h-5 w-5 text-primary" /><div><h2 id="master-heading" className="text-lg font-extrabold">الأصناف الرئيسية</h2><p className="text-xs leading-6 text-muted-foreground">أسماء معتمدة وثابتة؛ اختر صنفاً لإضافة ما تورّده تحته.</p></div></div><div className="relative mt-4"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input data-testid="input-search-master-items" value={itemSearch} onChange={event => setItemSearch(event.target.value)} placeholder="ابحث عن صنف رئيسي" className="h-10 w-full rounded-xl border border-input bg-card pe-3 ps-10 text-sm outline-none focus:border-primary" /></div></div>
            <div className="max-h-[420px] overflow-y-auto p-2">{displayedItems.length ? displayedItems.map(item => <button type="button" key={item.id} data-testid={`button-select-master-${item.id}`} onClick={() => chooseItem(item.id)} className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-start text-sm font-bold transition-colors ${itemId === item.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary/60"}`}><span>{item.nameAr ?? item.name}</span><span className="shrink-0 text-xs opacity-60">{item.nameEn}</span></button>) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">لا يوجد صنف مطابق. يمكنك اقتراح صنف جديد أدناه.</p>}</div>
            <div className="border-t border-border p-3"><button type="button" data-testid="button-toggle-master-proposal" onClick={() => setMasterOpen(!masterOpen)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-extrabold text-primary hover:bg-primary/5"><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> اقترح صنفاً رئيسياً جديداً</span><ChevronDown className={`h-4 w-4 transition-transform ${masterOpen ? "rotate-180" : ""}`} /></button>{masterOpen && <form onSubmit={submitMaster} className="mt-3 space-y-3 rounded-xl bg-secondary/35 p-4"><p className="text-xs leading-6 text-muted-foreground">اقتراحك يذهب للمراجعة؛ لا يغيّر أسماء الأصناف المعتمدة.</p><Field label="الاسم بالعربية" value={masterAr} onChange={setMasterAr} placeholder="اسم الصنف المقترح" testId="input-master-name-ar" /><Field label="الاسم بالإنجليزية" value={masterEn} onChange={setMasterEn} placeholder="Master category name" latin testId="input-master-name-en" /><button type="submit" data-testid="button-submit-master-proposal" disabled={busy || !masterAr.trim() || !masterEn.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground disabled:opacity-50"><Send className="h-3.5 w-3.5" />{proposeMaster.isPending ? "جارٍ الإرسال..." : "إرسال للمراجعة"}</button></form>}</div>
          </section>
          <section className="supplier-panel p-5 md:p-6" aria-labelledby="offer-heading"><div className="flex items-start gap-3"><PackagePlus className="mt-1 h-5 w-5 text-primary" /><div><p className="text-xs font-extrabold text-primary">إضافة عرض</p><h2 id="offer-heading" className="mt-0.5 text-xl font-extrabold">{currentItem ? currentItem.nameAr ?? currentItem.name : "ابدأ باختيار صنف رئيسي"}</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">يمكنك إضافة عدة أنواع تحت الصنف نفسه. السعر اختياري ويمكن تغييره لاحقاً.</p></div></div>
            {currentItem ? <form onSubmit={submitOffer} className="mt-6 space-y-5"><div><label htmlFor="subtype-search" className="text-sm font-extrabold">النوع الفرعي المعتمد</label><div className="relative mt-2"><Search className="absolute start-3.5 top-3.5 h-4 w-4 text-muted-foreground" /><input id="subtype-search" role="combobox" aria-autocomplete="list" aria-expanded={subtypeOpen} aria-controls="catalog-subtype-options" autoComplete="off" data-testid="input-search-subtype" value={selectedSubtype && !subtypeOpen ? selectedSubtype.nameAr : subtypeSearch} onChange={event => { setSubtypeSearch(event.target.value); setSelectedSubtype(null); setSubtypeOpen(true); setNewSubtypeOpen(false); }} onFocus={() => { setSubtypeOpen(true); if (selectedSubtype) { setSubtypeSearch(""); setSelectedSubtype(null); } }} onKeyDown={event => { if (event.key === "Escape") setSubtypeOpen(false); if (event.key === "Enter" && subtypeOpen && matches.length) { event.preventDefault(); setSelectedSubtype(matches[0].type); setSubtypeOpen(false); setSubtypeSearch(""); } }} placeholder="ابحث بالعربية أو الإنجليزية..." className="h-12 w-full rounded-xl border border-input bg-background pe-4 ps-10 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />{selectedSubtype && <Check className="absolute end-3.5 top-3.5 h-4 w-4 text-success" />}</div>
              {subtypeOpen && !newSubtypeOpen && <div id="catalog-subtype-options" role="listbox" className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-warm-lg">{matches.length ? matches.map(({ type }) => <button type="button" role="option" aria-selected={selectedSubtype?.id === type.id} key={type.id} data-testid={`button-select-subtype-${type.id}`} onClick={() => { setSelectedSubtype(type); setSubtypeOpen(false); setSubtypeSearch(""); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-secondary"><span className="font-bold">{type.nameAr}</span><span dir="ltr" className="text-xs text-muted-foreground">{type.nameEn}</span></button>) : <p className="px-3 py-4 text-xs text-muted-foreground">لم نعثر على نوع مطابق؛ يمكنك اقتراحه أدناه.</p>}</div>}
              <button type="button" data-testid="button-toggle-new-subtype" onClick={() => { setNewSubtypeOpen(!newSubtypeOpen); setSelectedSubtype(null); setSubtypeOpen(false); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline"><Plus className="h-3.5 w-3.5" />{newSubtypeOpen ? "العودة إلى الأنواع المعتمدة" : "النوع غير موجود؟ اقترح نوعاً جديداً"}</button></div>
              {newSubtypeOpen && <div className="grid gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><p className="text-sm font-extrabold">اقتراح نوع جديد</p><p className="text-xs text-muted-foreground">يظل العرض قيد المراجعة حتى اعتماد النوع.</p></div><Field label="اسم النوع بالعربية" value={nameAr} onChange={setNameAr} placeholder="مثال: لوز شرائح" testId="input-subtype-name-ar" /><Field label="اسم النوع بالإنجليزية" value={nameEn} onChange={setNameEn} placeholder="Subtype name" latin testId="input-subtype-name-en" /></div>}
              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-[1fr_auto] sm:items-end"><label className="block text-sm font-bold">السعر المقترح <span className="font-medium text-muted-foreground">(اختياري، ر.س)</span><input type="number" min="0" step="any" inputMode="decimal" data-testid="input-offer-price" value={price} onChange={event => setPrice(event.target.value)} placeholder="اتركه فارغاً إذا لم تحدد سعراً" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary" /></label><button type="submit" data-testid="button-add-catalog-offer" disabled={busy || (!selectedSubtype && !newSubtypeOpen) || (newSubtypeOpen && (!nameAr.trim() || !nameEn.trim()))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"><Plus className="h-4 w-4" />{addOffer.isPending ? "جارٍ الإضافة..." : "أضف العرض"}</button></div>
            </form> : <div className="mt-8 flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 px-6 text-center"><Layers3 className="mb-3 h-7 w-7 text-primary/60" /><p className="font-bold">اختر صنفاً من القائمة</p><p className="mt-1 text-sm text-muted-foreground">ثم حدد نوعاً معتمداً أو أرسل اقتراحاً جديداً.</p></div>}
          </section>
        </div>
        <section className="supplier-panel mt-5 overflow-hidden" aria-labelledby="offers-heading"><div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5 md:px-6"><div><p className="text-xs font-extrabold text-primary">إعلاناتك</p><h2 id="offers-heading" className="mt-1 text-xl font-extrabold">الأنواع التي توردها <span className="text-base text-muted-foreground">({offers.length.toLocaleString("ar-SA")})</span></h2></div><div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary/50 p-1 text-xs font-bold">{(["all", "approved", "pending", "rejected"] as const).map(key => <button type="button" key={key} data-testid={`button-filter-offers-${key}`} onClick={() => setFilter(key)} className={`shrink-0 rounded-lg px-3 py-2 transition-colors ${filter === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{key === "all" ? `الكل ${offers.length}` : `${statusInfo(key).text} ${counts[key]}`}</button>)}</div></div>
          {visibleOffers.length ? <div className="divide-y divide-border">{visibleOffers.map(offer => <div key={offer.id} data-testid={`row-catalog-offer-${offer.id}`} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{offer.subtype?.nameAr ?? offer.subtypeNameAr ?? offer.newSubtype?.nameAr ?? "نوع مقترح"}</strong><StatusBadge status={offer.status} /></div><p className="mt-1 text-xs text-muted-foreground">{offer.itemName ?? items.find(item => item.id === offer.itemId)?.nameAr ?? items.find(item => item.id === offer.itemId)?.name ?? "صنف رئيسي"}{(offer.subtype?.nameEn ?? offer.subtypeNameEn ?? offer.newSubtype?.nameEn) && <span dir="ltr"> · {offer.subtype?.nameEn ?? offer.subtypeNameEn ?? offer.newSubtype?.nameEn}</span>}</p>{offer.status === "rejected" && offer.rejectionReason && <p className="mt-1 text-xs text-destructive">سبب الرفض: {offer.rejectionReason}</p>}</div><div className="flex flex-wrap items-center gap-2 md:justify-end">{editingId === offer.id ? <div className="flex flex-wrap items-center gap-2"><input type="number" min="0" step="any" inputMode="decimal" aria-label="السعر الجديد بالريال" data-testid={`input-edit-price-${offer.id}`} value={editingPrice} onChange={event => setEditingPrice(event.target.value)} placeholder="بدون سعر" className="h-9 w-32 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-primary" /><button type="button" data-testid={`button-save-price-${offer.id}`} disabled={busy} onClick={() => void savePrice(offer.id)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{changePrice.isPending ? "جارٍ الحفظ..." : "حفظ"}</button><button type="button" data-testid={`button-cancel-price-${offer.id}`} onClick={() => setEditingId(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">إلغاء</button></div> : <><span className="me-1 text-sm font-bold" data-testid={`text-offer-price-${offer.id}`}>{priceLabel(offer.price)}</span><button type="button" aria-label={`تعديل سعر ${offer.subtype?.nameAr ?? offer.subtypeNameAr ?? "العرض"}`} data-testid={`button-edit-price-${offer.id}`} disabled={busy} onClick={() => { setEditingId(offer.id); setEditingPrice(offer.price?.toString() ?? ""); setRemovingId(null); }} className="rounded-lg border p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50"><Pencil className="h-4 w-4" /></button></>}{removingId === offer.id ? <div className="flex items-center gap-2 rounded-lg bg-destructive/5 px-2 py-1"><span className="text-xs font-bold text-destructive">إزالة العرض؟</span><button type="button" data-testid={`button-confirm-remove-${offer.id}`} disabled={busy} onClick={() => void confirmRemove(offer.id)} className="rounded-md bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-50">تأكيد</button><button type="button" data-testid={`button-cancel-remove-${offer.id}`} onClick={() => setRemovingId(null)} className="text-xs font-bold">إلغاء</button></div> : <button type="button" aria-label={`إزالة العرض ${offer.subtype?.nameAr ?? offer.subtypeNameAr ?? ""}`} data-testid={`button-remove-offer-${offer.id}`} disabled={busy} onClick={() => { setRemovingId(offer.id); setEditingId(null); }} className="rounded-lg border p-2 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div> : <div className="px-6 py-12 text-center"><PackagePlus className="mx-auto h-8 w-8 text-primary/50" /><h3 className="mt-3 font-extrabold">{offers.length ? "لا توجد عروض بهذه الحالة" : "قائمتك لم تبدأ بعد"}</h3><p className="mt-1 text-sm text-muted-foreground">{offers.length ? "اختر حالة أخرى للاطلاع على عروضك." : "اختر صنفاً رئيسياً من الأعلى وأضف أول نوع تورّده."}</p></div>}</section>
        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_.75fr]"><section className="supplier-panel p-5 md:p-6"><h2 className="flex items-center gap-2 text-base font-extrabold"><Send className="h-4 w-4 text-primary" /> اقتراحات الأصناف</h2>{(catalog.masterProposals?.length || pendingSubtypes.length) ? <div className="mt-4 divide-y divide-border">{catalog.masterProposals?.map(proposal => <div key={`master-${proposal.id}`} data-testid={`row-master-proposal-${proposal.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-bold">{proposal.nameAr} <span dir="ltr" className="font-medium text-muted-foreground">/ {proposal.nameEn}</span></p><p className="text-xs text-muted-foreground">صنف رئيسي جديد</p>{proposal.rejectionReason && <p className="text-xs text-destructive">{proposal.rejectionReason}</p>}</div><StatusBadge status={proposal.status} /></div>)}{pendingSubtypes.map(proposal => <div key={`subtype-${proposal.id}`} data-testid={`row-subtype-proposal-${proposal.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-bold">{proposal.nameAr} <span dir="ltr" className="font-medium text-muted-foreground">/ {proposal.nameEn}</span></p><p className="text-xs text-muted-foreground">نوع تحت {items.find(item => item.id === proposal.itemId)?.name ?? "صنف رئيسي"}</p></div><StatusBadge status="pending" /></div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">لا توجد اقتراحات أصناف حالياً.</p>}</section><aside className="rounded-[1.5rem] border border-primary/15 bg-secondary/50 p-5 md:p-6"><h2 className="flex items-center gap-2 text-base font-extrabold"><CircleHelp className="h-5 w-5 text-primary" /> عن دقة الإعلانات</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">ما تضيفه هنا يصف نطاق توريدك، لا الكميات المتاحة الآن ولا وعداً بسعر نهائي. تحقق من السعر والمخزون وموعد التسليم مباشرة مع المشتري.</p></aside></div>
      </>}
    </div>
  </div></MainLayout>;
}