import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeftRight, Check, ChevronDown, ChevronUp, FolderTree, History, Layers3, Pencil, Plus, RefreshCw, Search, Tags, Trash2, X } from "lucide-react";
import {
  getGetAdminCategoryStatsQueryKey, getListAdminActivityLogQueryKey, getListAdminGroupsQueryKey, getListAdminItemCategoriesQueryKey,
  getListGroupsQueryKey, getListItemCategoriesQueryKey, getListSuppliersQueryKey, getSearchDirectoryQueryKey,
  useCreateAdminGroup, useUpdateAdminGroup, useDeleteAdminGroup, useListAdminGroups,
  useListAdminItemCategories, useCreateAdminItemCategory, useUpdateAdminItemCategory,
  useTransferAdminItemCategory, useDeleteAdminItemCategory, usePermanentlyDeleteAdminItemCategory, useSetAdminItemCategoryTags,
  useListAdminActivityLog, useGetAdminItemCategoryDeletionPreview, getGetAdminItemCategoryDeletionPreviewQueryKey,
  type Group, type AdminItemCategory, type ItemCategoryDeletionPreview,
} from "@workspace/api-client-react";
import { EmojiPickerField, EmojiSuggestions } from "./emoji-picker-field";
import { CategoryIconValue, categoryIconText } from "./category-special-icons";

type Dialog =
  | { kind: "group"; group?: Group }
  | { kind: "category"; category?: AdminItemCategory; groupId?: number }
  | { kind: "move"; category: AdminItemCategory }
  | { kind: "tags"; category: AdminItemCategory }
  | { kind: "delete-category"; category: AdminItemCategory }
  | { kind: "delete-group"; group: Group };
type Notice = { message: string; error: boolean } | null;
const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const subtleButton = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold transition hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";
const mainButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";
const fmt = (number: number) => number.toLocaleString("ar-SA");
function isTemporaryApi404(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error) || error.status !== 404 || !("data" in error)) return false;
  return typeof error.data === "string" && /<\s*(?:!doctype|html)\b/i.test(error.data);
}
function errorMessage(error: unknown) {
  if (isTemporaryApi404(error)) return "خدمة الإدارة غير متاحة مؤقتاً. لم يُحذف التصنيف؛ انتظر قليلاً ثم أعد المحاولة.";
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  }
  if (error instanceof TypeError) return "تعذّر الاتصال بالخادم. تأكد من الاتصال ثم أعد المحاولة.";
  return error instanceof Error ? error.message : "تعذّر حفظ التغيير. حاول مرة أخرى.";
}

