import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FolderTree,
  History,
  Layers3,
  Loader2,
  Move,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ToggleRight,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  getListAdminActivityLogQueryKey,
  getListAdminItemCategoriesQueryKey,
  useCreateAdminItemCategory,
  useDeleteAdminItemCategory,
  useListAdminActivityLog,
  useListAdminItemCategories,
  useReorderAdminItemCategories,
  useTransferAdminItemCategory,
  useUpdateAdminItemCategory,
  type ActivityLogEntry,
  type AdminItemCategory,
} from "@workspace/api-client-react";

type CategoryFormState = {
  name: string;
  icon: string;
  parentId: string;
  description: string;
  displayOnHome: boolean;
  isActive: boolean;
};

type ModalState =
  | { type: "create"; parentId: number | null }
  | { type: "edit"; category: AdminItemCategory }
  | { type: "transfer"; category: AdminItemCategory }
  | { type: "delete"; category: AdminItemCategory }
  | null;

type Notice = { tone: "success" | "error"; text: string } | null;

const emptyForm: CategoryFormState = {
  name: "",
  icon: "",
  parentId: "",
  description: "",
  displayOnHome: false,
  isActive: true,
};

const actionLabels: Record<ActivityLogEntry["actionType"], string> = {
  add: "إضافة",
  edit: "تعديل",
  transfer: "نقل",
  delete: "تعطيل",
};

