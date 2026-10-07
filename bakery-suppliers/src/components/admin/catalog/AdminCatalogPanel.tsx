import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronDown, CircleAlert, FolderTree, Languages, Layers3, PackagePlus, Plus, RefreshCw, ShieldCheck, Store, UsersRound, X } from "lucide-react";
import { getGetAdminSupplierCatalogQueryKey, getGetCatalogItemFiltersQueryKey, getListGroupsQueryKey, useCreateAdminCatalogAttributeOptions, useCreateAdminCatalogItemAttribute, useCreateAdminCatalogItemForm, useCreateAdminSupplierCatalogMaster, useCreateAdminSupplierCatalogSubtype, useGetAdminSupplierCatalog, useListGroups, useReviewAdminSupplierCatalogMasterProposal, useReviewAdminSupplierCatalogSubtype, useUpdateAdminSupplierCatalogMasterTranslation } from "@workspace/api-client-react";
import type { CatalogItemAttribute, CatalogItemForm } from "@workspace/api-client-react";

type CatalogEntry = {
  id: number;
  nameAr: string;
  nameEn: string;
  categoryId?: number | null;
  itemId?: number | null;
  categoryName?: string | null;
  itemName?: string | null;
  supplierName?: string | null;
  proposedBySupplierId?: number | null;
  status?: string;
  createdAt?: string | null;
  forms?: CatalogItemForm[];
  attributes?: CatalogItemAttribute[];
};
type CatalogResponse = {
  stats?: {
    supplierAccounts?: number;
    approvedSubtypes?: number;
    pendingProposals?: number;
    completeSupplierProfiles?: number;
    suppliers?: number;
    completeProfiles?: number;
    pendingSubtypes?: number;
    pendingMasterProposals?: number;
  };
  totals?: CatalogResponse["stats"];
  supplierAccounts?: number;
  approvedSubtypes?: number;
  pendingProposals?: number | { subtypes: CatalogEntry[]; masters: CatalogEntry[] };
  completeSupplierProfiles?: number;
  masters?: CatalogEntry[];
  masterCategories?: CatalogEntry[];
  items?: CatalogEntry[];
  subtypes?: CatalogEntry[];
  subtypeProposals?: CatalogEntry[];
  pendingSubtypes?: CatalogEntry[];
  masterProposals?: CatalogEntry[];
  pendingMasterProposals?: CatalogEntry[];
  groups?: { id: number; name: string; isActive?: boolean }[];
};
type Section = "review" | "masters" | "create";
type FormMode = "master" | "subtype";

const field = "w-full min-h-11 rounded-xl border border-input bg-background px-3.5 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-50";
const outlineButton = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 text-xs font-bold transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45";
const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";

function entries(value: unknown): CatalogEntry[] {
  return Array.isArray(value) ? value.filter((entry): entry is CatalogEntry => Boolean(entry && typeof entry === "object" && typeof entry.id === "number")) : [];
}
function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function BilingualName({ entry }: { entry: CatalogEntry }) {
  return <div className="min-w-0"><div className="font-bold text-foreground">{entry.nameAr || "اسم عربي غير متوفر"}</div><div dir="ltr" className="mt-0.5 text-right font-sans text-xs text-muted-foreground" lang="en">{entry.nameEn || "No English translation"}</div></div>;
}
function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-8 text-center"><CheckCircle2 className="mb-3 h-7 w-7 text-primary/65" strokeWidth={1.5} /><strong className="text-sm">{title}</strong><p className="mt-1 max-w-sm text-xs leading-6 text-muted-foreground">{detail}</p></div>;
}

type Names = { nameAr: string; nameEn: string };
type ConfigEditor = { kind: "form" | "attribute" | "options"; attributeId?: number };
const blankNames = (): Names => ({ nameAr: "", nameEn: "" });
const normalized = (value: string) => value.trim().toLocaleLowerCase();