export default function AdminItemCategoriesTab() {
  const client = useQueryClient();
  const groupsQuery = useListAdminGroups();
  const categoriesQuery = useListAdminItemCategories();
  const activityQuery = useListAdminActivityLog();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [activityOpen, setActivityOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", icon: "", parentId: "", displayOrder: 0, isActive: true });
  const [categoryForm, setCategoryForm] = useState({ name: "", icon: "", primaryGroupId: "", subGroupId: "", displayOrder: 0, description: "", isActive: true });
  const [destinationId, setDestinationId] = useState("");
  const [destinationSubGroupId, setDestinationSubGroupId] = useState("");
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [deletionReviewed, setDeletionReviewed] = useState(false);
  const reviewingInactiveCategory = dialog?.kind === "delete-category" && !dialog.category.isActive;
  const previewId = reviewingInactiveCategory ? dialog.category.id : 0;
  const deletionPreview = useGetAdminItemCategoryDeletionPreview(previewId, {
    query: { queryKey: getGetAdminItemCategoryDeletionPreviewQueryKey(previewId), enabled: reviewingInactiveCategory, retry: false, refetchOnWindowFocus: false },
  });
  const groups = useMemo(() => [...(groupsQuery.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id), [groupsQuery.data]);
  const rootGroups = groups.filter((group) => group.parentId === null);
  const categories = (categoriesQuery.data ?? []).filter((category) => category.primaryGroupId !== null);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: getListAdminGroupsQueryKey() }),
      client.invalidateQueries({ queryKey: getListAdminItemCategoriesQueryKey() }),
      client.invalidateQueries({ queryKey: getGetAdminCategoryStatsQueryKey() }),
      client.invalidateQueries({ queryKey: getListAdminActivityLogQueryKey() }),
      client.invalidateQueries({ queryKey: getListGroupsQueryKey() }),
      client.invalidateQueries({ queryKey: getListItemCategoriesQueryKey() }),
      client.invalidateQueries({ queryKey: getListSuppliersQueryKey() }),
      client.invalidateQueries({ queryKey: getSearchDirectoryQueryKey() }),
    ]);
  };
  const success = (message: string) => { setDialog(null); setNotice({ message, error: false }); void invalidate(); };
  const failure = (error: unknown) => setNotice({ message: errorMessage(error), error: true });
  const createGroup = useCreateAdminGroup({ mutation: { onSuccess: () => success("أُضيفت المجموعة إلى الدليل."), onError: failure } });
  const updateGroup = useUpdateAdminGroup({ mutation: { onSuccess: () => success("حُفظت تغييرات المجموعة."), onError: failure } });
  const deleteGroup = useDeleteAdminGroup({ mutation: { onSuccess: () => success("حُذفت المجموعة."), onError: failure } });
  const createCategory = useCreateAdminItemCategory({ mutation: { onSuccess: () => success("أُضيف التصنيف إلى المجموعة."), onError: failure } });
  const updateCategory = useUpdateAdminItemCategory({ mutation: { onSuccess: () => success("حُفظت تغييرات التصنيف."), onError: failure } });
  const transferCategory = useTransferAdminItemCategory({ mutation: { onSuccess: () => success("نُقل التصنيف إلى مجموعته الرئيسية الجديدة."), onError: failure } });
  const deleteCategory = useDeleteAdminItemCategory({ mutation: {
    retry: (failureCount, error) => failureCount < 5 && isTemporaryApi404(error),
    retryDelay: (attempt) => Math.min(1500 * (attempt + 1), 6000),
    onSuccess: () => success("عُطّل التصنيف وأُزيل من المجموعات العامة."),
    onError: failure,
  } });
  const permanentlyDeleteCategory = usePermanentlyDeleteAdminItemCategory({ mutation: {
    onSuccess: () => success("حُذف التصنيف نهائياً."),
    onError: failure,
  } });
  const setTags = useSetAdminItemCategoryTags({ mutation: { onSuccess: () => success("حُفظت جميع مجموعات الوسوم."), onError: failure } });
  const pending = createGroup.isPending || updateGroup.isPending || deleteGroup.isPending || createCategory.isPending || transferCategory.isPending || deleteCategory.isPending || permanentlyDeleteCategory.isPending || setTags.isPending;

  const openGroup = (group?: Group) => {
    setNotice(null);
    setGroupForm(group ? { name: group.name, icon: group.icon, parentId: String(group.parentId ?? ""), displayOrder: group.displayOrder, isActive: group.isActive } : { name: "", icon: "", parentId: "", displayOrder: rootGroups.length ? Math.max(...rootGroups.map((g) => g.displayOrder)) + 1 : 0, isActive: true });
    setDialog({ kind: "group", group });
  };
  const openCategory = (category?: AdminItemCategory, groupId?: number) => {
    setNotice(null);
    setCategoryForm(category
      ? { name: category.name, icon: category.icon, primaryGroupId: String(category.primaryGroupId ?? ""), subGroupId: String(category.subGroupId ?? ""), displayOrder: category.displayOrder, description: category.description ?? "", isActive: category.isActive }
      : { name: "", icon: "", primaryGroupId: String(groupId && groups.find((group) => group.id === groupId)?.parentId ? groups.find((group) => group.id === groupId)?.parentId : groupId ?? rootGroups.find((group) => group.isActive)?.id ?? ""), subGroupId: groupId && groups.find((group) => group.id === groupId)?.parentId ? String(groupId) : "", displayOrder: 0, description: "", isActive: true });
    setDialog({ kind: "category", category, groupId });
  };
  const openTags = (category: AdminItemCategory) => {
    setNotice(null);
    setTagIds(category.tagGroupIds.filter((id) => id !== category.primaryGroupId));
    setDialog({ kind: "tags", category });
  };
  const onGroupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = { ...groupForm, name: groupForm.name.trim(), icon: groupForm.icon.trim(), parentId: groupForm.parentId ? Number(groupForm.parentId) : null, displayOrder: Number(groupForm.displayOrder) };
    if (!data.name || !data.icon) return setNotice({ error: true, message: "اسم المجموعة وأيقونتها مطلوبان." });
    if (dialog?.kind === "group" && dialog.group) updateGroup.mutate({ id: dialog.group.id, data });
    else createGroup.mutate({ data });
  };
  const onCategorySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const primaryGroupId = Number(categoryForm.primaryGroupId);
    const name = categoryForm.name.trim(), icon = categoryForm.icon.trim();
    const subGroupId = categoryForm.subGroupId ? Number(categoryForm.subGroupId) : null;
    if (!name || !groupById.get(primaryGroupId)?.isActive || groupById.get(primaryGroupId)?.parentId !== null) return setNotice({ error: true, message: "أدخل الاسم واختر مجموعة رئيسية نشطة." });
    if (groups.some((group) => group.parentId === primaryGroupId && group.isActive) && !subGroupId) return setNotice({ error: true, message: "اختر التقسيم الداخلي لهذا القسم." });
    if (dialog?.kind === "category" && dialog.category) {
      updateCategory.mutate({ id: dialog.category.id, data: { name, icon, primaryGroupId, subGroupId, displayOrder: Number(categoryForm.displayOrder), description: categoryForm.description.trim() || null, isActive: categoryForm.isActive } });
    } else createCategory.mutate({ data: { name, icon, primaryGroupId, subGroupId, description: categoryForm.description.trim() || null } });
  };

  const term = search.trim().toLocaleLowerCase("ar");
  const filteredGroups = groups.filter((group) => {
    const members = categories.filter((item) => group.parentId === null ? item.primaryGroupId === group.id || item.tagGroupIds.includes(group.id) : item.subGroupId === group.id);
    const statusMatch = (item: AdminItemCategory) => status === "all" || item.isActive === (status === "active");
    return (!term || group.name.toLocaleLowerCase("ar").includes(term) || members.some((item) => item.name.toLocaleLowerCase("ar").includes(term))) &&
      (status === "all" || members.some(statusMatch) || (!term && group.isActive === (status === "active")));
  });
  const shownMembers = (group: Group) => categories.filter((item) =>
    (group.parentId === null ? item.primaryGroupId === group.id || item.tagGroupIds.includes(group.id) : item.subGroupId === group.id) &&
    (status === "all" || item.isActive === (status === "active")) &&
    (!term || group.name.toLocaleLowerCase("ar").includes(term) || item.name.toLocaleLowerCase("ar").includes(term))
  ).sort((a, b) => (a.primaryGroupId === group.id ? 0 : 1) - (b.primaryGroupId === group.id ? 0 : 1) || a.displayOrder - b.displayOrder || a.id - b.id);

  return <section dir="rtl" aria-label="إدارة مجموعات وتصنيفات المنتجات" className="space-y-5">
    <header className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-7">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary"><FolderTree className="h-4 w-4" /> فهرس العمليات / تصنيفات المنتجات</div>
          <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">نظّم ما يبحث عنه المخبز</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">مجموعات واضحة للمواد والمكونات، وتصنيف رئيسي واحد لكل صنف مع وسوم لمجموعات أخرى.</p></div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="button-refresh-categories" type="button" className={subtleButton} onClick={() => { void groupsQuery.refetch(); void categoriesQuery.refetch(); void activityQuery.refetch(); }}><RefreshCw className="h-4 w-4" /> تحديث</button>
          <button data-testid="button-add-group" type="button" className={subtleButton} onClick={() => openGroup()}><Plus className="h-4 w-4" /> إضافة مجموعة</button>
          <button data-testid="button-add-category" type="button" className={mainButton} onClick={() => openCategory()} disabled={!groups.some((g) => g.isActive)}><Plus className="h-4 w-4" /> إضافة تصنيف</button>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x-reverse divide-x border-t bg-secondary/15 md:grid-cols-4">
        <Metric icon={<FolderTree className="h-4 w-4" />} label="المجموعات" value={groups.length} />
        <Metric icon={<Layers3 className="h-4 w-4" />} label="التصنيفات" value={categories.length} />
        <Metric icon={<Check className="h-4 w-4" />} label="تصنيفات نشطة" value={categories.filter((item) => item.isActive).length} />
        <Metric icon={<Tags className="h-4 w-4" />} label="وسوم إضافية" value={categories.reduce((sum, item) => sum + item.tagGroupIds.filter((id) => id !== item.primaryGroupId).length, 0)} />
      </div>
    </header>

    {notice && <div role={notice.error ? "alert" : "status"} data-testid="status-category-action" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${notice.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-foreground"}`}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice.message}</span><button type="button" data-testid="button-dismiss-category-notice" aria-label="إغلاق التنبيه" className="mr-auto p-1" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button></div>}

    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
      <label className="relative min-w-0 flex-1"><span className="sr-only">ابحث في المجموعات والتصنيفات</span><Search className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /><input data-testid="input-category-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن مجموعة أو تصنيف..." className={`${field} pr-10`} /></label>
      <select data-testid="select-category-status-filter" aria-label="تصفية حسب حالة التصنيف" className={`${field} sm:w-44`} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">كل الحالات</option><option value="active">النشطة فقط</option><option value="inactive">المعطلة فقط</option></select>
      <span data-testid="text-group-result-count" className="shrink-0 text-xs text-muted-foreground">{fmt(filteredGroups.length)} من {fmt(groups.length)} مجموعات</span>
    </div>

    {groupsQuery.isLoading || categoriesQuery.isLoading ? <div role="status" aria-label="جاري تحميل التصنيفات" className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border bg-muted/60" />)}</div>
      : groupsQuery.isError || categoriesQuery.isError ? <State title="تعذّر تحميل الفهرس" detail="تأكد من الاتصال ثم أعد المحاولة." action={<button type="button" data-testid="button-retry-categories" className={mainButton} onClick={() => { void groupsQuery.refetch(); void categoriesQuery.refetch(); }}>إعادة المحاولة</button>} />
      : groups.length === 0 ? <State title="لا توجد مجموعات بعد" detail="ابدأ بإضافة مجموعة لتنظيم تصنيفات المكونات." action={<button type="button" className={mainButton} onClick={() => openGroup()}>إضافة مجموعة</button>} />
      : filteredGroups.length === 0 ? <State title="لا توجد نتائج مطابقة" detail="جرّب اسماً آخر أو غيّر فلتر الحالة." />
      : <div className="space-y-3">{filteredGroups.map((group) => {
        const members = shownMembers(group);
        const open = expanded.has(group.id) || Boolean(term);
        return <article key={group.id} data-testid={`group-row-${group.id}`} className="overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:border-primary/30">
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <button type="button" data-testid={`button-expand-group-${group.id}`} aria-expanded={open} onClick={() => setExpanded((previous) => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className="flex min-w-0 flex-1 items-center gap-3 text-right focus-visible:outline-2 focus-visible:outline-primary">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-2xl" aria-label={`أيقونة ${group.name}`}><CategoryIconValue icon={group.icon} /></span>
              <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong data-testid={`text-group-name-${group.id}`} className="text-base">{group.name}</strong><Pill active={group.isActive} /></span><span className="mt-1 block text-xs text-muted-foreground">{group.parentId !== null && <>{groupById.get(group.parentId)?.name} · </>}{fmt(group.categoryCount)} تصنيف · {fmt(group.supplierCount)} مورد · الترتيب {fmt(group.displayOrder)}</span></span>
              {open ? <ChevronUp className="mr-auto h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="mr-auto h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid={`button-add-category-${group.id}`} disabled={!group.isActive} className={subtleButton} onClick={() => openCategory(undefined, group.id)}><Plus className="h-3.5 w-3.5" /> تصنيف</button>
              <button type="button" data-testid={`button-edit-group-${group.id}`} className={subtleButton} onClick={() => openGroup(group)}><Pencil className="h-3.5 w-3.5" /> تعديل</button>
              <button type="button" data-testid={`button-delete-group-${group.id}`} className={`${subtleButton} text-destructive`} onClick={() => { setNotice(null); setDialog({ kind: "delete-group", group }); }}><Trash2 className="h-3.5 w-3.5" /> حذف</button>
            </div>
          </div>
          {open && <div className="border-t bg-background/50 p-2 md:p-3">{members.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد تصنيفات مطابقة في هذه المجموعة.</div> : <div className="space-y-2">{members.map((item) => <div key={item.id} data-testid={`category-row-${group.id}-${item.id}`} className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/40 text-lg" aria-label={`أيقونة ${item.name}`}><CategoryIconValue icon={item.icon} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong data-testid={`text-category-name-${item.id}`} className="text-sm">{item.name}</strong><Pill active={item.isActive} /><span className="text-xs text-muted-foreground">{fmt(item.supplierCount)} مورد</span></div>
               <div className="mt-1.5 flex flex-wrap gap-1">{item.primaryGroupId && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">رئيسية: {groupById.get(item.primaryGroupId)?.name ?? item.groupName}</span>}{item.subGroupId && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">تقسيم: {groupById.get(item.subGroupId)?.name}</span>}{item.tagGroupIds.filter((id) => id !== item.primaryGroupId).map((id) => <span key={id} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">وسم: {groupById.get(id)?.name ?? `مجموعة ${id}`}</span>)}</div>
            </div></div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid={`button-edit-category-${item.id}`} className={subtleButton} onClick={() => openCategory(item)}><Pencil className="h-3.5 w-3.5" /> تعديل</button>
              <button type="button" data-testid={`button-tags-category-${item.id}`} className={subtleButton} onClick={() => openTags(item)}><Tags className="h-3.5 w-3.5" /> الوسوم</button>
               <button type="button" data-testid={`button-move-category-${item.id}`} className={subtleButton} onClick={() => { setNotice(null); setDestinationId(""); setDestinationSubGroupId(""); setDialog({ kind: "move", category: item }); }}><ArrowLeftRight className="h-3.5 w-3.5" /> نقل</button>
                <button type="button" data-testid={`button-delete-category-${item.id}`} className={`${subtleButton} text-destructive`} onClick={() => { setNotice(null); setDeletionReviewed(false); setDialog({ kind: "delete-category", category: item }); }}><Trash2 className="h-3.5 w-3.5" /> حذف</button>
            </div>
          </div>)}</div>}</div>}
        </article>;
      })}</div>}

    <div className="overflow-hidden rounded-2xl border bg-card"><button type="button" data-testid="button-toggle-category-activity" aria-expanded={activityOpen} onClick={() => setActivityOpen(!activityOpen)} className="flex w-full items-center justify-between p-4 text-right text-sm font-bold hover:bg-muted/40"><span className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> سجل نشاط التصنيفات</span>{activityOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
       {activityOpen && <div className="space-y-2 border-t p-4">{activityQuery.isLoading ? <div className="h-14 animate-pulse rounded-lg bg-muted" /> : activityQuery.isError ? <button type="button" className={subtleButton} onClick={() => void activityQuery.refetch()}>تعذّر تحميل السجل · إعادة المحاولة</button> : !activityQuery.data?.length ? <p className="text-sm text-muted-foreground">لا يوجد نشاط مسجل بعد.</p> : activityQuery.data.map((entry) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-xs"><span className="font-bold">{entry.actionType === "delete" && entry.newValue?.permanentlyDeleted === true ? "حذف نهائي" : (({ add: "إضافة", edit: "تعديل", transfer: "نقل", delete: "تعطيل" } as Record<string, string>)[entry.actionType] ?? entry.actionType)} · {entry.entityType === "category" ? "تصنيف" : entry.entityType} #{entry.entityId}</span><time className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString("ar-SA")}</time></div>)}</div>}
    </div>

    {dialog?.kind === "group" && <Modal title={dialog.group ? "تعديل المجموعة" : "مجموعة جديدة"} onClose={() => setDialog(null)}>
      <form onSubmit={onGroupSubmit} className="space-y-4">
        <Label text="اسم المجموعة"><input required maxLength={100} data-testid="input-group-name" className={field} value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} /></Label>
        <EmojiSuggestions name={groupForm.name} onSelect={(icon) => setGroupForm((form) => ({ ...form, icon }))} />
        <div><span className="mb-1.5 block text-xs font-extrabold">الأيقونة</span><EmojiPickerField idPrefix="group-icon" name={groupForm.name} value={groupForm.icon} onChange={(icon) => setGroupForm((form) => ({ ...form, icon }))} inputTestId="input-group-icon" /></div>
        <Label text="القسم الأب"><select data-testid="select-group-parent" className={field} value={groupForm.parentId} onChange={(e) => setGroupForm({ ...groupForm, parentId: e.target.value })}><option value="">مجموعة رئيسية</option>{rootGroups.filter((g) => g.isActive && g.id !== dialog.group?.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Label>
        <Label text="ترتيب العرض"><input required min={0} type="number" data-testid="input-group-order" className={field} value={groupForm.displayOrder} onChange={(e) => setGroupForm({ ...groupForm, displayOrder: Number(e.target.value) })} /></Label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-testid="checkbox-group-active" checked={groupForm.isActive} onChange={(e) => setGroupForm({ ...groupForm, isActive: e.target.checked })} className="accent-primary" /> مجموعة نشطة</label>
        <Footer pending={pending} onClose={() => setDialog(null)} /></form></Modal>}
    {dialog?.kind === "category" && <Modal title={dialog.category ? "تعديل التصنيف" : "تصنيف جديد"} onClose={() => setDialog(null)}>
      <form onSubmit={onCategorySubmit} className="space-y-4">
        <Label text="اسم التصنيف"><input required maxLength={100} data-testid="input-category-name" className={field} value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></Label>
        <EmojiSuggestions name={categoryForm.name} onSelect={(icon) => setCategoryForm((form) => ({ ...form, icon }))} />
         <div><span className="mb-1.5 block text-xs font-extrabold">الأيقونة <span className="font-normal text-muted-foreground">(اختيارية، الافتراضية صندوق)</span></span><EmojiPickerField allowEmpty idPrefix="category-icon" name={categoryForm.name} value={categoryForm.icon} onChange={(icon) => setCategoryForm((form) => ({ ...form, icon }))} inputTestId="input-category-icon" /></div>
        <Label text="المجموعة الرئيسية"><select required data-testid="select-category-primary-group" className={field} value={categoryForm.primaryGroupId} onChange={(e) => setCategoryForm({ ...categoryForm, primaryGroupId: e.target.value, subGroupId: "" })}><option value="">اختر مجموعة</option>{rootGroups.filter((g) => g.isActive || String(g.id) === categoryForm.primaryGroupId).map((g) => <option key={g.id} value={g.id}>{g.name}{!g.isActive ? " (معطلة)" : ""}</option>)}</select></Label>
         {groups.some((g) => g.parentId === Number(categoryForm.primaryGroupId) && g.isActive) && <Label text="التقسيم الداخلي"><select required data-testid="select-category-subgroup" className={field} value={categoryForm.subGroupId} onChange={(e) => setCategoryForm({ ...categoryForm, subGroupId: e.target.value })}><option value="">اختر تقسيمًا</option>{groups.filter((g) => g.parentId === Number(categoryForm.primaryGroupId) && g.isActive).map((g) => <option key={g.id} value={g.id}>{categoryIconText(g.icon)} {g.name}</option>)}</select></Label>}
        <Label text="الوصف"><textarea maxLength={500} data-testid="input-category-description" className={`${field} min-h-20 py-2`} value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Label>
        {dialog.category && <><Label text="ترتيب العرض"><input type="number" min={0} required data-testid="input-category-order" className={field} value={categoryForm.displayOrder} onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: Number(e.target.value) })} /></Label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-testid="checkbox-category-active" checked={categoryForm.isActive} onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} className="accent-primary" /> تصنيف نشط</label></>}
        <Footer pending={pending} onClose={() => setDialog(null)} /></form></Modal>}
    {dialog?.kind === "tags" && <Modal title={`وسوم ${dialog.category.name}`} onClose={() => setDialog(null)}><p className="mb-4 text-sm text-muted-foreground">المجموعة الرئيسية: <strong className="text-foreground">{groupById.get(dialog.category.primaryGroupId ?? -1)?.name ?? dialog.category.groupName}</strong>. اختر كل المجموعات الثانوية المراد ربطها بهذا التصنيف.</p>
       <div className="max-h-72 space-y-2 overflow-auto">{rootGroups.filter((g) => g.isActive && g.id !== dialog.category.primaryGroupId).map((g) => <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold hover:bg-muted/40"><input type="checkbox" data-testid={`checkbox-category-tag-${g.id}`} checked={tagIds.includes(g.id)} onChange={(e) => setTagIds((ids) => e.target.checked ? [...ids, g.id] : ids.filter((id) => id !== g.id))} className="accent-primary" /> <span className="text-lg"><CategoryIconValue icon={g.icon} /></span>{g.name}</label>)}</div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={subtleButton} onClick={() => setDialog(null)}>إلغاء</button><button type="button" data-testid="button-save-category-tags" className={mainButton} disabled={pending} onClick={() => setTags.mutate({ id: dialog.category.id, data: { groupIds: tagIds } })}>{pending ? "جارٍ الحفظ..." : "حفظ جميع الوسوم"}</button></div></Modal>}
    {dialog?.kind === "move" && <Modal title="تأكيد نقل التصنيف" onClose={() => setDialog(null)}><p className="mb-4 text-sm leading-7">نقل <strong>{dialog.category.name}</strong> يغيّر مجموعته الرئيسية. يمكنك إدارة المجموعات الثانوية من نافذة الوسوم.</p><Label text="المجموعة الرئيسية الجديدة"><select data-testid="select-move-category-group" className={field} value={destinationId} onChange={(e) => { setDestinationId(e.target.value); setDestinationSubGroupId(""); }}><option value="">اختر مجموعة</option>{rootGroups.filter((g) => g.isActive && g.id !== dialog.category.primaryGroupId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Label>{groups.some((g) => g.parentId === Number(destinationId) && g.isActive) && <div className="mt-4"><Label text="التقسيم الداخلي الجديد"><select required data-testid="select-move-category-subgroup" className={field} value={destinationSubGroupId} onChange={(e) => setDestinationSubGroupId(e.target.value)}><option value="">اختر تقسيمًا</option>{groups.filter((g) => g.parentId === Number(destinationId) && g.isActive).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select></Label></div>}<div className="mt-5 flex justify-end gap-2"><button type="button" className={subtleButton} onClick={() => setDialog(null)}>إلغاء</button><button type="button" data-testid="button-confirm-move-category" className={mainButton} disabled={pending || !destinationId || Number(destinationId) === dialog.category.primaryGroupId || (groups.some((g) => g.parentId === Number(destinationId) && g.isActive) && !destinationSubGroupId)} onClick={() => transferCategory.mutate({ id: dialog.category.id, data: { destinationId: Number(destinationId), subGroupId: destinationSubGroupId ? Number(destinationSubGroupId) : null, moveSubcategories: false } })}>تأكيد النقل</button></div></Modal>}
      {dialog?.kind === "delete-category" && <Modal title={dialog.category.isActive ? "تعطيل التصنيف" : "مراجعة الحذف النهائي"} onClose={() => { if (!pending) setDialog(null); }}>
        {dialog.category.isActive
          ? <p className="text-sm leading-7">هل تريد تعطيل <strong>{dialog.category.name}</strong>؟ سيختفي من المجموعات العامة وتُزال وسومه. يمكن إعادة تفعيله لاحقاً من التعديل، لكن الوسوم لن تُستعاد تلقائياً.</p>
          : <div className="space-y-4">
            <p className="text-sm leading-7">راجع بيانات التصنيف والارتباطات أدناه قبل تأكيد حذفه نهائياً. لا يمكن التراجع عن الحذف أو استعادة سجل التصنيف.</p>
            <DeletionReview category={dialog.category} preview={deletionPreview.data} groupById={groupById} />
            {deletionPreview.isFetching && <p role="status" className="text-sm text-muted-foreground">جارٍ فحص الارتباطات قبل الحذف...</p>}
            {deletionPreview.isError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage(deletionPreview.error)} <button type="button" className="underline" onClick={() => void deletionPreview.refetch()}>إعادة الفحص</button></div>}
            {deletionPreview.data && !deletionPreview.isFetching && !deletionPreview.data.canDelete && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">لا يمكن الحذف النهائي قبل نقل أو معالجة البيانات المرتبطة المذكورة أعلاه.</p>}
            {deletionPreview.data?.canDelete && !deletionPreview.isFetching && <label className="flex items-start gap-2 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" data-testid="checkbox-review-permanent-delete" checked={deletionReviewed} onChange={(e) => setDeletionReviewed(e.target.checked)} className="mt-1 accent-destructive" />راجعت بيانات التصنيف وأؤكد حذفه نهائياً</label>}
          </div>}
        {notice?.error && <p role="alert" data-testid="error-delete-category" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{notice.message}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} className={subtleButton} onClick={() => setDialog(null)}>إلغاء</button><button type="button" data-testid="button-confirm-delete-category" disabled={pending || (!dialog.category.isActive && (!deletionPreview.data?.canDelete || deletionPreview.isFetching || !deletionReviewed))} className={`${mainButton} !bg-destructive !text-destructive-foreground`} onClick={() => dialog.category.isActive ? deleteCategory.mutate({ id: dialog.category.id }) : permanentlyDeleteCategory.mutate({ id: dialog.category.id })}>{pending ? "جارٍ الحذف..." : dialog.category.isActive ? "تعطيل التصنيف" : "تأكيد الحذف النهائي"}</button></div>
      </Modal>}
    {dialog?.kind === "delete-group" && <Modal title="حذف المجموعة" onClose={() => setDialog(null)}><p className="text-sm leading-7">هل تريد حذف مجموعة <strong>{dialog.group.name}</strong>؟ يجب نقل التصنيفات التي تتخذها مجموعة رئيسية قبل حذفها. ستُزال أيضاً وسوم هذه المجموعة من التصنيفات الأخرى.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={subtleButton} onClick={() => setDialog(null)}>إلغاء</button><button type="button" data-testid="button-confirm-delete-group" disabled={pending} className={`${mainButton} !bg-destructive !text-destructive-foreground`} onClick={() => deleteGroup.mutate({ id: dialog.group.id })}>حذف المجموعة</button></div></Modal>}
    {dialog && dialog.kind !== "delete-category" && notice?.error && <div role="alert" className="fixed bottom-5 left-5 right-5 z-[60] mx-auto max-w-lg rounded-xl border border-destructive/40 bg-card p-4 text-sm font-bold text-destructive shadow-warm-lg">{notice.message}</div>}
    {pending && <span role="status" className="sr-only">جارٍ حفظ التغيير</span>}
  </section>;
}

function DeletionReview({ category, preview, groupById }: { category: AdminItemCategory; preview?: ItemCategoryDeletionPreview; groupById: Map<number, Group> }) {
  const dependencies = preview && [
    ["تصنيفات فرعية", preview.childCategoryCount],
    ["ارتباطات بموردين", preview.supplierLinkCount],
    ["منتجات", preview.productCount],
    ["أسماء بديلة", preview.aliasCount],
    ["طلبات موردين", preview.requestCount],
  ] as const;
  return <div data-testid="review-category-deletion" className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
    <div className="flex items-center gap-2"><span className="text-lg"><CategoryIconValue icon={category.icon} /></span><strong>{category.name}</strong><Pill active={category.isActive} /></div>
    <dl className="grid gap-2 sm:grid-cols-2">
      <div><dt className="text-muted-foreground">رقم التصنيف</dt><dd dir="ltr" className="text-right font-bold">{category.id}</dd></div>
      <div><dt className="text-muted-foreground">المجموعة الرئيسية</dt><dd className="font-bold">{groupById.get(category.primaryGroupId ?? -1)?.name ?? category.groupName}</dd></div>
      {category.subGroupId && <div><dt className="text-muted-foreground">التقسيم الداخلي</dt><dd className="font-bold">{groupById.get(category.subGroupId)?.name ?? "غير متاح"}</dd></div>}
      {category.description && <div><dt className="text-muted-foreground">الوصف</dt><dd className="font-bold">{category.description}</dd></div>}
    </dl>
    {dependencies && <div className="border-t pt-3"><p className="mb-2 font-bold">البيانات المرتبطة</p><dl className="grid grid-cols-2 gap-2">{dependencies.map(([label, count]) => <div key={label} className="rounded-lg bg-background px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`font-bold ${count ? "text-destructive" : ""}`}>{fmt(count)}</dd></div>)}</dl></div>}
  </div>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="px-4 py-3 md:px-6"><div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">{icon}{label}</div><strong className="mt-1 block text-xl font-extrabold" data-testid={`metric-category-${label}`}>{fmt(value)}</strong></div>;
}
function Pill({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{active ? "نشط" : "معطل"}</span>;
}
function State({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center"><FolderTree className="mx-auto mb-3 h-7 w-7 text-primary" /><h3 className="font-extrabold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-5">{action}</div>}</div>;
}
function Label({ text, children }: { text: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-extrabold">{text}</span>{children}</label>;
}
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-warm-lg md:p-7"><div className="mb-5 flex items-start justify-between gap-3"><h3 className="text-xl font-extrabold">{title}</h3><button type="button" data-testid="button-close-category-dialog" aria-label="إغلاق النافذة" onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button></div>{children}</div></div>;
}
function Footer({ pending, onClose }: { pending: boolean; onClose: () => void }) {
  return <div className="flex justify-end gap-2 pt-2"><button type="button" className={subtleButton} onClick={onClose}>إلغاء</button><button type="submit" data-testid="button-save-category-form" className={mainButton} disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ التغييرات"}</button></div>;
}