const actionStyles: Record<ActivityLogEntry["actionType"], string> = {
  add: "bg-emerald-50 text-emerald-800 border-emerald-200",
  edit: "bg-sky-50 text-sky-800 border-sky-200",
  transfer: "bg-amber-50 text-amber-800 border-amber-200",
  delete: "bg-rose-50 text-rose-800 border-rose-200",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function categoryPath(category: AdminItemCategory, byId: Map<number, AdminItemCategory>) {
  const names: string[] = [];
  let current: AdminItemCategory | undefined = category;
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return names.join(" / ");
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

function valuePreview(value: Record<string, unknown> | null) {
  if (!value) return "—";
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "");
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join("، ");
}

export default function AdminItemCategoriesTab() {
  const queryClient = useQueryClient();
  const categoriesQuery = useListAdminItemCategories();
  const activityQuery = useListAdminActivityLog();
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [activityOpen, setActivityOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [transferDestination, setTransferDestination] = useState("");
  const [moveSubcategories, setMoveSubcategories] = useState(false);

  const refresh = async () => {
    setNotice(null);
    await Promise.all([categoriesQuery.refetch(), activityQuery.refetch()]);
  };

  const invalidateAdminData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAdminItemCategoriesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListAdminActivityLogQueryKey() }),
    ]);
  };

  const createCategory = useCreateAdminItemCategory({
    mutation: {
      onSuccess: async () => {
        await invalidateAdminData();
        setModal(null);
        setNotice({ tone: "success", text: "تمت إضافة التصنيف وتحديث شجرة التصنيفات." });
      },
      onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
    },
  });
  const updateCategory = useUpdateAdminItemCategory({
    mutation: {
      onSuccess: async () => {
        await invalidateAdminData();
        setModal(null);
        setNotice({ tone: "success", text: "تم حفظ تغييرات التصنيف." });
      },
      onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
    },
  });
  const deleteCategory = useDeleteAdminItemCategory({
    mutation: {
      onSuccess: async (result) => {
        await invalidateAdminData();
        setModal(null);
        setNotice({
          tone: "success",
          text: `تم تعطيل التصنيف و${result.deactivatedCount} من التصنيفات التابعة مع الحفاظ على اختيارات الموردين السابقة.`,
        });
      },
      onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
    },
  });
  const transferCategory = useTransferAdminItemCategory({
    mutation: {
      onSuccess: async () => {
        await invalidateAdminData();
        setModal(null);
        setNotice({ tone: "success", text: "تم نقل التصنيف وتحديث العلاقة الهرمية." });
      },
      onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
    },
  });
  const reorderCategories = useReorderAdminItemCategories({
    mutation: {
      onSuccess: async () => {
        await invalidateAdminData();
        setNotice({ tone: "success", text: "تم تحديث ترتيب التصنيفات." });
      },
      onError: (error) => setNotice({ tone: "error", text: errorText(error) }),
    },
  });

  const categories = categoriesQuery.data ?? [];
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const childrenByParent = useMemo(() => {
    const grouped = new Map<number | null, AdminItemCategory[]>();
    categories.forEach((category) => {
      const siblings = grouped.get(category.parentId) ?? [];
      siblings.push(category);
      grouped.set(category.parentId, siblings);
    });
    grouped.forEach((siblings) => siblings.sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id));
    return grouped;
  }, [categories]);

  const filteredIds = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("ar");
    const ids = new Set<number>();
    categories.forEach((category) => {
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "active" ? category.isActive : !category.isActive);
      const matchesSearch =
        !normalizedSearch ||
        category.name.toLocaleLowerCase("ar").includes(normalizedSearch) ||
        category.groupName.toLocaleLowerCase("ar").includes(normalizedSearch) ||
        categoryPath(category, byId).toLocaleLowerCase("ar").includes(normalizedSearch);
      if (matchesStatus && matchesSearch) {
        ids.add(category.id);
        let parentId = category.parentId;
        while (parentId !== null) {
          ids.add(parentId);
          parentId = byId.get(parentId)?.parentId ?? null;
        }
      }
    });
    return ids;
  }, [categories, byId, search, statusFilter]);

  const visibleRoots = (childrenByParent.get(null) ?? []).filter((category) => filteredIds.has(category.id));
  const activeCount = categories.filter((category) => category.isActive).length;
  const leafCategoryCount = categories.filter((category) => !(childrenByParent.get(category.id)?.length)).length;
  const pendingMutation =
    createCategory.isPending ||
    updateCategory.isPending ||
    deleteCategory.isPending ||
    transferCategory.isPending ||
    reorderCategories.isPending;

  const openCreate = (parentId: number | null) => {
    setNotice(null);
    setForm({ ...emptyForm, parentId: parentId === null ? "" : String(parentId), displayOnHome: parentId === null });
    setModal({ type: "create", parentId });
  };

  const openEdit = (category: AdminItemCategory) => {
    setNotice(null);
    setForm({
      name: category.name,
      icon: category.icon,
      parentId: category.parentId === null ? "" : String(category.parentId),
      description: category.description ?? "",
      displayOnHome: category.parentId === null && category.displayOnHome,
      isActive: category.isActive,
    });
    setModal({ type: "edit", category });
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const icon = form.icon.trim();
    if (!name || !icon) {
      setNotice({ tone: "error", text: "أدخل اسم التصنيف وأيقونته قبل الحفظ." });
      return;
    }
    const parentId = form.parentId ? Number(form.parentId) : null;
    const description = form.description.trim() || null;
    if (modal?.type === "create") {
      createCategory.mutate({
        data: { name, icon, parentId, description },
      });
    } else if (modal?.type === "edit") {
      updateCategory.mutate({
        id: modal.category.id,
        data: {
          name,
          icon,
          description,
          isActive: form.isActive,
          displayOnHome: parentId === null ? form.displayOnHome : false,
        },
      });
    }
  };

  const reorder = (category: AdminItemCategory, direction: -1 | 1) => {
    const siblings = childrenByParent.get(category.parentId) ?? [];
    const index = siblings.findIndex((item) => item.id === category.id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= siblings.length) return;
    const ordered = siblings.map((item) => item.id);
    [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    reorderCategories.mutate({ data: { parentId: category.parentId, categoryIds: ordered } });
  };

  const selectableParents = categories.filter((candidate) => {
    if (!modal || modal.type !== "transfer") return candidate.isActive;
    if (candidate.id === modal.category.id) return false;
    let current: AdminItemCategory | undefined = candidate;
    while (current?.parentId !== null && current?.parentId !== undefined) {
      if (current.parentId === modal.category.id) return false;
      current = byId.get(current.parentId);
    }
    return candidate.isActive;
  });

  return (
    <section dir="rtl" className="space-y-6" aria-label="إدارة تصنيفات المنتجات">
      <div className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <FolderTree className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm font-bold">تصنيفات المنتجات</span>
            </div>
            <h2 data-testid="text-category-tab-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">
              شجرة تصنيف موردي المخابز والحلويات
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              حافظ على taxonomy واضحة للموردين، وتابع ارتباط كل تصنيف بالموردين قبل نشره في الدليل.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="button-refresh-categories"
              type="button"
              onClick={() => void refresh()}
              disabled={categoriesQuery.isFetching || activityQuery.isFetching}
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-bold transition hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${categoriesQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              تحديث
            </button>
            <button
              data-testid="button-add-root-category"
              type="button"
              onClick={() => openCreate(null)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              تصنيف رئيسي
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="إجمالي التصنيفات" value={categories.length} icon={<Layers3 className="h-4 w-4" />} />
          <Metric label="التصنيفات النشطة" value={activeCount} icon={<ToggleRight className="h-4 w-4" />} />
          <Metric label="تصنيفات طرفية" value={leafCategoryCount} icon={<Users className="h-4 w-4" />} />
          <Metric label="تصنيفات رئيسية" value={childrenByParent.get(null)?.length ?? 0} icon={<FolderTree className="h-4 w-4" />} />
        </div>
      </div>

      {notice && (
        <div
          data-testid="status-category-action"
          role="status"
          className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {notice.tone === "success" ? <ToggleRight className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
          <span>{notice.text}</span>
          <button data-testid="button-dismiss-category-notice" type="button" onClick={() => setNotice(null)} className="mr-auto rounded-lg p-1 hover:bg-black/5" aria-label="إغلاق التنبيه">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border bg-card p-3 md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">البحث في التصنيفات</span>
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  data-testid="input-category-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو المجموعة أو المسار"
                  className="h-11 w-full rounded-xl border bg-background pr-10 pl-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <select
                  data-testid="select-category-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
                  className="h-11 rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:border-primary"
                  aria-label="تصفية حسب حالة التصنيف"
                >
                  <option value="all">كل الحالات</option>
                  <option value="active">النشطة فقط</option>
                  <option value="inactive">المعطلة فقط</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span data-testid="text-category-result-count">عرض {filteredIds.size} من {categories.length} تصنيف</span>
              <span>الترتيب داخل كل مستوى مستقل</span>
            </div>
          </div>

          {categoriesQuery.isLoading ? (
            <CategorySkeleton />
          ) : categoriesQuery.isError ? (
            <StateCard
              icon={<AlertCircle className="h-6 w-6" />}
              title="تعذر تحميل شجرة التصنيفات"
              description={errorText(categoriesQuery.error)}
              action={
                <button data-testid="button-retry-categories" type="button" onClick={() => void categoriesQuery.refetch()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                  إعادة المحاولة
                </button>
              }
            />
          ) : categories.length === 0 ? (
            <StateCard
              icon={<FolderTree className="h-6 w-6" />}
              title="لا توجد تصنيفات بعد"
              description="ابدأ بتصنيف رئيسي، ثم أضف تحته التصنيفات الفرعية التي يحتاجها الموردون."
              action={
                <button data-testid="button-empty-add-category" type="button" onClick={() => openCreate(null)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                  <Plus className="h-4 w-4" />
                  إضافة أول تصنيف
                </button>
              }
            />
          ) : visibleRoots.length === 0 ? (
            <StateCard icon={<Search className="h-6 w-6" />} title="لا توجد نتائج مطابقة" description="جرّب تغيير عبارة البحث أو فلتر الحالة." />
          ) : (
            <div className="space-y-3">
              {visibleRoots.map((category) => (
                <CategoryBranch
                  key={category.id}
                  category={category}
                  level={0}
                  byId={byId}
                  childrenByParent={childrenByParent}
                  filteredIds={filteredIds}
                  expanded={expanded}
                  onToggle={(id) => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
                  onCreate={openCreate}
                  onEdit={openEdit}
                  onTransfer={(item) => {
                    setTransferDestination(item.parentId === null ? "" : String(item.parentId));
                    setMoveSubcategories(false);
                    setModal({ type: "transfer", category: item });
                  }}
                  onDelete={(item) => setModal({ type: "delete", category: item })}
                  onReorder={reorder}
                  reorderPending={reorderCategories.isPending}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="min-w-0">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <button
              data-testid="button-toggle-category-activity"
              type="button"
              onClick={() => setActivityOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 p-4 text-right transition hover:bg-muted/40"
              aria-expanded={activityOpen}
            >
              <span className="flex items-center gap-3">
                <span className="rounded-xl bg-primary/10 p-2 text-primary"><History className="h-5 w-5" /></span>
                <span><strong className="block text-sm">سجل نشاط التصنيفات</strong><span className="text-xs text-muted-foreground">آخر العمليات الإدارية</span></span>
              </span>
              {activityOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronLeft className="h-4 w-4 text-muted-foreground" />}
            </button>
            {activityOpen && <ActivityPanel query={activityQuery} byId={byId} />}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="leading-7"><strong>ملاحظة تشغيلية:</strong> تعطيل تصنيف يوقفه مع جميع فروعه، ولا يحذف اختيارات الموردين السابقة من السجل.</p>
            </div>
          </div>
        </aside>
      </div>

      {modal?.type === "create" || modal?.type === "edit" ? (
        <CategoryFormModal
          mode={modal.type}
          form={form}
          categories={categories}
          editingCategory={modal.type === "edit" ? modal.category : null}
          pending={createCategory.isPending || updateCategory.isPending}
          onChange={setForm}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
        />
      ) : null}
      {modal?.type === "transfer" ? (
        <TransferModal
          category={modal.category}
          destination={transferDestination}
          destinations={selectableParents}
          moveSubcategories={moveSubcategories}
          pending={transferCategory.isPending}
          onDestinationChange={setTransferDestination}
          onMoveSubcategoriesChange={setMoveSubcategories}
          onClose={() => setModal(null)}
          onSubmit={() => transferCategory.mutate({ id: modal.category.id, data: { destinationId: transferDestination ? Number(transferDestination) : null, moveSubcategories } })}
        />
      ) : null}
      {modal?.type === "delete" ? (
        <DeleteModal
          category={modal.category}
          pending={deleteCategory.isPending}
          onClose={() => setModal(null)}
          onConfirm={() => deleteCategory.mutate({ id: modal.category.id })}
        />
      ) : null}
      {pendingMutation && <div className="sr-only" role="status">جاري حفظ التغيير</div>}
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background/70 p-3 md:p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs font-bold">{label}</span></div>
      <strong data-testid={`metric-category-${label}`} className="text-2xl font-extrabold tracking-tight">{value.toLocaleString("ar-SA")}</strong>
    </div>
  );
}

function CategoryBranch({
  category,
  level,
  byId,
  childrenByParent,
  filteredIds,
  expanded,
  onToggle,
  onCreate,
  onEdit,
  onTransfer,
  onDelete,
  onReorder,
  reorderPending,
}: {
  category: AdminItemCategory;
  level: number;
  byId: Map<number, AdminItemCategory>;
  childrenByParent: Map<number | null, AdminItemCategory[]>;
  filteredIds: Set<number>;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onCreate: (parentId: number | null) => void;
  onEdit: (category: AdminItemCategory) => void;
  onTransfer: (category: AdminItemCategory) => void;
  onDelete: (category: AdminItemCategory) => void;
  onReorder: (category: AdminItemCategory, direction: -1 | 1) => void;
  reorderPending: boolean;
}) {
  const children = (childrenByParent.get(category.id) ?? []).filter((child) => filteredIds.has(child.id));
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(category.id) || Boolean(category.parentId === null && filteredIds.size < byId.size);
  const siblings = childrenByParent.get(category.parentId) ?? [];
  const position = siblings.findIndex((item) => item.id === category.id);

  return (
    <div data-testid={`category-branch-${category.id}`} className="relative">
      <article className={`rounded-2xl border bg-card transition ${category.isActive ? "border-border" : "border-dashed border-muted-foreground/30 opacity-75"}`} style={{ marginRight: level * 22 }}>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <button
              data-testid={`button-toggle-category-${category.id}`}
              type="button"
              onClick={() => hasChildren && onToggle(category.id)}
              disabled={!hasChildren}
              className={`mt-1 rounded-lg p-1 text-muted-foreground transition ${hasChildren ? "hover:bg-muted hover:text-foreground" : "cursor-default opacity-30"}`}
              aria-label={hasChildren ? (isExpanded ? "طي الفروع" : "فتح الفروع") : "لا توجد فروع"}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <span data-testid={`text-category-icon-${category.id}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-2xl" aria-label={`أيقونة ${category.name}`}>{category.icon}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 data-testid={`text-category-name-${category.id}`} className="font-extrabold">{category.name}</h3>
                <StatusPill active={category.isActive} />
                {category.parentId === null && category.displayOnHome && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">ظاهر في الرئيسية</span>}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{category.groupName} · {category.parentId === null ? "تصنيف رئيسي" : `تابع لـ ${byId.get(category.parentId)?.name ?? "تصنيف غير معروف"}`}</p>
              {category.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{category.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pr-10 md:pr-0">
            <span data-testid={`text-category-supplier-count-${category.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs font-bold text-muted-foreground"><Users className="h-3.5 w-3.5" />{category.supplierCount.toLocaleString("ar-SA")} مورد</span>
            <span className="text-[11px] text-muted-foreground">ترتيب {category.displayOrder}</span>
            <div className="flex items-center rounded-lg border bg-background">
              <button data-testid={`button-move-category-up-${category.id}`} type="button" onClick={() => onReorder(category, -1)} disabled={position <= 0 || reorderPending} className="rounded-r-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="نقل لأعلى"><ArrowUp className="h-4 w-4" /></button>
              <button data-testid={`button-move-category-down-${category.id}`} type="button" onClick={() => onReorder(category, 1)} disabled={position < 0 || position >= siblings.length - 1 || reorderPending} className="rounded-l-lg p-2 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="نقل لأسفل"><ArrowDown className="h-4 w-4" /></button>
            </div>
            {category.parentId === null && <button data-testid={`button-add-child-category-${category.id}`} type="button" onClick={() => onCreate(category.id)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold hover:bg-muted"><Plus className="h-3.5 w-3.5" />فرعي</button>}
            <button data-testid={`button-edit-category-${category.id}`} type="button" onClick={() => onEdit(category)} className="rounded-lg border p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`تعديل ${category.name}`}><Edit3 className="h-4 w-4" /></button>
            <button data-testid={`button-transfer-category-${category.id}`} type="button" onClick={() => onTransfer(category)} className="rounded-lg border p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`نقل ${category.name}`}><Move className="h-4 w-4" /></button>
            <button data-testid={`button-delete-category-${category.id}`} type="button" onClick={() => onDelete(category)} disabled={!category.isActive} className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-30" aria-label={`تعطيل ${category.name}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </article>
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2 border-r-2 border-dashed border-secondary pr-3">
          {children.map((child) => (
            <CategoryBranch key={child.id} category={child} level={level + 1} byId={byId} childrenByParent={childrenByParent} filteredIds={filteredIds} expanded={expanded} onToggle={onToggle} onCreate={onCreate} onEdit={onEdit} onTransfer={onTransfer} onDelete={onDelete} onReorder={onReorder} reorderPending={reorderPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-muted bg-muted text-muted-foreground"}`}>{active ? "نشط" : "معطّل"}</span>;
}

function ActivityPanel({ query, byId }: { query: ReturnType<typeof useListAdminActivityLog>; byId: Map<number, AdminItemCategory> }) {
  if (query.isLoading) return <div className="space-y-3 border-t p-4"><ActivitySkeleton /><ActivitySkeleton /><ActivitySkeleton /></div>;
  if (query.isError) return <div className="border-t p-4 text-sm text-destructive"><p>تعذر تحميل سجل النشاط.</p><button data-testid="button-retry-activity" type="button" onClick={() => void query.refetch()} className="mt-2 font-bold underline">إعادة المحاولة</button></div>;
  const activityEntries = Array.isArray(query.data) ? query.data as ActivityLogEntry[] : [];
  const entries = activityEntries.filter((entry) => entry.entityType === "category").slice(0, 12);
  if (entries.length === 0) return <div data-testid="empty-category-activity" className="border-t p-5 text-center text-sm text-muted-foreground">لا توجد عمليات مسجلة على التصنيفات.</div>;
  return (
    <div className="border-t">
      <div className="max-h-[34rem] divide-y overflow-y-auto">
        {entries.map((entry) => (
          <article data-testid={`activity-entry-${entry.id}`} key={entry.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className={`mt-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${actionStyles[entry.actionType]}`}>{actionLabels[entry.actionType]}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{byId.get(entry.entityId)?.name ?? `تصنيف #${entry.entityId}`}</p>
                  <p className="mt-1 text-xs text-muted-foreground">المدير #{entry.adminId} · {formatDate(entry.createdAt)}</p>
                </div>
              </div>
            </div>
            {(entry.oldValue || entry.newValue) && <p className="mt-3 rounded-lg bg-muted/50 p-2 text-[11px] leading-6 text-muted-foreground"><span className="font-bold">التغيير: </span>{valuePreview(entry.oldValue)} ← {valuePreview(entry.newValue)}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

function CategoryFormModal({
  mode,
  form,
  categories,
  editingCategory,
  pending,
  onChange,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  form: CategoryFormState;
  categories: AdminItemCategory[];
  editingCategory: AdminItemCategory | null;
  pending: boolean;
  onChange: (form: CategoryFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const parentOptions = categories.filter((category) => category.isActive && category.parentId === null && category.id !== editingCategory?.id);
  return (
    <Modal title={mode === "create" ? "إضافة تصنيف جديد" : `تعديل: ${editingCategory?.name ?? ""}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="block"><span className="mb-1.5 block text-sm font-bold">اسم التصنيف <span className="text-destructive">*</span></span><input data-testid="input-category-name" required maxLength={100} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-bold">الأيقونة <span className="text-destructive">*</span></span><input data-testid="input-category-icon" required maxLength={24} value={form.icon} onChange={(event) => onChange({ ...form, icon: event.target.value })} placeholder="رمز التصنيف" className="h-11 w-full rounded-xl border bg-background px-3 text-center text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
        </div>
        <label className="block"><span className="mb-1.5 block text-sm font-bold">{mode === "edit" ? "التصنيف الأب (استخدم النقل لتغييره)" : "التصنيف الأب"}</span><select data-testid="select-category-parent" value={form.parentId} disabled={mode === "edit"} onChange={(event) => onChange({ ...form, parentId: event.target.value, displayOnHome: event.target.value === "" ? form.displayOnHome : false })} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-muted/50"><option value="">بدون أب — تصنيف رئيسي</option>{parentOptions.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.groupName}</option>)}</select><span className="mt-1.5 block text-xs text-muted-foreground">{mode === "edit" ? "لتغيير الأب دون فقدان ارتباطات الموردين، استخدم زر نقل التصنيف." : "التصنيفات الفرعية لا تظهر في الصفحة الرئيسية."}</span></label>
        <label className="block"><span className="mb-1.5 block text-sm font-bold">وصف مختصر</span><textarea data-testid="input-category-description" maxLength={500} rows={3} value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} className="w-full resize-none rounded-xl border bg-background px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
        <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${form.parentId ? "cursor-not-allowed bg-muted/50 text-muted-foreground" : "cursor-pointer hover:bg-muted/40"}`}>
          <input data-testid="checkbox-category-home" type="checkbox" checked={form.parentId === "" && form.displayOnHome} disabled={Boolean(form.parentId)} onChange={(event) => onChange({ ...form, displayOnHome: event.target.checked })} className="mt-1 h-4 w-4 accent-primary" />
          <span><strong className="block">عرض في الصفحة الرئيسية</strong><span className="text-xs text-muted-foreground">متاح للتصنيفات الرئيسية فقط.</span></span>
        </label>
        {mode === "edit" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm hover:bg-muted/40">
            <input data-testid="checkbox-category-active" type="checkbox" checked={form.isActive} onChange={(event) => onChange({ ...form, isActive: event.target.checked })} className="mt-1 h-4 w-4 accent-primary" />
            <span><strong className="block">التصنيف مفعّل</strong><span className="text-xs text-muted-foreground">عند إيقاف التصنيف لن يظهر في النماذج الجديدة، وتبقى بيانات الموردين السابقة محفوظة.</span></span>
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-start">
          <button data-testid="button-cancel-category-form" type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-bold hover:bg-muted">إلغاء</button>
          <button data-testid="button-save-category" type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">{pending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ التصنيف</button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({
  category,
  destination,
  destinations,
  moveSubcategories,
  pending,
  onDestinationChange,
  onMoveSubcategoriesChange,
  onClose,
  onSubmit,
}: {
  category: AdminItemCategory;
  destination: string;
  destinations: AdminItemCategory[];
  moveSubcategories: boolean;
  pending: boolean;
  onDestinationChange: (value: string) => void;
  onMoveSubcategoriesChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal title={`نقل التصنيف: ${category.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950">سيتم تغيير التصنيف الأب فقط. اختر أدناه إن كانت الفروع التابعة ستنتقل معه أم تبقى تحت الأب الحالي.</div>
        <label className="block"><span className="mb-1.5 block text-sm font-bold">نقل إلى</span><select data-testid="select-transfer-destination" value={destination} onChange={(event) => onDestinationChange(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary"><option value="">الجذر — تصنيف رئيسي</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.groupName}</option>)}</select></label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm hover:bg-muted/40"><input data-testid="checkbox-transfer-subcategories" type="checkbox" checked={moveSubcategories} onChange={(event) => onMoveSubcategoriesChange(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /><span><strong className="block">نقل الفروع التابعة معه</strong><span className="text-xs leading-6 text-muted-foreground">{moveSubcategories ? "ستنتقل كل الفروع إلى المسار الجديد." : category.parentId === null ? "ستتحول الفروع إلى تصنيفات رئيسية منفصلة، بينما ينتقل هذا التصنيف فقط." : "ستبقى الفروع تحت الأب الحالي، بينما ينتقل هذا التصنيف فقط."}</span></span></label>
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-start"><button data-testid="button-cancel-transfer" type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-bold hover:bg-muted">إلغاء</button><button data-testid="button-confirm-transfer" type="button" onClick={onSubmit} disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">{pending && <Loader2 className="h-4 w-4 animate-spin" />}تأكيد النقل</button></div>
      </div>
    </Modal>
  );
}

function DeleteModal({ category, pending, onClose, onConfirm }: { category: AdminItemCategory; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal title="تعطيل التصنيف" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-950"><strong>سيتم تعطيل «{category.name}» وجميع فروعه.</strong><br />لن تُحذف اختيارات الموردين السابقة، لكن لن يظهر التصنيف النشط في الدليل.</div>
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-start"><button data-testid="button-cancel-delete-category" type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-bold hover:bg-muted">إلغاء</button><button data-testid="button-confirm-delete-category" type="button" onClick={onConfirm} disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground disabled:opacity-60">{pending && <Loader2 className="h-4 w-4 animate-spin" />}تأكيد التعطيل</button></div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-testid="category-modal-backdrop" className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="category-modal-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-warm-lg sm:max-w-xl sm:rounded-3xl md:p-7">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="mb-1 text-xs font-bold text-primary">إدارة التصنيف</p><h2 id="category-modal-title" className="text-xl font-extrabold">{title}</h2></div><button data-testid="button-close-category-modal" type="button" onClick={onClose} className="rounded-xl border p-2 text-muted-foreground hover:bg-muted" aria-label="إغلاق"><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function StateCard({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="rounded-2xl border bg-card p-8 text-center"><span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{icon}</span><h3 className="font-extrabold">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function CategorySkeleton() {
  return <div data-testid="category-loading-state" className="space-y-3" aria-label="جاري تحميل التصنيفات"><div className="h-28 animate-pulse rounded-2xl border bg-card" /><div className="mr-6 h-24 animate-pulse rounded-2xl border bg-card" /><div className="h-28 animate-pulse rounded-2xl border bg-card" /></div>;
}

function ActivitySkeleton() {
  return <div className="h-16 animate-pulse rounded-xl bg-muted/70" />;
}