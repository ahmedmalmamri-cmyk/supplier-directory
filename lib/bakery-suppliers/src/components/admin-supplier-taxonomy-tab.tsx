import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronLeft, Download, FileText, Folder, FolderOpen, FolderTree, History, Layers3, Link2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { getGroupIcon } from "@/lib/group-icons";
import {
  useGetAdminSupplierTaxonomyTree, getGetAdminSupplierTaxonomyTreeQueryKey,
  getListGroupsQueryKey, getListItemCategoriesQueryKey, useListGroups, useListItemCategories,
  useCreateAdminSupplierTaxonomyNode, useUpdateAdminSupplierTaxonomyNode, useMoveAdminSupplierTaxonomyNode, useDeleteAdminSupplierTaxonomyNode, useReorderAdminSupplierTaxonomyNodes,
  useListAdminSupplierTaxonomyItems, getListAdminSupplierTaxonomyItemsQueryKey,
  useCreateAdminSupplierTaxonomyItem, useBulkCreateAdminSupplierTaxonomyItems, useUpdateAdminSupplierTaxonomyItem, useMoveAdminSupplierTaxonomyItem, useDeleteAdminSupplierTaxonomyItem,
  useListAdminSupplierTaxonomyLegacyReview, getListAdminSupplierTaxonomyLegacyReviewQueryKey, useApplyAdminSupplierTaxonomyLegacyMapping,
  usePreviewAdminSupplierTaxonomyLegacyImport, getPreviewAdminSupplierTaxonomyLegacyImportQueryKey, useImportAdminSupplierTaxonomyLegacyItems,
  useGetAdminSupplierTaxonomyAudit, getGetAdminSupplierTaxonomyAuditQueryKey,
  exportAdminSupplierTaxonomyItemsCsv, exportAdminSupplierTaxonomyCsv,
  type SupplierTaxonomyNode, type SupplierTaxonomyItem, type SupplierTaxonomyLegacyReview,
} from "@workspace/api-client-react";

type Modal =
  | { kind: "node"; node?: SupplierTaxonomyNode; parentId?: number }
  | { kind: "move-node"; node: SupplierTaxonomyNode }
  | { kind: "delete-node"; node: SupplierTaxonomyNode }
  | { kind: "item"; item?: SupplierTaxonomyItem }
  | { kind: "move-item"; item: SupplierTaxonomyItem }
  | { kind: "delete-item"; item: SupplierTaxonomyItem }
  | { kind: "bulk" }
  | { kind: "legacy-import" }
  | { kind: "mapping"; legacy: SupplierTaxonomyLegacyReview };