function MasterConfigurations({ master, onSaved }: { master: CatalogEntry; onSaved: () => Promise<unknown> }) {
  const queryClient = useQueryClient();
  const createForm = useCreateAdminCatalogItemForm();
  const createAttribute = useCreateAdminCatalogItemAttribute();
  const createOptions = useCreateAdminCatalogAttributeOptions();
  const [editor, setEditor] = useState<ConfigEditor | null>(null);
  const [names, setNames] = useState<Names>(blankNames);
  const [values, setValues] = useState<Names[]>([blankNames(), blankNames()]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const forms = (master.forms ?? []).filter((form) => form.isActive !== false);
  const attributes = (master.attributes ?? []).filter((attribute) => attribute.isActive !== false);
  const activeAttribute = attributes.find((attribute) => attribute.id === editor?.attributeId);

  const openEditor = (next: ConfigEditor) => {
    setEditor(next);
    setNames(blankNames());
    setValues(next.kind === "attribute" ? [blankNames(), blankNames()] : [blankNames()]);
    setError("");
    setNotice("");
  };
  const closeEditor = () => { setEditor(null); setError(""); };
  const updateValue = (index: number, fieldName: keyof Names, value: string) =>
    setValues((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [fieldName]: value } : row));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || saving) return;
    const cleanNames = { nameAr: names.nameAr.trim(), nameEn: names.nameEn.trim() };
    const cleanValues = values.map((value) => ({ nameAr: value.nameAr.trim(), nameEn: value.nameEn.trim() }));
    if (editor.kind !== "options" && (!cleanNames.nameAr || !cleanNames.nameEn)) {
      setError("أدخل الاسم بالعربية والإنجليزية."); return;
    }
    if (editor.kind !== "form") {
      if (cleanValues.length < (editor.kind === "attribute" ? 2 : 1) || cleanValues.length > 50 || cleanValues.some((value) => !value.nameAr || !value.nameEn)) {
        setError(editor.kind === "attribute" ? "أدخل قيمتين على الأقل، مع اسم عربي وإنجليزي لكل قيمة." : "أدخل اسماً عربياً وإنجليزياً لكل قيمة."); return;
      }
      for (const language of ["nameAr", "nameEn"] as const) {
        const existing = editor.kind === "options" ? activeAttribute?.options.filter((option) => option.isActive !== false).map((option) => normalized(option[language])) ?? [] : [];
        const proposed = cleanValues.map((value) => normalized(value[language]));
        if (new Set([...existing, ...proposed]).size !== existing.length + proposed.length) {
          setError("لا يمكن تكرار القيمة نفسها أو إضافة قيمة موجودة مسبقاً."); return;
        }
      }
    }
    if (editor.kind === "form" && forms.some((form) => normalized(form.nameAr) === normalized(cleanNames.nameAr) || normalized(form.nameEn) === normalized(cleanNames.nameEn))) {
      setError("هذا الشكل موجود مسبقاً ضمن هذا الصنف."); return;
    }
    if (editor.kind === "attribute" && attributes.some((attribute) => normalized(attribute.nameAr) === normalized(cleanNames.nameAr) || normalized(attribute.nameEn) === normalized(cleanNames.nameEn))) {
      setError("هذه السمة موجودة مسبقاً ضمن هذا الصنف."); return;
    }
    if (editor.kind === "options" && !activeAttribute) { setError("لم تعد السمة متاحة. حدّث الكتالوج وحاول مجدداً."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editor.kind === "form") await createForm.mutateAsync({ id: master.id, data: cleanNames });
      else if (editor.kind === "attribute") await createAttribute.mutateAsync({ id: master.id, data: { ...cleanNames, options: cleanValues } });
      else await createOptions.mutateAsync({ id: editor.attributeId!, data: { options: cleanValues } });
      setNotice(editor.kind === "form" ? "أُضيف الشكل الأساسي." : editor.kind === "attribute" ? "أُضيفت السمة وقيمها." : "أُضيفت القيم إلى السمة.");
      closeEditor();
      await Promise.all([onSaved(), queryClient.invalidateQueries({ queryKey: getGetCatalogItemFiltersQueryKey() })]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التغيير. تحقق من البيانات وحاول مجدداً.");
    } finally {
      setSaving(false);
    }
  };
  const nameFields = (value: Names, onChange: (key: keyof Names, value: string) => void, prefix: string) => <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-xs font-bold">الاسم بالعربية<input data-testid={`input-${prefix}-ar-${master.id}`} className={field + " mt-1.5"} value={value.nameAr} onChange={(event) => onChange("nameAr", event.target.value)} maxLength={120} required disabled={saving} /></label>
    <label className="block text-xs font-bold">الاسم بالإنجليزية<input data-testid={`input-${prefix}-en-${master.id}`} dir="ltr" lang="en" className={field + " mt-1.5 text-left"} value={value.nameEn} onChange={(event) => onChange("nameEn", event.target.value)} maxLength={120} required disabled={saving} /></label>
  </div>;

  return <div data-testid={`panel-master-configurations-${master.id}`} className="space-y-5 border-t bg-secondary/20 px-4 py-5 sm:px-5">
    <p className="text-xs leading-6 text-muted-foreground">النوع الفرعي يحدد المنتج، والشكل الأساسي يحدد صورته التي تُباع بها. السمات الإضافية تصف خياراته عند الحاجة.</p>
    {notice && <div role="status" className="rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs text-success">{notice}</div>}
    <section aria-labelledby={`forms-heading-${master.id}`} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 id={`forms-heading-${master.id}`} className="text-sm font-extrabold">الأشكال الأساسية <span className="text-destructive">*</span></h5><p className="mt-1 text-xs text-muted-foreground">يختار المورد شكلاً واحداً عند عرض المنتج، مثل مسحوق أو سائل.</p></div><button type="button" data-testid={`button-add-form-${master.id}`} onClick={() => openEditor({ kind: "form" })} disabled={saving} className={outlineButton}><Plus className="h-3.5 w-3.5" />إضافة شكل جديد</button></div>
      {forms.length ? <ul className="mt-4 flex flex-wrap gap-2">{forms.map((form) => <li key={form.id} data-testid={`text-catalog-form-${form.id}`} className="rounded-xl border bg-secondary/35 px-3 py-2 text-xs"><span className="font-bold">{form.nameAr}</span><span dir="ltr" lang="en" className="mr-2 text-muted-foreground">{form.nameEn}</span></li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">لا توجد أشكال بعد. أضف شكلاً ليتمكن المورد من تحديد هيئة ما يبيعه.</p>}
    </section>
    <section aria-labelledby={`attributes-heading-${master.id}`} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 id={`attributes-heading-${master.id}`} className="text-sm font-extrabold">السمات الإضافية <span className="font-normal text-muted-foreground">(اختيارية)</span></h5><p className="mt-1 text-xs text-muted-foreground">تفاصيل تختلف بين العروض، مثل نسبة الدسم أو حجم العبوة.</p></div><button type="button" data-testid={`button-add-attribute-${master.id}`} onClick={() => openEditor({ kind: "attribute" })} disabled={saving} className={outlineButton}><Plus className="h-3.5 w-3.5" />إضافة سمة جديدة</button></div>
      {attributes.length ? <div className="mt-4 space-y-3">{attributes.map((attribute) => <div key={attribute.id} data-testid={`card-catalog-attribute-${attribute.id}`} className="rounded-xl border bg-secondary/20 p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs"><strong>{attribute.nameAr}</strong><span dir="ltr" lang="en" className="mr-2 text-muted-foreground">{attribute.nameEn}</span></div><button type="button" data-testid={`button-add-options-${attribute.id}`} onClick={() => openEditor({ kind: "options", attributeId: attribute.id })} disabled={saving} className={outlineButton}><Plus className="h-3.5 w-3.5" />إضافة قيم</button></div><ul className="mt-2 flex flex-wrap gap-1.5">{attribute.options.filter((option) => option.isActive !== false).map((option) => <li key={option.id} data-testid={`text-catalog-option-${option.id}`} className="rounded-lg bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">{option.nameAr} <span dir="ltr" lang="en">· {option.nameEn}</span></li>)}</ul></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">لا توجد سمات لهذا الصنف. أضف فقط ما يحتاجه المشتري لتمييز العروض.</p>}
    </section>
    {editor && <form onSubmit={(event) => void submit(event)} aria-label={editor.kind === "form" ? "إضافة شكل جديد" : editor.kind === "attribute" ? "إضافة سمة جديدة" : `إضافة قيم إلى ${activeAttribute?.nameAr ?? "السمة"}`} className="space-y-4 rounded-2xl border border-primary/25 bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2"><h6 className="text-sm font-extrabold">{editor.kind === "form" ? "شكل أساسي جديد" : editor.kind === "attribute" ? "سمة إضافية جديدة" : `قيم جديدة: ${activeAttribute?.nameAr ?? "السمة"}`}</h6><button type="button" data-testid={`button-cancel-config-${master.id}`} onClick={closeEditor} disabled={saving} aria-label="إغلاق النموذج" className={outlineButton}><X className="h-4 w-4" /></button></div>
      {editor.kind !== "options" && nameFields(names, (key, value) => setNames((current) => ({ ...current, [key]: value })), `config-${editor.kind}`)}
      {editor.kind !== "form" && <div className="space-y-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold">القيم {editor.kind === "attribute" && <span className="font-normal text-muted-foreground">— قيمتان على الأقل</span>}</p><span className="text-[11px] text-muted-foreground">{values.length} / 50</span></div>{values.map((value, index) => <div key={index} className="rounded-xl border bg-secondary/20 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-bold text-muted-foreground">القيمة {index + 1}</span>{values.length > (editor.kind === "attribute" ? 2 : 1) && <button type="button" data-testid={`button-remove-config-value-${master.id}-${index}`} onClick={() => setValues((current) => current.filter((_, rowIndex) => rowIndex !== index))} disabled={saving} className="text-xs font-bold text-destructive underline">حذف القيمة</button>}</div>{nameFields(value, (key, next) => updateValue(index, key, next), `config-value-${index}`)}</div>)}<button type="button" data-testid={`button-add-config-value-${master.id}`} onClick={() => setValues((current) => [...current, blankNames()])} disabled={saving || values.length >= 50} className={outlineButton}><Plus className="h-3.5 w-3.5" />إضافة قيمة أخرى</button></div>}
      {error && <p role="alert" data-testid={`status-config-error-${master.id}`} className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" data-testid={`button-save-config-${master.id}`} disabled={saving} className={primaryButton}>{saving ? "جارٍ الحفظ..." : "حفظ"}</button><button type="button" onClick={closeEditor} disabled={saving} className={outlineButton}>إلغاء</button></div>
    </form>}
  </div>;
}

export default function AdminCatalogPanel({ refreshKey }: { refreshKey: number }) {
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [section, setSection] = useState<Section>("review");
  const [formMode, setFormMode] = useState<FormMode>("master");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [groupId, setGroupId] = useState("");
  const [itemId, setItemId] = useState("");
  const [proposalGroups, setProposalGroups] = useState<Record<number, string>>({});
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedMasterId, setExpandedMasterId] = useState<number | null>(null);
  const [editEnglish, setEditEnglish] = useState("");
  const catalogQuery = useGetAdminSupplierCatalog({ query: { queryKey: getGetAdminSupplierCatalogQueryKey() } });
  const groupsQuery = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });
  const createMaster = useCreateAdminSupplierCatalogMaster();
  const createSubtype = useCreateAdminSupplierCatalogSubtype();
  const reviewSubtype = useReviewAdminSupplierCatalogSubtype();
  const reviewMaster = useReviewAdminSupplierCatalogMasterProposal();
  const updateTranslation = useUpdateAdminSupplierCatalogMasterTranslation();
  const catalog = catalogQuery.data as CatalogResponse | undefined;
  const loading = catalogQuery.isFetching;
  const fetchError = catalogQuery.error instanceof Error ? catalogQuery.error.message : catalogQuery.isError ? "تعذر تحميل الكتالوج." : "";

  useEffect(() => { if (refreshKey > 0) void catalogQuery.refetch(); }, [refreshKey]); // Parent refresh only.

  const mutate = async (key: string, path: string, _method: "POST" | "PATCH", body: object, message: string, done?: () => void) => {
    if (busy) return;
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      const payload = body as { nameAr?: string; nameEn?: string; categoryId?: number; itemId?: number; decision?: "approved" | "rejected" };
      const id = Number(path.split("/")[5]);
      if (key === "create-master") await createMaster.mutateAsync({ data: { nameAr: payload.nameAr!, nameEn: payload.nameEn!, categoryId: payload.categoryId! } });
      else if (key === "create-subtype") await createSubtype.mutateAsync({ data: { itemId: payload.itemId!, nameAr: payload.nameAr!, nameEn: payload.nameEn! } });
      else if (key.startsWith("master-")) await reviewMaster.mutateAsync({ id, data: { decision: payload.decision!, ...(payload.categoryId ? { categoryId: payload.categoryId } : {}) } });
      else if (key.startsWith("subtype-")) await reviewSubtype.mutateAsync({ id, data: { decision: payload.decision! } });
      else await updateTranslation.mutateAsync({ id, data: { nameEn: payload.nameEn! } });
      done?.();
      setNotice(message);
      await catalogQuery.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "تعذر حفظ التغيير. حاول مجدداً.");
    } finally {
      setBusy("");
    }
  };

  const masters = entries(catalog?.masters ?? catalog?.masterCategories ?? catalog?.items).filter((entry) => (entry as CatalogEntry & { isActive?: boolean }).isActive !== false);
  const subtypes = entries(catalog?.subtypes);
  const subtypeProposals = entries(catalog?.subtypeProposals ?? catalog?.pendingSubtypes ?? subtypes.filter((entry) => entry.status === "pending"));
  const masterProposals = entries(catalog?.masterProposals ?? catalog?.pendingMasterProposals).filter((entry) => !entry.status || entry.status === "pending");
  const groups = (catalog?.groups ?? groupsQuery.data ?? []).filter((group) => group.isActive !== false);
  const stats = catalog?.stats ?? catalog?.totals;
  const metrics = [
    { label: "حسابات الموردين", value: stats?.supplierAccounts ?? stats?.suppliers ?? catalog?.supplierAccounts, icon: UsersRound },
    { label: "الأنواع المعتمدة", value: stats?.approvedSubtypes ?? catalog?.approvedSubtypes ?? subtypes.filter((entry) => entry.status === "approved").length, icon: Layers3 },
    { label: "مقترحات تنتظر المراجعة", value: stats?.pendingProposals ?? (typeof catalog?.pendingProposals === "number" ? catalog.pendingProposals : undefined) ?? subtypeProposals.length + masterProposals.length, icon: FolderTree },
    { label: "ملفات الموردين المكتملة", value: stats?.completeSupplierProfiles ?? stats?.completeProfiles ?? catalog?.completeSupplierProfiles, icon: Store },
  ];

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nameAr.trim() || !nameEn.trim()) return;
    if (formMode === "master") {
      if (!groupId || !groups.some((group) => group.id === Number(groupId))) return;
      void mutate("create-master", "/api/admin/catalog/masters", "POST", { nameAr: nameAr.trim(), nameEn: nameEn.trim(), categoryId: Number(groupId) }, "أُضيف الصنف الرئيسي إلى الكتالوج.", () => { setNameAr(""); setNameEn(""); setGroupId(""); setSection("masters"); });
    } else {
      if (!itemId || !masters.some((master) => master.id === Number(itemId))) return;
      void mutate("create-subtype", "/api/admin/catalog/subtypes", "POST", { itemId: Number(itemId), nameAr: nameAr.trim(), nameEn: nameEn.trim() }, "أُضيف النوع المعتمد إلى الكتالوج.", () => { setNameAr(""); setNameEn(""); setItemId(""); setSection("masters"); });
    }
  };

  return <div dir="rtl" className="space-y-5" data-testid="panel-admin-catalog">
    <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-secondary/55 px-5 py-6 sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -left-12 -top-16 h-52 w-52 rounded-full border-[32px] border-primary/[.055]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold text-primary"><ShieldCheck className="h-4 w-4" /> حوكمة الأصناف</div><h3 className="text-xl font-extrabold sm:text-2xl">كتالوج واضح، أسماء موحّدة.</h3><p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">راجع اقتراحات الموردين بالعربية والإنجليزية، وثبّت الأصناف الرئيسية والأنواع في مرجع واحد للدليل.</p></div>
        <button data-testid="button-refresh-admin-catalog" type="button" onClick={() => void catalogQuery.refetch()} disabled={loading} className={outlineButton + " shrink-0 self-start sm:self-auto"}><RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} /> تحديث الكتالوج</button>
      </div>
    </div>

    {notice && <div role="status" data-testid="status-catalog-success" className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success"><Check className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {actionError && <div role="alert" data-testid="status-catalog-action-error" className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{actionError}</div>}

    {loading && !catalog ? <div className="space-y-5" aria-label="جاري تحميل الكتالوج"><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[0, 1, 2, 3].map((value) => <div key={value} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div> :
      fetchError && !catalog ? <div role="alert" className="rounded-2xl border border-destructive/25 bg-card p-7 text-center"><CircleAlert className="mx-auto mb-3 h-8 w-8 text-destructive" /><strong>تعذر عرض بيانات الكتالوج</strong><p className="mt-2 text-sm text-muted-foreground">{fetchError}</p><button data-testid="button-retry-admin-catalog" type="button" onClick={() => void catalogQuery.refetch()} className={primaryButton + " mt-5"}>إعادة المحاولة</button></div> : <>
        {fetchError && <div role="alert" className="rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">تعذر تحديث الكتالوج. البيانات المعروضة من آخر تحميل ناجح. <button type="button" onClick={() => void catalogQuery.refetch()} className="font-bold underline">إعادة المحاولة</button></div>}
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">{metrics.map(({ label, value, icon: Icon }, index) => <div key={label} className={"rounded-2xl border px-4 py-3.5 sm:px-5 sm:py-4 " + (index === 2 ? "border-primary/25 bg-primary text-primary-foreground" : "bg-card")}><div className={"mb-3 flex items-center justify-between gap-2 text-[11px] font-bold sm:text-xs " + (index === 2 ? "text-primary-foreground/80" : "text-muted-foreground")}><span>{label}</span><Icon className="h-4 w-4 shrink-0" /></div><div data-testid={`text-catalog-metric-${index}`} className="text-2xl font-extrabold leading-none tabular-nums sm:text-3xl">{typeof value === "number" ? new Intl.NumberFormat("ar-SA").format(value) : "—"}</div></div>)}</div>

        <div className="flex flex-wrap items-center gap-1 rounded-2xl border bg-card p-1.5" role="tablist" aria-label="أقسام الكتالوج">
          {([{ id: "review", label: "قيد المراجعة", icon: ShieldCheck }, { id: "masters", label: "الأصناف المعتمدة", icon: FolderTree }, { id: "create", label: "إضافة إلى الكتالوج", icon: Plus }] as const).map(({ id, label, icon: Icon }) => <button key={id} data-testid={`button-catalog-section-${id}`} role="tab" aria-selected={section === id} type="button" onClick={() => setSection(id)} className={"inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-colors sm:text-sm " + (section === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}><Icon className="h-4 w-4" />{label}{id === "review" && subtypeProposals.length + masterProposals.length > 0 && <span className={"rounded-full px-1.5 text-[10px] " + (section === id ? "bg-primary-foreground/20" : "bg-secondary")}>{subtypeProposals.length + masterProposals.length}</span>}</button>)}
        </div>

        {section === "review" && <div role="tabpanel" className="space-y-6">
          <div className="flex items-baseline justify-between gap-3"><div><h4 className="text-lg font-extrabold">طلبات الاعتماد</h4><p className="mt-1 text-xs text-muted-foreground">قرارك يحدد ما يظهر في الكتالوج الرسمي.</p></div><span className="text-xs font-bold text-muted-foreground">{masterProposals.length + subtypeProposals.length} بانتظار القرار</span></div>
          <section aria-labelledby="master-proposals-heading"><div className="mb-3 flex items-center gap-2"><FolderTree className="h-4 w-4 text-primary" /><h5 id="master-proposals-heading" className="text-sm font-extrabold">أصناف رئيسية مقترحة</h5><span className="text-xs text-muted-foreground">({masterProposals.length})</span></div>
            {masterProposals.length === 0 ? <EmptyBlock title="لا توجد أصناف رئيسية معلّقة" detail="ستظهر هنا الأسماء التي يقترح الموردون إضافتها إلى الشجرة الرسمية." /> : <div className="divide-y overflow-hidden rounded-2xl border bg-card">{masterProposals.map((proposal) => {
              const key = `master-${proposal.id}`;
              const selectedGroup = proposalGroups[proposal.id] ?? "";
              return <article key={proposal.id} data-testid={`card-master-proposal-${proposal.id}`} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(170px,220px)_auto] lg:items-center">
                <div><div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1"><span className="text-[10px] font-extrabold tracking-wide text-primary">صنف رئيسي جديد</span>{proposal.createdAt && <span className="text-[10px] text-muted-foreground">{dateLabel(proposal.createdAt)}</span>}</div><BilingualName entry={proposal} />{proposal.supplierName && <p className="mt-1 text-[11px] text-muted-foreground">اقترحه: {proposal.supplierName}</p>}</div>
                <label className="block text-xs font-bold">المجموعة المعتمدة <select data-testid={`select-master-proposal-group-${proposal.id}`} value={selectedGroup} onChange={(event) => setProposalGroups((current) => ({ ...current, [proposal.id]: event.target.value }))} disabled={Boolean(busy)} className={field + " mt-1.5"}><option value="">اختر مجموعة نشطة</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                <div className="flex flex-wrap gap-2 lg:justify-end"><button data-testid={`button-approve-master-proposal-${proposal.id}`} type="button" disabled={Boolean(busy) || !groups.some((group) => group.id === Number(selectedGroup))} onClick={() => void mutate(key, `/api/admin/catalog/master-proposals/${proposal.id}/review`, "PATCH", { decision: "approved", categoryId: Number(selectedGroup) }, "اعتُمد الصنف الرئيسي ضمن المجموعة المختارة.", () => setConfirmReject(null))} className={primaryButton}><Check className="h-4 w-4" />{busy === key ? "جارٍ الحفظ..." : "اعتماد"}</button><button data-testid={`button-reject-master-proposal-${proposal.id}`} type="button" disabled={Boolean(busy)} onClick={() => setConfirmReject(confirmReject === key ? null : key)} className={outlineButton + " text-destructive"}><X className="h-3.5 w-3.5" />رفض</button></div>
                {confirmReject === key && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-xs lg:col-span-3"><span className="font-bold text-destructive">تأكيد رفض المقترح؟</span><button data-testid={`button-confirm-reject-master-proposal-${proposal.id}`} type="button" disabled={Boolean(busy)} onClick={() => void mutate(key, `/api/admin/catalog/master-proposals/${proposal.id}/review`, "PATCH", { decision: "rejected" }, "رُفض مقترح الصنف الرئيسي.", () => setConfirmReject(null))} className={outlineButton}>نعم، ارفض</button><button type="button" onClick={() => setConfirmReject(null)} className="px-2 font-bold text-muted-foreground">إلغاء</button></div>}
              </article>;
            })}</div>}
          </section>
          <section aria-labelledby="subtype-proposals-heading"><div className="mb-3 flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /><h5 id="subtype-proposals-heading" className="text-sm font-extrabold">أنواع فرعية مقترحة</h5><span className="text-xs text-muted-foreground">({subtypeProposals.length})</span></div>
            {subtypeProposals.length === 0 ? <EmptyBlock title="لا توجد أنواع فرعية معلّقة" detail="لا توجد اقتراحات تحتاج إلى مراجعة الآن؛ الأنواع المعتمدة ظاهرة في الكتالوج." /> : <div className="divide-y overflow-hidden rounded-2xl border bg-card">{subtypeProposals.map((proposal) => {
              const key = `subtype-${proposal.id}`;
              const parent = masters.find((master) => master.id === proposal.itemId);
              return <article key={proposal.id} data-testid={`card-subtype-proposal-${proposal.id}`} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span className="font-bold text-primary">تحت: {proposal.itemName || parent?.nameAr || "صنف رئيسي"}</span>{proposal.supplierName ? <span>اقترحه: {proposal.supplierName}</span> : proposal.proposedBySupplierId ? <span>المورد #{proposal.proposedBySupplierId}</span> : null}{proposal.createdAt && <span>{dateLabel(proposal.createdAt)}</span>}</div><BilingualName entry={proposal} /></div><div className="flex shrink-0 flex-wrap gap-2"><button data-testid={`button-approve-subtype-${proposal.id}`} type="button" disabled={Boolean(busy)} onClick={() => void mutate(key, `/api/admin/catalog/subtypes/${proposal.id}/review`, "PATCH", { decision: "approved" }, "اعتُمد النوع الفرعي في الكتالوج.", () => setConfirmReject(null))} className={primaryButton}><Check className="h-4 w-4" />{busy === key ? "جارٍ الحفظ..." : "اعتماد"}</button><button data-testid={`button-reject-subtype-${proposal.id}`} type="button" disabled={Boolean(busy)} onClick={() => setConfirmReject(confirmReject === key ? null : key)} className={outlineButton + " text-destructive"}><X className="h-3.5 w-3.5" />رفض</button></div>{confirmReject === key && <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-destructive/5 p-3 text-xs sm:basis-full"><span className="font-bold text-destructive">تأكيد رفض النوع؟</span><button data-testid={`button-confirm-reject-subtype-${proposal.id}`} type="button" disabled={Boolean(busy)} onClick={() => void mutate(key, `/api/admin/catalog/subtypes/${proposal.id}/review`, "PATCH", { decision: "rejected" }, "رُفض اقتراح النوع الفرعي.", () => setConfirmReject(null))} className={outlineButton}>نعم، ارفض</button><button type="button" onClick={() => setConfirmReject(null)} className="px-2 font-bold text-muted-foreground">إلغاء</button></div>}</article>;
            })}</div>}
          </section>
        </div>}

        {section === "masters" && <div role="tabpanel" className="space-y-4"><div><h4 className="text-lg font-extrabold">المرجع المعتمد</h4><p className="mt-1 text-xs text-muted-foreground">الأسماء العربية ثابتة في الكتالوج؛ يمكن للمدير تحسين ترجمتها الإنجليزية فقط.</p></div>{masters.length === 0 ? <EmptyBlock title="لم تُضف أصناف رئيسية بعد" detail="اعتمد مقترحاً من قائمة المراجعة أو أضف صنفاً رئيسياً جديداً." /> : <div className="divide-y overflow-hidden rounded-2xl border bg-card">{masters.map((master) => {
          const key = `edit-${master.id}`;
          const group = groups.find((entry) => entry.id === master.categoryId);
          return <div key={master.id} data-testid={`row-catalog-master-${master.id}`}>
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0"><BilingualName entry={master} /><div className="mt-1 text-[11px] text-muted-foreground">{master.categoryName || group?.name || "مجموعة غير محددة"}</div></div>
              <div className="flex flex-wrap items-center gap-2">
                {editingId === master.id ? <form className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (editEnglish.trim()) void mutate(key, `/api/admin/catalog/masters/${master.id}`, "PATCH", { nameEn: editEnglish.trim() }, "حُدّثت الترجمة الإنجليزية.", () => setEditingId(null)); }}><input data-testid={`input-master-english-${master.id}`} aria-label={`الترجمة الإنجليزية لـ ${master.nameAr}`} dir="ltr" lang="en" className={field} value={editEnglish} maxLength={120} required onChange={(event) => setEditEnglish(event.target.value)} disabled={Boolean(busy)} /><div className="flex gap-2"><button data-testid={`button-save-master-english-${master.id}`} type="submit" disabled={Boolean(busy) || !editEnglish.trim()} className={primaryButton}>{busy === key ? "جارٍ الحفظ..." : "حفظ"}</button><button data-testid={`button-cancel-master-english-${master.id}`} type="button" onClick={() => setEditingId(null)} disabled={Boolean(busy)} className={outlineButton}>إلغاء</button></div></form> : <button data-testid={`button-edit-master-english-${master.id}`} type="button" onClick={() => { setEditingId(master.id); setEditEnglish(master.nameEn || ""); }} className={outlineButton}><Languages className="h-3.5 w-3.5" />تعديل الإنجليزية</button>}
                <button type="button" data-testid={`button-manage-master-configurations-${master.id}`} aria-expanded={expandedMasterId === master.id} aria-controls={`master-configurations-${master.id}`} onClick={() => setExpandedMasterId((current) => current === master.id ? null : master.id)} className={outlineButton + " border-primary/25 text-primary"}>الأشكال والسمات <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (expandedMasterId === master.id ? "rotate-180" : "")} /></button>
              </div>
            </div>
            {expandedMasterId === master.id && <div id={`master-configurations-${master.id}`}><MasterConfigurations master={master} onSaved={() => catalogQuery.refetch()} /></div>}
          </div>;
        })}</div>}</div>}

        {section === "create" && <div role="tabpanel" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]"><div className="rounded-2xl border bg-card p-5 sm:p-7"><div className="mb-6"><h4 className="text-lg font-extrabold">إضافة مباشرة إلى المرجع</h4><p className="mt-1 text-xs leading-6 text-muted-foreground">الإضافات هنا معتمدة فوراً. لا يمكن للمورد تغيير اسم الصنف الرئيسي المعتمد.</p></div><div className="mb-6 flex flex-wrap gap-2"><button data-testid="button-create-master-mode" type="button" onClick={() => { setFormMode("master"); setNameAr(""); setNameEn(""); }} className={formMode === "master" ? primaryButton : outlineButton}><FolderTree className="h-4 w-4" />صنف رئيسي</button><button data-testid="button-create-subtype-mode" type="button" onClick={() => { setFormMode("subtype"); setNameAr(""); setNameEn(""); }} className={formMode === "subtype" ? primaryButton : outlineButton}><Layers3 className="h-4 w-4" />نوع فرعي</button></div><form onSubmit={submitCreate} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold">الاسم بالعربية <input data-testid="input-catalog-name-ar" className={field + " mt-1.5"} value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={120} required placeholder="مثال: دقيق القمح" disabled={Boolean(busy)} /></label><label className="block text-xs font-bold">الاسم بالإنجليزية <input data-testid="input-catalog-name-en" dir="ltr" lang="en" className={field + " mt-1.5 text-left"} value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={120} required placeholder="e.g. Wheat flour" disabled={Boolean(busy)} /></label></div>{formMode === "master" ? <label className="block text-xs font-bold">المجموعة النشطة <select data-testid="select-catalog-create-group" className={field + " mt-1.5"} value={groupId} onChange={(event) => setGroupId(event.target.value)} required disabled={Boolean(busy)}><option value="">اختر المجموعة</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{groups.length === 0 && <span className="mt-1 block text-destructive">لا توجد مجموعة نشطة متاحة. تحقق من إعدادات المجموعات.</span>}</label> : <label className="block text-xs font-bold">الصنف الرئيسي المعتمد <select data-testid="select-catalog-create-master" className={field + " mt-1.5"} value={itemId} onChange={(event) => setItemId(event.target.value)} required disabled={Boolean(busy)}><option value="">اختر الصنف الرئيسي</option>{masters.map((master) => <option key={master.id} value={master.id}>{master.nameAr}{master.nameEn ? ` — ${master.nameEn}` : ""}</option>)}</select>{masters.length === 0 && <span className="mt-1 block text-destructive">أضف صنفاً رئيسياً أولاً.</span>}</label>}<button data-testid="button-submit-catalog-create" type="submit" disabled={Boolean(busy) || !nameAr.trim() || !nameEn.trim() || (formMode === "master" ? !groups.some((group) => group.id === Number(groupId)) : !masters.some((master) => master.id === Number(itemId)))} className={primaryButton + " mt-2"}><PackagePlus className="h-4 w-4" />{busy.startsWith("create-") ? "جارٍ الإضافة..." : formMode === "master" ? "إضافة الصنف الرئيسي" : "إضافة النوع المعتمد"}</button></form></div><aside className="self-start rounded-2xl border border-primary/15 bg-secondary/40 p-5"><ShieldCheck className="mb-4 h-5 w-5 text-primary" /><h5 className="text-sm font-extrabold">مرجع واحد للجميع</h5><p className="mt-2 text-xs leading-7 text-muted-foreground">المجموعة تنظّم ظهور الصنف في الدليل. النوع الفرعي يتبع صنفاً رئيسياً معتمداً، وأسماء الأصناف الرئيسية لا يغيّرها الموردون.</p><ChevronDown className="mt-5 h-4 w-4 text-primary/40" /></aside></div>}
      </>}
  </div>;
}