type Notice = { text: string; error: boolean } | null;
const fmt = (n: number) => n.toLocaleString("ar-SA");
const btn = "taxonomy-button";
const primary = "taxonomy-button taxonomy-button-primary";
const label = "block text-xs font-extrabold mb-1.5";
function normalizeItemName(value: string) {
  return value.trim().replace(/[أإآٱ]/g, "ا").replace(/[\u064B-\u065F\u0670]/g, "").replace(/\s+/g, " ").toLocaleLowerCase("ar");
}
function initialCategoryId(): number | null {
  const value = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("groupId");
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}
function message(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  }
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return "تعذّر الاتصال بالخادم، ولا يمكن تأكيد الحفظ. احتفظنا ببيانات النموذج؛ بعد عودة الاتصال تحقّق من قائمة الأصناف، ثم اضغط «حفظ التغييرات» مجدداً إذا لم يظهر الصنف.";
  }
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مرة أخرى.";
}
function download(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function auditAction(action: string) {
  const value = action.toLowerCase();
  if (value.includes("bulk")) return "إضافة مجموعة أصناف";
  if (value.includes("mapping") || value.includes("legacy")) return "مراجعة ربط قديم";
  if (value.includes("reorder") || value.includes("order")) return "تغيير الترتيب";
  if (value.includes("move") || value.includes("transfer")) return "نقل";
  if (value.includes("delete") || value.includes("remove")) return "حذف";
  if (value.includes("create") || value.includes("add")) return "إضافة";
  if (value.includes("deactivat")) return "تعطيل";
  if (value.includes("activat")) return "تفعيل";
  if (value.includes("update") || value.includes("edit")) return "تعديل";
  return "تغيير إداري";
}
function auditEntity(entity: string) {
  const value = entity.toLowerCase();
  if (value.includes("legacy") || value.includes("mapping")) return "ربط تصنيف قديم";
  if (value.includes("item")) return "صنف";
  if (value.includes("node") || value.includes("categor") || value.includes("section")) return "قسم";
  return "عنصر في الفهرس";
}

export default function AdminSupplierTaxonomyTab() {
  const client = useQueryClient();
  const treeQuery = useGetAdminSupplierTaxonomyTree({ query: {
    queryKey: getGetAdminSupplierTaxonomyTreeQueryKey(),
    refetchInterval: query => query.state.status === "error" ? 10_000 : false,
  } });
  const itemsQuery = useListAdminSupplierTaxonomyItems(undefined, { query: {
    queryKey: getListAdminSupplierTaxonomyItemsQueryKey(),
    refetchInterval: query => query.state.status === "error" ? 10_000 : false,
  } });
  const publicGroupsQuery = useListGroups({ query: { queryKey: getListGroupsQueryKey(), staleTime: 0 } });
  const publicItemsQuery = useListItemCategories({ query: { queryKey: getListItemCategoriesQueryKey(), staleTime: 0 } });
  const reviewQuery = useListAdminSupplierTaxonomyLegacyReview({ query: {
    queryKey: getListAdminSupplierTaxonomyLegacyReviewQueryKey(),
    refetchInterval: query => query.state.status === "error" ? 10_000 : false,
  } });
  const importPreviewQuery = usePreviewAdminSupplierTaxonomyLegacyImport({ query: {
    queryKey: getPreviewAdminSupplierTaxonomyLegacyImportQueryKey(),
    refetchInterval: query => query.state.status === "error" ? 10_000 : false,
  } });
  const auditQuery = useGetAdminSupplierTaxonomyAudit({ query: {
    queryKey: getGetAdminSupplierTaxonomyAuditQueryKey(),
    refetchInterval: query => query.state.status === "error" ? 10_000 : false,
  } });
  const tree = treeQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const review = reviewQuery.data ?? [];
  const flat = useMemo(() => {
    const walk = (nodes: SupplierTaxonomyNode[], path = "", ancestors: number[] = []): { node: SupplierTaxonomyNode; path: string; ancestors: number[] }[] =>
      nodes.flatMap(node => [{ node, path: path ? `${path} / ${node.name}` : node.name, ancestors }, ...walk(node.children, path ? `${path} / ${node.name}` : node.name, [...ancestors, node.id])]);
    return walk(tree);
  }, [treeQuery.data]);
  const [view, setView] = useState<"browse" | "tree" | "items" | "review" | "audit">("browse");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(initialCategoryId);
  const [browseSearch, setBrowseSearch] = useState("");
  const [associationMode, setAssociationMode] = useState(false);
  useEffect(() => {
    const sync = () => {
      setSelectedId(initialCategoryId());
      setBrowseSearch("");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const browseTo = (id: number | null) => {
    setSelectedId(id);
    setBrowseSearch("");
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete("groupId");
    else url.searchParams.set("groupId", String(id));
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [destination, setDestination] = useState("");
  const [chosenCategories, setChosenCategories] = useState<number[]>([]);
  const [primaryCategory, setPrimaryCategory] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [deleteStrategy, setDeleteStrategy] = useState<"transfer" | "cascade">("transfer");
  const [ackLinks, setAckLinks] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState(() => String(initialCategoryId() ?? "all"));
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [onlyPending, setOnlyPending] = useState(true);
  const [mappingSelections, setMappingSelections] = useState<Record<number, string>>({});
  const [exporting, setExporting] = useState<"tree" | "items" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const results = await Promise.all([treeQuery.refetch(), itemsQuery.refetch(), reviewQuery.refetch(), auditQuery.refetch(), importPreviewQuery.refetch()]);
      setNotice(results.some(r => r.isError)
        ? { error: true, text: "لم تكتمل إعادة التحميل. حاول مرة أخرى." }
        : { error: false, text: "اكتمل تحديث الأقسام والأصناف والمراجعات وسجل النشاط." });
    } catch (error) {
      failed(error);
    } finally {
      setRefreshing(false);
    }
  };
  const changed = (text: string, reviewChanged = false) => {
    setModal(null); setNotice({ text, error: false });
    void client.invalidateQueries({ queryKey: getGetAdminSupplierTaxonomyTreeQueryKey() });
    void client.invalidateQueries({ queryKey: getListAdminSupplierTaxonomyItemsQueryKey() });
    void client.invalidateQueries({ queryKey: getListGroupsQueryKey() });
    void client.invalidateQueries({ queryKey: getListItemCategoriesQueryKey() });
    void client.invalidateQueries({ queryKey: getGetAdminSupplierTaxonomyAuditQueryKey() });
    void client.invalidateQueries({ queryKey: getPreviewAdminSupplierTaxonomyLegacyImportQueryKey() });
    if (reviewChanged) void client.invalidateQueries({ queryKey: getListAdminSupplierTaxonomyLegacyReviewQueryKey() });
  };
  const failed = (error: unknown) => setNotice({ text: message(error), error: true });
  const createNode = useCreateAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("أُضيف القسم الجديد."), onError: failed } });
  const updateNode = useUpdateAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("حُفظت تغييرات القسم."), onError: failed } });
  const moveNode = useMoveAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("نُقل القسم مع أقسامه الفرعية."), onError: failed } });
  const deleteNode = useDeleteAdminSupplierTaxonomyNode({ mutation: { onSuccess: result => changed(`حُذف ${fmt(result.deletedNodeCount)} قسم مع الحفاظ على الأصناف.`), onError: failed } });
  const reorder = useReorderAdminSupplierTaxonomyNodes({ mutation: { onSuccess: () => changed("حُفظ ترتيب الأقسام."), onError: failed } });
  const createItem = useCreateAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("أُضيف الصنف إلى الأقسام المحددة."), onError: failed } });
  const bulkCreate = useBulkCreateAdminSupplierTaxonomyItems({ mutation: { onSuccess: result => { setBulkText(""); changed(`أُضيف ${fmt(result.added)} صنف؛ تم تخطي ${fmt(result.skipped)} مكرر.`); }, onError: failed } });
  const updateItem = useUpdateAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("حُفظت تغييرات الصنف."), onError: failed } });
  const moveItem = useMoveAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("نُقل الصنف مع الحفاظ على روابط مورديه وأقسامه الإضافية."), onError: failed } });
  const deleteItem = useDeleteAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("حُذف الصنف."), onError: failed } });
  const applyMapping = useApplyAdminSupplierTaxonomyLegacyMapping({ mutation: { onSuccess: () => changed("حُفظ الربط بعد المراجعة. لم يتحول الدليل العام إلى التصنيف الجديد.", true), onError: failed } });
  const importLegacy = useImportAdminSupplierTaxonomyLegacyItems({ mutation: {
    onSuccess: result => changed(`نُقل ${fmt(result.added)} صنف غير مكرر إلى «أصناف غير مصنفة»، وتُخطّي ${fmt(result.skippedDuplicates)} صنف مكرر. بقيت التصنيفات القديمة محفوظة.`, true),
    onError: failed,
  } });
  const pending = [createNode, updateNode, moveNode, deleteNode, reorder, createItem, bulkCreate, updateItem, moveItem, deleteItem, applyMapping, importLegacy].some(m => m.isPending);
  const openNode = (node?: SupplierTaxonomyNode, parentId?: number) => { setNotice(null); setName(node?.name ?? ""); setIcon(node?.icon ?? ""); setDescription(node?.description ?? ""); setActive(node?.isActive ?? true); setDestination(String(parentId ?? node?.parentId ?? "")); setModal({ kind: "node", node, parentId }); };
  const openItem = (item?: SupplierTaxonomyItem, categoryId?: number, associate = false) => {
    setAssociationMode(associate);
    setNotice(null); setName(item?.name ?? ""); setNotes(item?.notes ?? ""); setActive(item?.isActive ?? true);
    setChosenCategories([...(item?.categories
      .filter(category => !category.isPrimary)
      .map(category => category.id) ?? []), ...(categoryId && item?.categoryId !== categoryId && !item?.categories.some(category => category.id === categoryId) ? [categoryId] : [])]);
    setPrimaryCategory(String(item?.categoryId ?? categoryId ?? selectedId ?? ""));
    setModal({ kind: "item", item });
  };
  const openMove = (m: Modal) => { setNotice(null); setDestination(""); setModal(m); };
  const openDelete = (m: Modal) => { setNotice(null); setDeleteStrategy("transfer"); setDestination(""); setAckLinks(false); setModal(m); };
  const exportCsv = async (kind: "tree" | "items") => {
    setExporting(kind); setNotice(null);
    try { download(await (kind === "tree" ? exportAdminSupplierTaxonomyCsv({ responseType: "text" }) : exportAdminSupplierTaxonomyItemsCsv({ responseType: "text" })), kind === "tree" ? "supplier-taxonomy.csv" : "supplier-taxonomy-items.csv"); setNotice({ text: "تم تجهيز ملف CSV للتنزيل.", error: false }); }
    catch (error) { failed(error); } finally { setExporting(null); }
  };
  const filtered = items.filter(item =>
    (!search.trim() || `${item.name} ${item.categories.map(category => category.path).join(" ")} ${item.notes ?? ""}`.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar"))) &&
    (filterStatus === "all" || item.isActive === (filterStatus === "active")) &&
    (filterCategory === "all" || item.categories.some(category =>
      (!primaryOnly || category.isPrimary) && (category.id === Number(filterCategory) ||
        flat.find(n => n.node.id === category.id)?.ancestors.includes(Number(filterCategory)))))
  );
  const deletingPrimaryItems = modal?.kind === "delete-node" && items.some(item =>
    item.categoryId === modal.node.id || flat.find(n => n.node.id === item.categoryId)?.ancestors.includes(modal.node.id));
  const selected = flat.find(n => n.node.id === selectedId);
  const isPublicNode = (id: number) => {
    const entry = flat.find(row => row.node.id === id);
    return !!entry && entry.node.isActive && entry.ancestors.every(parentId => flat.find(row => row.node.id === parentId)?.node.isActive)
      && (entry.ancestors.length ? flat.find(row => row.node.id === entry.ancestors[0])?.node.name : entry.node.name) !== "الخدمات والاستشارات";
  };
  const publicGroup = (node: SupplierTaxonomyNode) => {
    const match = publicGroupsQuery.data?.find(group => group.id === node.id);
    return { name: node.name, slug: match?.slug ?? "", icon: node.icon, parentId: node.parentId };
  };
  const publicItemOrder = new Map(publicItemsQuery.data?.map(item => [item.id, item.displayOrder]) ?? []);
  const sortedNodes = (nodes: SupplierTaxonomyNode[]) => [...nodes].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "ar"));
  const browseNodes = selected ? sortedNodes(selected.node.children) : sortedNodes(tree);
  const browseItems = selected ? items.filter(item => item.categories.some(category => category.id === selected.node.id))
    .sort((a, b) => (publicItemOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (publicItemOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ar") || a.id - b.id) : [];
  const browseTerm = browseSearch.trim().toLocaleLowerCase("ar");
  const visibleBrowseNodes = browseNodes.filter(node => node.name.toLocaleLowerCase("ar").includes(browseTerm));
  const visibleBrowseItems = browseItems.filter(item => `${item.name} ${item.notes ?? ""}`.toLocaleLowerCase("ar").includes(browseTerm));
  const globalBrowseMatches = !selected && browseTerm
    ? items.filter(item => `${item.name} ${item.categories.map(category => category.path).join(" ")} ${item.notes ?? ""}`.toLocaleLowerCase("ar").includes(browseTerm))
    : [];
  const browseTrail = selected ? [...selected.ancestors.map(id => flat.find(entry => entry.node.id === id)).filter((entry): entry is NonNullable<typeof entry> => !!entry), selected] : [];
  const pendingReview = review.filter(row => row.mappedItemId === null).length;
  const duplicateItem = modal?.kind === "item" && name.trim()
    ? items.find(item => item.id !== modal.item?.id && normalizeItemName(item.name) === normalizeItemName(name))
    : undefined;
  const renderBranch = (nodes: SupplierTaxonomyNode[], depth = 0): ReactNode => nodes.map((node, index) => {
    const open = expanded.has(node.id);
    const siblings = nodes.map(n => n.id);
    const order = (direction: -1 | 1) => { const ids = [...siblings]; [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]; reorder.mutate({ data: { parentId: node.parentId, orderedIds: ids } }); };
    return <div key={node.id} className={depth ? "taxonomy-tree-line" : ""}>
      <div data-testid={`row-taxonomy-node-${node.id}`} className={`group my-1.5 flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center ${selectedId === node.id ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-secondary/25"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" data-testid={`button-expand-taxonomy-${node.id}`} disabled={!node.children.length} aria-label={open ? `طي ${node.name}` : `توسيع ${node.name}`} aria-expanded={open} onClick={() => setExpanded(current => { const next = new Set(current); if (open) next.delete(node.id); else next.add(node.id); return next; })} className="rounded-md p-1 disabled:opacity-30">{open ? <ChevronDown size={16}/> : <ChevronLeft size={16}/>}</button>
           <button type="button" data-testid={`button-select-taxonomy-${node.id}`} onClick={() => { browseTo(node.id); setFilterCategory(String(node.id)); setView("browse"); }} className="flex min-w-0 flex-1 items-center gap-2 text-right">
            {open ? <FolderOpen size={20} className="shrink-0 text-primary"/> : <Folder size={20} className="shrink-0 text-primary"/>}
            <span className="min-w-0 truncate font-extrabold">{node.name}</span>
            {!node.isActive && <span className="rounded-full bg-muted px-2 text-[10px]">معطل</span>}
            <span className="shrink-0 text-xs text-muted-foreground">{fmt(node.itemCount)} صنف</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1 ps-7 sm:ps-0">
          {node.parentId === null && <button className={btn} type="button" data-testid={`button-add-child-${node.id}`} onClick={() => { setExpanded(current => new Set(current).add(node.id)); openNode(undefined, node.id); }}><Plus size={14}/>فرعي</button>}
          <button className={btn} type="button" data-testid={`button-edit-node-${node.id}`} onClick={() => openNode(node)}><Pencil size={14}/>تعديل</button>
          <button className={btn} type="button" data-testid={`button-move-node-${node.id}`} disabled={node.parentId === null && node.children.length > 0} title={node.parentId === null && node.children.length > 0 ? "المجموعة ذات الفروع لا تُنقل إلى داخل مجموعة أخرى" : undefined} onClick={() => openMove({ kind: "move-node", node })}>نقل</button>
          <button className={btn} type="button" data-testid={`button-up-node-${node.id}`} aria-label={`رفع ${node.name}`} disabled={pending || index === 0} onClick={() => order(-1)}><ArrowUp size={14}/></button>
          <button className={btn} type="button" data-testid={`button-down-node-${node.id}`} aria-label={`خفض ${node.name}`} disabled={pending || index === nodes.length - 1} onClick={() => order(1)}><ArrowDown size={14}/></button>
          <button className={`${btn} text-destructive`} type="button" data-testid={`button-delete-node-${node.id}`} onClick={() => openDelete({ kind: "delete-node", node })}><Trash2 size={14}/></button>
        </div>
      </div>
      {open && node.children.length > 0 && renderBranch([...node.children].sort((a,b) => a.displayOrder - b.displayOrder || a.id - b.id), depth + 1)}
    </div>;
  });
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (!modal || pending) return;
    const clean = name.trim();
    if (modal.kind === "node") { if (!clean) return; const data = { name: clean, icon: icon.trim(), description: description.trim() || null, isActive: active }; modal.node ? updateNode.mutate({ id: modal.node.id, data }) : createNode.mutate({ data: { ...data, parentId: destination ? Number(destination) : null } }); }
    if (modal.kind === "item") {
      if (!clean || !primaryCategory) {
        failed(new Error("اختر القسم الرئيسي للصنف.")); return;
      }
      if (duplicateItem) {
        failed(new Error("يوجد صنف بهذا الاسم بالفعل. عدّل الصنف الموجود بدلاً من إنشاء نسخة.")); return;
      }
       const data = { name: clean, notes: notes.trim() || null, isActive: active,
         categoryIds: [Number(primaryCategory), ...chosenCategories.filter(id => id !== Number(primaryCategory))], primaryCategoryId: Number(primaryCategory) };
      modal.item ? updateItem.mutate({ id: modal.item.id, data }) : createItem.mutate({ data });
    }
    if (modal.kind === "move-node") moveNode.mutate({ id: modal.node.id, data: { parentId: destination ? Number(destination) : null } });
    if (modal.kind === "move-item" && destination) moveItem.mutate({ id: modal.item.id, data: { categoryId: Number(destination) } });
    if (modal.kind === "delete-node") deleteNode.mutate({ id: modal.node.id, data: { strategy: deleteStrategy, confirmed: true, ...(deleteStrategy === "cascade" ? { confirmSupplierLinks: ackLinks, ...(destination ? { replacementPrimaryCategoryId: Number(destination) } : {}) } : { transferToNodeId: Number(destination) }) } });
    if (modal.kind === "delete-item") deleteItem.mutate({ id: modal.item.id, data: { confirmed: true } });
    if (modal.kind === "bulk" && destination) { const names = bulkText.split(/\r?\n/).map(s => s.trim()).filter(Boolean); if (names.length && names.length <= 1000 && names.every(n => n.length <= 120)) bulkCreate.mutate({ data: { items: names.map(n => ({ name: n, categoryId: Number(destination) })) } }); else failed(new Error("أدخل من ١ إلى ١٠٠٠ اسم، بحد أقصى ١٢٠ حرفاً لكل اسم.")); }
    if (modal.kind === "mapping" && destination) {
      if (review.find(row => row.legacyId === modal.legacy.legacyId)?.mappedItemId != null) { setModal(null); failed(new Error("سبق تأكيد هذا الربط؛ لا يمكن تغييره.")); return; }
      applyMapping.mutate({ legacyId: modal.legacy.legacyId, data: { itemId: Number(destination), confirmed: true } });
    }
    if (modal.kind === "legacy-import") importLegacy.mutate({ data: { confirmed: true } });
  };
  const nodeOptions = (excludeId?: number) => <><option value="">اختر القسم</option>{flat.filter(n => n.node.id !== excludeId && !n.ancestors.includes(excludeId ?? -1)).map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</>;
  return <section dir="rtl" className="taxonomy-workbench space-y-5" aria-label="شجرة تصنيفات الموردين الجديدة">
    <header className="taxonomy-surface overflow-hidden">
      <div className="flex flex-col justify-between gap-5 bg-secondary/35 p-5 md:flex-row md:items-end md:p-7">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary"><FolderTree size={17}/> إدارة الفهرس</div><h2 className="text-2xl font-extrabold md:text-3xl">أضف الأصناف وعدّلها من هنا.</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">ابحث عن الصنف لتعديل اسمه أو قسمه، أو أضف صنفاً جديداً. إذا كان الصنف موجوداً في قسم خاطئ، انقله بدلاً من إنشاء نسخة ثانية.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" data-testid="button-refresh-taxonomy" disabled={refreshing} className={btn} onClick={() => void refresh()}><RefreshCw size={15}/>{refreshing ? "جارٍ التحديث..." : "تحديث"}</button><button type="button" data-testid="button-export-taxonomy" disabled={!!exporting} className={btn} onClick={() => void exportCsv("tree")}><Download size={15}/> CSV الأقسام</button><button type="button" data-testid="button-export-taxonomy-items" disabled={!!exporting} className={btn} onClick={() => void exportCsv("items")}><Download size={15}/> CSV الأصناف</button></div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">{[["الأقسام", flat.length], ["الأصناف", items.length], ["روابط الموردين بالأصناف", items.reduce((sum,item) => sum + item.supplierCount,0)], ["بانتظار مراجعة الربط", pendingReview]].map(([title,value]) => <div key={title} className="bg-card p-4"><p className="text-xs text-muted-foreground">{title}</p><strong className="text-2xl" data-testid={`metric-taxonomy-${title}`}>{fmt(Number(value))}</strong></div>)}</div>
    </header>
     <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4 text-sm"><AlertTriangle size={19} className="mt-1 shrink-0 text-warning"/><p><strong>الأصناف والأقسام المعطّلة لا تظهر للزوار.</strong> راجع ارتباطات الموردين والتصنيفات القديمة قبل الحذف؛ التعديل أو نقل الصنف يحافظ على هويته وروابطه.</p></div>
    {[treeQuery, itemsQuery, reviewQuery, auditQuery].some(query => query.isError && query.data !== undefined) &&
      <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
        <span>تعذر تحديث بعض البيانات؛ نعرض آخر نسخة متاحة وسنعيد المحاولة تلقائياً.</span>
        <button type="button" className={btn} disabled={refreshing} onClick={() => void refresh()}>إعادة المحاولة الآن</button>
      </div>}
    {notice && <div role={notice.error ? "alert" : "status"} data-testid="status-taxonomy-action" className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${notice.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/25 bg-success/5 text-foreground"}`}><span>{notice.text}</span><button type="button" data-testid="button-dismiss-taxonomy-notice" aria-label="إغلاق الإشعار" onClick={() => setNotice(null)} className="ms-auto"><X size={16}/></button></div>}
     <div role="tablist" aria-label="أقسام إدارة الهيكل" className="flex flex-wrap gap-2 border-b pb-3">
       {([["browse","تصفح المجموعات",Layers3],["tree","شجرة الأقسام المتقدمة",FolderTree],["items","قائمة كل الأصناف",FileText],["review",`مراجعة القديم (${fmt(pendingReview)})`,AlertTriangle],["audit","سجل النشاط",History]] as const).map(([id,title,Icon]) => <button key={id} type="button" role="tab" aria-selected={view === id} data-testid={`button-taxonomy-view-${id}`} onClick={() => setView(id)} className={view === id ? primary : btn}><Icon size={16}/>{title}</button>)}
    </div>
     {view === "browse" && <div className="space-y-6">
       <div className="taxonomy-surface overflow-hidden">
         <div className="border-b bg-secondary/20 px-5 py-5 md:px-7">
           <nav aria-label="مسار مجموعات الفهرس" className="mb-5 flex flex-wrap items-center gap-1.5 text-sm">
             <button type="button" data-testid="button-taxonomy-browse-root" aria-current={!selected ? "page" : undefined} onClick={() => browseTo(null)} className={!selected ? "font-extrabold text-foreground" : "font-bold text-primary hover:underline"}>المجموعات</button>
             {browseTrail.map((entry, index) => <span key={entry.node.id} className="inline-flex items-center gap-1.5"><ChevronLeft size={15} className="text-muted-foreground"/><button type="button" data-testid={`button-taxonomy-breadcrumb-${entry.node.id}`} aria-current={index === browseTrail.length - 1 ? "page" : undefined} onClick={() => browseTo(entry.node.id)} className={index === browseTrail.length - 1 ? "font-extrabold" : "font-bold text-primary hover:underline"}>{entry.node.name}</button></span>)}
           </nav>
           <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
             <div className="flex items-start gap-4">
               {selected && (() => { const Icon = getGroupIcon(publicGroup(selected.node)); return <span className="rounded-2xl border border-primary/15 bg-card p-3 text-primary"><Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden="true"/></span>; })()}
               <div><p className="text-xs font-extrabold text-primary">{selected ? selected.node.parentId === null ? "مجموعة رئيسية" : "مجموعة فرعية" : "دليل التصنيفات"}</p><h3 className="mt-1 text-2xl font-extrabold md:text-3xl">{selected?.node.name ?? "تصفح المجموعات"}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected ? `${fmt(browseNodes.length)} مجموعات فرعية · ${fmt(browseItems.length)} أصناف في هذا القسم` : "نفس ترتيب المجموعات الذي يبدأ منه الزائر. افتح مجموعة لإدارة أصنافها وفروعها."}</p>
                 {selected && !isPublicNode(selected.node.id) && <span className="mt-2 inline-block rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">غير ظاهر للزوار · قسم غير منشور</span>}
               </div>
             </div>
             <div className="flex flex-wrap gap-2">
               {selected ? <><button type="button" className={btn} data-testid="button-browse-edit-group" onClick={() => openNode(selected.node)}><Pencil size={15}/> تعديل المجموعة</button><button type="button" className={btn} data-testid="button-browse-move-group" disabled={selected.node.parentId === null && selected.node.children.length > 0} onClick={() => openMove({kind:"move-node",node:selected.node})}>نقل المجموعة</button><button type="button" className={`${btn} text-destructive`} data-testid="button-browse-delete-group" onClick={() => openDelete({kind:"delete-node",node:selected.node})}><Trash2 size={15}/> حذف المجموعة</button>{selected.node.parentId === null && <button type="button" className={btn} data-testid="button-browse-add-subgroup" onClick={() => openNode(undefined, selected.node.id)}><Plus size={15}/> إضافة مجموعة فرعية</button>}<button type="button" className={primary} data-testid="button-browse-add-item" onClick={() => openItem()}><Plus size={15}/> إضافة صنف هنا</button></> : <button type="button" className={primary} data-testid="button-browse-add-root" onClick={() => openNode()}><Plus size={15}/> مجموعة رئيسية</button>}
             </div>
           </div>
         </div>
         <div className="p-4 md:p-6"><label className="relative block max-w-md"><span className="sr-only">البحث في التصنيفات والأصناف</span><Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input type="search" data-testid="input-taxonomy-browse-search" className="taxonomy-field pr-10" placeholder={selected ? "ابحث في الفروع والأصناف هنا..." : "ابحث في المجموعات والأصناف..." } value={browseSearch} onChange={e => setBrowseSearch(e.target.value)}/></label></div>
       </div>
       {treeQuery.isLoading || itemsQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Skeleton/><Skeleton/><Skeleton/></div> : (treeQuery.isError && treeQuery.data === undefined) || (itemsQuery.isError && itemsQuery.data === undefined) ? <Failure retry={() => void refresh()}/> : <>
         {visibleBrowseNodes.length > 0 && <section aria-label={selected ? "المجموعات الفرعية" : "المجموعات الرئيسية"}><h4 className="mb-4 text-lg font-extrabold">{selected ? "المجموعات الفرعية" : "المجموعات الرئيسية"}</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleBrowseNodes.map(node => { const Icon = getGroupIcon(publicGroup(node)); return <article key={node.id} data-testid={`card-taxonomy-group-${node.id}`} className="taxonomy-surface group flex min-h-44 flex-col justify-between p-5 transition-transform hover:-translate-y-0.5">
           <div className="flex items-start justify-between gap-2"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-8 w-8" strokeWidth={1.5} aria-hidden="true"/></span>{!isPublicNode(node.id) && <span className="rounded-full bg-warning/10 px-2 py-1 text-xs font-bold text-warning">غير ظاهر للزوار</span>}</div>
           <div className="mt-5"><button type="button" data-testid={`button-browse-group-${node.id}`} className="flex w-full items-center justify-between gap-3 text-right text-lg font-extrabold hover:text-primary focus-visible:outline-primary" onClick={() => browseTo(node.id)}><span>{node.name}</span><ChevronLeft size={18} className="shrink-0 text-primary"/></button><p className="mt-1 text-sm text-muted-foreground">{fmt(node.itemCount)} صنف</p></div>
           <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3"><button type="button" className={btn} data-testid={`button-browse-add-item-${node.id}`} onClick={() => { browseTo(node.id); openItem(undefined, node.id); }}><Plus size={14}/> صنف</button>{node.parentId === null && <button type="button" className={btn} data-testid={`button-browse-add-child-${node.id}`} onClick={() => openNode(undefined, node.id)}><Plus size={14}/> فرعي</button>}<button type="button" className={btn} data-testid={`button-browse-edit-group-${node.id}`} onClick={() => openNode(node)}><Pencil size={14}/> تعديل</button><button type="button" className={btn} data-testid={`button-browse-move-group-${node.id}`} disabled={node.parentId === null && node.children.length > 0} onClick={() => openMove({kind:"move-node",node})}>نقل</button><button type="button" className={`${btn} text-destructive`} data-testid={`button-browse-delete-group-${node.id}`} aria-label={`حذف مجموعة ${node.name}`} onClick={() => openDelete({kind:"delete-node",node})}><Trash2 size={14}/></button></div>
         </article>; })}</div></section>}
         {globalBrowseMatches.length > 0 && <section aria-label="نتائج الأصناف"><h4 className="mb-4 text-lg font-extrabold">الأصناف المطابقة ({fmt(globalBrowseMatches.length)})</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{globalBrowseMatches.map(item => <article key={item.id} className="taxonomy-surface p-4"><strong className="block">{item.name}</strong><p className="mt-1 text-xs text-muted-foreground">{item.categoryPath}{!item.isActive ? " · معطّل" : ""}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={btn} onClick={() => browseTo(item.categoryId)}>عرض في القسم</button><button type="button" className={btn} onClick={() => openItem(item)}><Pencil size={14}/> تعديل</button><button type="button" className={btn} onClick={() => openItem(item, undefined, true)}><Link2 size={14}/> ربط بقسم آخر</button></div></article>)}</div></section>}
         {selected && <section aria-label="الأصناف في المجموعة"><div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h4 className="text-lg font-extrabold">الأصناف في {selected.node.name}</h4><p className="mt-1 text-xs text-muted-foreground">تظهر العضوية الأساسية والإضافية هنا دون تكرار للصنف نفسه.</p></div><span className="text-sm text-muted-foreground">{fmt(visibleBrowseItems.length)} صنف</span></div>
           {visibleBrowseItems.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleBrowseItems.map(item => { const membership = item.categories.find(category => category.id === selected.node.id); return <article key={item.id} data-testid={`card-taxonomy-item-${item.id}`} className="taxonomy-surface flex min-h-44 flex-col p-5">
             <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-secondary/50 p-2.5 text-primary"><FileText size={23} aria-hidden="true"/></span><div className="flex flex-wrap justify-end gap-1"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${membership?.isPrimary ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"}`}>{membership?.isPrimary ? "القسم الأساسي" : "قسم إضافي"}</span>{(!item.isActive || !isPublicNode(selected.node.id) || !isPublicNode(item.categoryId)) && <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-bold text-warning">غير ظاهر للزوار</span>}</div></div>
             <h5 className="mt-4 text-lg font-extrabold">{item.name}</h5><p className="mt-1 text-xs text-muted-foreground">{fmt(item.supplierCount)} مورد · {item.categories.length > 1 ? `${fmt(item.categories.length)} أقسام مرتبطة` : "قسم واحد"}</p>
             {item.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.notes}</p>}
             {!membership?.isPrimary && <p className="mt-2 text-xs text-muted-foreground">الأساسي: {item.categories.find(category => category.isPrimary)?.path ?? item.categoryPath}</p>}
             <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4"><button type="button" className={btn} data-testid={`button-browse-edit-item-${item.id}`} onClick={() => openItem(item)}><Pencil size={14}/> تعديل</button><button type="button" className={btn} data-testid={`button-browse-associate-item-${item.id}`} onClick={() => openItem(item, undefined, true)}><Link2 size={14}/> ربط نفس الصنف بقسم آخر</button><button type="button" className={btn} data-testid={`button-browse-move-item-${item.id}`} onClick={() => openMove({kind:"move-item",item})}>نقل</button><button type="button" className={`${btn} text-destructive`} data-testid={`button-browse-delete-item-${item.id}`} onClick={() => openDelete({kind:"delete-item",item})}><Trash2 size={14}/> حذف</button></div>
           </article>; })}</div> : <Empty title={browseTerm ? "لا توجد نتائج في هذا القسم" : "لا توجد أصناف مباشرة هنا"} detail={browseTerm ? "جرّب كلمة أخرى أو افتح مجموعة فرعية." : "الأصناف في المجموعات الفرعية تظهر داخل كل مجموعة. يمكنك إضافة صنف مباشرة إلى هذا القسم."} action={!browseTerm ? <button type="button" className={primary} onClick={() => openItem()}>إضافة صنف هنا</button> : undefined}/>}
         </section>}
         {!visibleBrowseNodes.length && !globalBrowseMatches.length && !selected && <Empty title={browseTerm ? "لا توجد مجموعات أو أصناف مطابقة" : "ابدأ بإضافة مجموعة رئيسية"} detail={browseTerm ? "جرّب كلمة بحث أخرى." : "ستظهر المجموعات هنا بنفس ترتيبها في الدليل العام."} action={!browseTerm ? <button type="button" className={primary} onClick={() => openNode()}>إضافة مجموعة</button> : undefined}/>}
       </>}
     </div>}
    {view === "tree" && <div className="taxonomy-surface p-4 md:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-extrabold">شجرة الأقسام</h3><p className="text-xs text-muted-foreground">افتح القسم لعرض فروعه. الأسهم تغيّر ترتيبه بين إخوته فقط.</p></div><button type="button" data-testid="button-create-root-taxonomy" className={primary} onClick={() => openNode()}><Plus size={16}/> قسم رئيسي</button></div>
      {treeQuery.isLoading ? <Skeleton/> : treeQuery.isError && treeQuery.data === undefined ? <Failure retry={() => void treeQuery.refetch()}/> : !tree.length ? <Empty title="الشجرة جاهزة للبناء" detail="أضف قسماً رئيسياً، ثم أنشئ تحته أقساماً فرعية بالعمق المناسب." action={<button type="button" className={primary} onClick={() => openNode()}>إضافة القسم الأول</button>}/> : renderBranch([...tree].sort((a,b) => a.displayOrder - b.displayOrder || a.id - b.id))}
    </div>}
    {view === "items" && <div className="space-y-4"><div className="taxonomy-surface p-4 md:p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h3 className="text-lg font-extrabold">قائمة الأصناف</h3><p className="text-xs text-muted-foreground">{selected ? `القسم المحدد: ${selected.path}` : "ابحث وراجع المسار وحالة كل صنف وروابط مورديه."}</p></div><div className="flex flex-wrap gap-2"><button type="button" data-testid="button-bulk-taxonomy-items" className={btn} onClick={() => { setDestination(String(selectedId ?? "")); setBulkText(""); setModal({kind:"bulk"}); }}><Plus size={15}/> إضافة قائمة</button><button type="button" data-testid="button-create-taxonomy-item" className={primary} onClick={() => openItem()}><Plus size={15}/> صنف جديد</button></div></div>
      <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)_minmax(9rem,11rem)]"><label className="relative"><span className="sr-only">بحث الأصناف</span><Search size={16} className="absolute right-3 top-3.5 text-muted-foreground"/><input data-testid="input-taxonomy-search" className="taxonomy-field pr-10" placeholder="ابحث باسم الصنف أو المسار أو الملاحظات" value={search} onChange={e => setSearch(e.target.value)}/></label><select data-testid="select-taxonomy-category-filter" aria-label="تصفية حسب القسم" className="taxonomy-field" value={filterCategory} onChange={e => {setFilterCategory(e.target.value);setSelectedId(e.target.value === "all" ? null : Number(e.target.value));}}><option value="all">كل الأقسام</option>{flat.map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select><select data-testid="select-taxonomy-status-filter" aria-label="تصفية حسب الحالة" className="taxonomy-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطّل</option></select></div>{selected && <button type="button" className="mt-3 text-xs font-bold text-primary hover:underline" onClick={() => { setSelectedId(null); setFilterCategory("all"); }}>ابحث في كل الأقسام قبل إضافة صنف، لتجنب التكرار</button>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="checkbox-taxonomy-primary-only" checked={primaryOnly} onChange={event => setPrimaryOnly(event.target.checked)}/> عرض الأصناف الأساسية فقط في القسم المحدد</label>
      {itemsQuery.isLoading || treeQuery.isLoading ? <Skeleton/> : (itemsQuery.isError && itemsQuery.data === undefined) || (treeQuery.isError && treeQuery.data === undefined) ? <Failure retry={() => void refresh()}/> : !filtered.length ? <Empty title="لا توجد أصناف مطابقة" detail={items.length ? "غيّر البحث أو المرشحات لعرض أصناف أخرى." : "أضف صنفاً إلى أحد أقسام الشجرة للبدء."} action={flat.length ? <button type="button" className={primary} onClick={() => openItem()}>إضافة صنف</button> : undefined}/> : <div className="taxonomy-surface overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-sm">
          <thead className="bg-secondary/30 text-xs"><tr><th className="p-4">الصنف</th><th className="p-4">الأقسام المرتبطة</th><th className="p-4">الموردون</th><th className="p-4">الحالة</th><th className="p-4">الإجراءات</th></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id} data-testid={`row-taxonomy-item-${item.id}`} className="border-t hover:bg-secondary/15">
            <td className="p-4"><div className="flex items-center gap-2 font-extrabold"><FileText size={16} className="text-primary"/>{item.name}</div>{item.notes && <p className="mt-1 max-w-44 truncate text-xs text-muted-foreground" title={item.notes}>{item.notes}</p>}</td>
            <td className="p-4"><div className="flex flex-wrap gap-1">{item.categories.map(category =>
              <span key={category.id} title={category.path} className={`rounded-lg border px-2 py-1 text-xs ${category.isPrimary ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}`}>{category.path}{category.isPrimary ? " · أساسي" : ""}</span>
            )}</div></td>
            <td className="p-4">{fmt(item.supplierCount)}</td>
            <td className="p-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "نشط" : "معطل"}</span></td>
            <td className="p-4"><div className="flex flex-wrap gap-1">
               <button type="button" data-testid={`button-edit-taxonomy-item-${item.id}`} className={btn} onClick={() => openItem(item)}><Pencil size={14}/> تعديل الصنف</button>
              <button type="button" data-testid={`button-toggle-taxonomy-item-${item.id}`} disabled={pending} className={btn} onClick={() => updateItem.mutate({id:item.id,data:{isActive:!item.isActive}})}>{item.isActive ? "تعطيل" : "تفعيل"}</button>
               <button type="button" data-testid={`button-move-taxonomy-item-${item.id}`} className={btn} onClick={() => openMove({kind:"move-item",item})}>نقل الصنف</button>
              <button type="button" data-testid={`button-delete-taxonomy-item-${item.id}`} className={`${btn} text-destructive`} onClick={() => openDelete({kind:"delete-item",item})}>حذف</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}<p data-testid="text-taxonomy-result-count" className="text-xs text-muted-foreground">{fmt(filtered.length)} من {fmt(items.length)} صنف</p>
    </div>}
    {view === "review" && <div className="taxonomy-surface p-4 md:p-6"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="text-lg font-extrabold">مراجعة ربط الأصناف القديمة</h3><p className="mt-1 text-sm text-muted-foreground">اختر صنفاً جديداً لكل تصنيف قديم ثم أكّد الربط بنفسك. عدد الموردين يعرض الروابط الموجودة لا روابط جديدة.</p></div><label className="flex items-center gap-2 text-sm"><input data-testid="checkbox-only-pending-review" type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)}/> المعلّقة فقط</label></div>
      {importPreviewQuery.isLoading ? <Skeleton/> : importPreviewQuery.isError && !importPreviewQuery.data
        ? <Failure retry={() => void importPreviewQuery.refetch()}/>
        : importPreviewQuery.data && <div className="mb-6 rounded-xl border bg-secondary/20 p-4 text-sm">
          <h4 className="font-extrabold">نقل الأصناف غير المكررة إلى الشجرة الجديدة</h4>
          <p className="mt-1 text-muted-foreground">يُنقل الصنف غير الموجود بالاسم إلى قسم «أصناف غير مصنفة» بحالة معطّلة حتى تحدد قسمه الصحيح. لا تُحذف التصنيفات القديمة، ولا تُنشأ نسخ من الأصناف المكررة.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span>الأصناف القديمة: <strong>{fmt(importPreviewQuery.data.sourceItemCount)}</strong></span>
            <span>نُقلت سابقاً: <strong>{fmt(importPreviewQuery.data.importedCount)}</strong></span>
            <span>المكررة (لن تُنقل): <strong>{fmt(importPreviewQuery.data.duplicateCount)}</strong></span>
            <span>جاهزة للنقل: <strong>{fmt(importPreviewQuery.data.readyToImportCount)}</strong></span>
          </div>
          {importPreviewQuery.data.unreviewedItemCount > 0 && <p className="mt-2 text-xs text-muted-foreground">
            تبقى {fmt(importPreviewQuery.data.unreviewedItemCount)} حالة تحتاج مراجعة ربط قبل التخلي عن التصنيفات القديمة
            {importPreviewQuery.data.unreviewedSupplierLinkCount > 0 ? `، ومنها ${fmt(importPreviewQuery.data.unreviewedSupplierLinkCount)} ارتباطاً بمورد` : ""}.
          </p>}
          {importPreviewQuery.data.missingImportedCount > 0 && <p role="alert" className="mt-2 text-xs text-destructive">حُذف {fmt(importPreviewQuery.data.missingImportedCount)} صنف مستورد بعد نقله؛ لن يُعاد إنشاؤه تلقائياً. راجع الربط قبل حذف القديم.</p>}
          <button type="button" data-testid="button-preview-legacy-import" className={`${primary} mt-3`} disabled={pending || importPreviewQuery.data.readyToImportCount === 0}
            onClick={() => { setNotice(null); setModal({kind:"legacy-import"}); }}>نقل الأصناف غير المكررة</button>
        </div>}
      {reviewQuery.isLoading || itemsQuery.isLoading ? <Skeleton/> : (reviewQuery.isError && reviewQuery.data === undefined) || (itemsQuery.isError && itemsQuery.data === undefined) ? <Failure retry={() => void refresh()}/> : !review.length ? <Empty title="لا توجد تصنيفات قديمة للمراجعة" detail="ستظهر هنا سجلات الربط عندما تتوفر بياناتها."/> : <div className="space-y-2">
        {review.filter(row => !onlyPending || row.mappedItemId === null).map(row => <div data-testid={`row-taxonomy-review-${row.legacyId}`} key={row.legacyId} className="flex flex-col gap-3 rounded-xl border bg-background p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><strong>{row.legacyName}</strong><p className="text-xs text-muted-foreground">{row.legacyGroupName} · {fmt(row.supplierCount)} مورد</p></div>
          {row.mappedItemId !== null ? <div data-testid={`status-taxonomy-mapping-${row.legacyId}`} className="rounded-lg border border-success/25 bg-success/5 px-4 py-2 text-sm">
            <strong className="text-success">تمت المراجعة</strong><span className="mx-2 text-muted-foreground">←</span>{items.find(item => item.id === row.mappedItemId)?.name ?? `صنف رقم ${fmt(row.mappedItemId)}`}
          </div> : <>
            <select data-testid={`select-taxonomy-mapping-${row.legacyId}`} aria-label={`الصنف الجديد لـ ${row.legacyName}`} className="taxonomy-field lg:w-72" value={mappingSelections[row.legacyId] ?? ""} onChange={e => setMappingSelections(current => ({...current,[row.legacyId]:e.target.value}))}><option value="">اختر الصنف الجديد</option>{items.map(item => <option key={item.id} value={item.id}>{item.categoryPath} / {item.name}{item.id === row.suggestedItemId ? " — مقترح" : ""}</option>)}</select>
            <button type="button" data-testid={`button-review-mapping-${row.legacyId}`} disabled={!mappingSelections[row.legacyId] || pending} className={primary} onClick={() => { setDestination(mappingSelections[row.legacyId]); setModal({kind:"mapping",legacy:row}); }}>مراجعة وتأكيد</button>
          </>}
        </div>)}{onlyPending && pendingReview === 0 && <p className="p-5 text-center text-sm text-muted-foreground">اكتملت مراجعة كل الروابط القديمة.</p>}</div>}
    </div>}
    {view === "audit" && <div className="taxonomy-surface p-4 md:p-6">
      <div className="mb-5"><h3 className="flex items-center gap-2 text-lg font-extrabold"><History size={20} className="text-primary"/>سجل نشاط التصنيفات</h3><p className="mt-1 text-sm text-muted-foreground">سجل الإجراءات الإدارية على الأقسام والأصناف والربط القديم. تُعرض هوية المدير ونوع الإجراء فقط، دون تفاصيل داخلية حساسة.</p></div>
      {auditQuery.isLoading ? <Skeleton/> : auditQuery.isError && auditQuery.data === undefined ? <Failure retry={() => void auditQuery.refetch()}/> : !auditQuery.data?.length ? <Empty title="لم يُسجّل نشاط بعد" detail="ستظهر تغييرات التصنيفات هنا بعد تنفيذها."/> : <ol className="divide-y">
        {[...auditQuery.data].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(entry => <li key={entry.id} data-testid={`row-taxonomy-audit-${entry.id}`} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><History size={16}/></span><div><strong data-testid={`text-taxonomy-audit-action-${entry.id}`} className="text-sm">{auditAction(entry.action)} · {auditEntity(entry.entityType)}{entry.entityId !== null ? ` رقم ${fmt(entry.entityId)}` : ""}</strong><p data-testid={`text-taxonomy-audit-actor-${entry.id}`} className="text-xs text-muted-foreground">بواسطة {entry.adminId === null ? "مدير غير محدد" : `المدير رقم ${fmt(entry.adminId)}`}</p></div></div>
          <time data-testid={`text-taxonomy-audit-date-${entry.id}`} dateTime={entry.createdAt} className="ps-11 text-xs text-muted-foreground sm:ps-0">{Number.isNaN(Date.parse(entry.createdAt)) ? "تاريخ غير متاح" : new Date(entry.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time>
        </li>)}
      </ol>}
    </div>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-3" onMouseDown={e => { if (e.target === e.currentTarget && !pending) setModal(null); }}><div role="dialog" aria-modal="true" aria-labelledby="taxonomy-dialog-title" className="taxonomy-surface max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5 shadow-warm-lg md:p-7"><div className="mb-5 flex items-start justify-between gap-2"><div><h3 id="taxonomy-dialog-title" className="text-xl font-extrabold">{modal.kind === "node" ? modal.node ? "تعديل القسم" : "إضافة قسم" : modal.kind === "item" ? associationMode ? "ربط نفس الصنف بقسم إضافي" : modal.item ? "تعديل الصنف" : "إضافة صنف" : modal.kind === "bulk" ? "إضافة أصناف دفعة واحدة" : modal.kind === "legacy-import" ? "نقل الأصناف غير المكررة" : modal.kind === "mapping" ? "تأكيد ربط التصنيف القديم" : modal.kind.startsWith("delete") ? "تأكيد الحذف" : "نقل إلى مكان جديد"}</h3><p className="mt-1 text-xs text-muted-foreground">{associationMode && modal.kind === "item" ? "اختر قسماً إضافياً أدناه واحفظ الصنف الموجود بهويته وروابط مورديه نفسها. يمكنك إزالة عضوية إضافية بإلغاء اختيارها." : "احفظ التغييرات بعد التحقق من القسم والروابط المرتبطة به."}</p></div><button type="button" data-testid="button-close-taxonomy-dialog" aria-label="إغلاق" disabled={pending} onClick={() => setModal(null)}><X size={20}/></button></div>
      <form onSubmit={submit} className="space-y-4">
        {notice?.error && <p role="alert" data-testid="status-taxonomy-dialog-error" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{notice.text}</p>}
        {modal.kind === "legacy-import" && <div className="space-y-3 rounded-xl border bg-secondary/20 p-4 text-sm">
          <p>سيُنقل <strong>{fmt(importPreviewQuery.data?.readyToImportCount ?? 0)}</strong> صنفاً جديداً إلى القسم المؤقت بحالة معطّلة. ستُتخطّى الأسماء المكررة ولن يتغير الصنف الموجود أو أقسامه.</p>
          <p>ستبقى جميع السجلات القديمة كما هي. ترتبط الأصناف المنقولة بمورديها القدامى إن وُجدوا؛ أما المكررات فتبقى روابط مورديها في السجلات القديمة حتى تراجع ربطها يدوياً.</p>
          <p className="font-bold text-destructive">لن تُحذف التصنيفات القديمة، ولن تُعرض هذه الأصناف في الدليل العام قبل تصنيفها واعتماد النقل.</p>
        </div>}
        {(modal.kind === "node" || modal.kind === "item") && <><label><span className={label}>الاسم</span><input data-testid="input-taxonomy-name" autoFocus className="taxonomy-field" required maxLength={modal.kind === "node" ? 100 : 120} value={name} onChange={e => setName(e.target.value)}/></label>{modal.kind === "node" ? <><label><span className={label}>رمز القسم (اختياري)</span><input data-testid="input-taxonomy-icon" className="taxonomy-field" maxLength={24} value={icon} onChange={e => setIcon(e.target.value)} placeholder="رمز قصير"/></label><label><span className={label}>الوصف</span><textarea data-testid="input-taxonomy-description" className="taxonomy-field min-h-20" maxLength={500} value={description} onChange={e => setDescription(e.target.value)}/></label></> : <label><span className={label}>ملاحظات داخلية</span><textarea data-testid="input-taxonomy-notes" className="taxonomy-field min-h-20" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)}/></label>}<label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-testid="checkbox-taxonomy-active" checked={active} onChange={e => setActive(e.target.checked)}/> نشط</label></>}
        {modal.kind === "item" && duplicateItem && <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm"><p>«{duplicateItem.name}» موجود بالفعل في {duplicateItem.categoryPath}. عدّل اسمه أو انقله للقسم الصحيح بدلاً من إنشاء صنف مكرر.</p><button type="button" className={`${btn} mt-2`} onClick={() => openItem(duplicateItem)}>تعديل الصنف الموجود</button></div>}
        {modal.kind === "bulk" && <label><span className={label}>اسم واحد في كل سطر (حتى ١٠٠٠ صنف)</span><textarea data-testid="textarea-taxonomy-bulk" className="taxonomy-field min-h-44" value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"اكتب اسم الصنف الأول\nواسم الصنف الثاني"}/><span className="text-xs text-muted-foreground">{fmt(bulkText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length)} اسم مُدخل</span></label>}
        {modal.kind === "delete-node" && <><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"><strong>حذف «{modal.node.name}»</strong><p>لن يُحذف أي صنف. ستُزال روابط الأقسام المحذوفة فقط، ويجب اختيار بديل لأي قسم أساسي محذوف.</p></div><div role="radiogroup" aria-label="طريقة الحذف" className="flex flex-col gap-2 text-sm"><label><input type="radio" name="strategy" data-testid="radio-taxonomy-transfer" checked={deleteStrategy === "transfer"} onChange={() => setDeleteStrategy("transfer")}/> نقل الفروع إلى قسم آخر وحذف هذا القسم فقط</label><label><input type="radio" name="strategy" data-testid="radio-taxonomy-cascade" checked={deleteStrategy === "cascade"} onChange={() => setDeleteStrategy("cascade")}/> حذف هذا القسم وفروعه مع إبقاء الأصناف</label></div></>}
        {modal.kind === "delete-item" && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">حذف «{modal.item.name}» نهائي. سيختفي من الدليل وتُزال روابطه بالأقسام والموردين وأي مراجعات قديمة مرتبطة به. عدد مورديه: <strong>{fmt(modal.item.supplierCount)}</strong>. لتصحيح اسم أو قسم، استخدم «تعديل الصنف» بدلاً من الحذف.</div>}
        {modal.kind === "mapping" && <div className="rounded-xl border bg-secondary/30 p-3 text-sm">التصنيف القديم: <strong>{modal.legacy.legacyName}</strong> · {fmt(modal.legacy.supplierCount)} مورد<br/>الصنف الجديد: <strong>{items.find(i => i.id === Number(destination))?.name ?? "غير محدد"}</strong><p className="mt-2 text-xs text-muted-foreground">تأكيد الربط لا ينقل الدليل العام تلقائياً.</p></div>}
        {modal.kind === "node" && !modal.node && <label><span className={label}>القسم الأب (اختياري للقسم الرئيسي)</span><select data-testid="select-taxonomy-parent" className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}><option value="">قسم رئيسي</option>{flat.filter(n => n.node.parentId === null).map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select></label>}
        {modal.kind === "item" && <>
          <label>
            <span className={label}>القسم الرئيسي (إلزامي)</span>
            <select
              data-testid="select-taxonomy-primary-category"
              className="taxonomy-field"
              required
              value={primaryCategory}
              onChange={event => {
                const nextPrimary = Number(event.target.value);
                setPrimaryCategory(event.target.value);
                setChosenCategories(current => current.filter(id => id !== nextPrimary));
              }}
            >
              <option value="">اختر القسم الرئيسي</option>
              {flat.map(({node, path}) => <option key={node.id} value={node.id}>{path}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2 rounded-xl border p-3">
            <legend className="px-2 text-sm font-extrabold">أقسام إضافية (اختياري)</legend>
            <p className="text-xs text-muted-foreground">يظهر الصنف في كل قسم تختاره، من دون إنشاء نسخة ثانية. القسم الرئيسي لا يُكرر هنا.</p>
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {flat.filter(({node}) => String(node.id) !== primaryCategory).map(({node, path}) =>
                <label key={node.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm">
                  <input
                    type="checkbox"
                    data-testid={`checkbox-taxonomy-additional-category-${node.id}`}
                    checked={chosenCategories.includes(node.id)}
                    onChange={event => setChosenCategories(current =>
                      event.target.checked ? [...current, node.id] : current.filter(id => id !== node.id))}
                  />
                  <span>{path}</span>
                </label>,
              )}
            </div>
          </fieldset>
        </>}
        {modal.kind === "move-item" && <p className="rounded-xl border bg-secondary/20 p-3 text-sm">سينتقل «{modal.item.name}» من «{modal.item.categoryPath}» إلى القسم المختار. تبقى روابط الموردين والأقسام الإضافية كما هي.</p>}
        {(modal.kind === "move-item" || modal.kind === "bulk" || (modal.kind === "delete-node" && (deleteStrategy === "transfer" || deletingPrimaryItems))) && <label><span className={label}>{modal.kind === "delete-node" ? "القسم الأساسي البديل (خارج الشجرة المحذوفة)" : modal.kind === "move-item" ? "القسم الجديد" : "القسم"}</span><select data-testid="select-taxonomy-destination" required className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}>{nodeOptions(modal.kind === "delete-node" ? modal.node.id : undefined)}</select></label>}
        {modal.kind === "move-node" && <label><span className={label}>القسم الأب الجديد</span><select data-testid="select-taxonomy-destination" className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}><option value="">جذر الشجرة</option>{modal.node.children.length === 0 && flat.filter(n => n.node.parentId === null && n.node.id !== modal.node.id).map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select></label>}
        {modal.kind === "delete-node" && deleteStrategy === "cascade" && <label className="flex gap-2 rounded-xl border border-destructive/25 p-3 text-sm"><input type="checkbox" data-testid="checkbox-confirm-legacy-links" checked={ackLinks} onChange={e => setAckLinks(e.target.checked)}/> أفهم أن روابط الموردين المباشرة بالأقسام المحذوفة ستُزال؛ لن تُحذف الأصناف أو روابط الموردين بالأصناف.</label>}
        {modal.kind === "delete-item" && modal.item.supplierCount > 0 && <label className="flex gap-2 rounded-xl border border-destructive/25 p-3 text-sm"><input type="checkbox" data-testid="checkbox-confirm-item-supplier-links" checked={ackLinks} onChange={e => setAckLinks(e.target.checked)}/> أفهم أن حذف هذا الصنف سيفقد الموردين ارتباطهم به، ولن تُنقل الروابط إلى صنف آخر تلقائياً.</label>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button type="button" data-testid="button-cancel-taxonomy" disabled={pending} className={btn} onClick={() => setModal(null)}>إلغاء</button><button type="submit" data-testid="button-submit-taxonomy" disabled={pending || (modal.kind === "legacy-import" && !importPreviewQuery.data?.readyToImportCount) || (modal.kind === "item" && (!primaryCategory || !!duplicateItem)) || (modal.kind === "delete-item" && modal.item.supplierCount > 0 && !ackLinks) || (modal.kind === "delete-node" && ((deleteStrategy === "cascade" && (!ackLinks || (deletingPrimaryItems && !destination))) || (deleteStrategy === "transfer" && !destination))) || (modal.kind === "mapping" && !destination) || (modal.kind === "bulk" && (!destination || !bulkText.trim())) || (modal.kind === "move-item" && !destination)} className={primary}>{pending ? "جارٍ الحفظ..." : modal.kind === "legacy-import" ? "تأكيد النقل" : modal.kind.startsWith("delete") ? "تأكيد الحذف" : modal.kind === "mapping" ? "تأكيد الربط" : "حفظ التغييرات"}</button></div>
      </form>
    </div></div>}
  </section>;
}

function Skeleton() { return <div aria-label="جارٍ التحميل" className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-16 animate-pulse rounded-xl bg-muted"/>)}</div>; }
function Failure({retry}:{retry:()=>void}) { return <Empty title="تعذّر تحميل البيانات" detail="تحقق من الاتصال ثم حاول مرة أخرى." action={<button type="button" data-testid="button-retry-taxonomy" className={primary} onClick={retry}>إعادة المحاولة</button>}/>; }
function Empty({title,detail,action}:{title:string;detail:string;action?:ReactNode}) { return <div className="taxonomy-surface flex flex-col items-center gap-2 p-10 text-center"><FolderTree size={28} className="text-primary"/><strong className="text-lg">{title}</strong><p className="text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-2">{action}</div>}</div>; }