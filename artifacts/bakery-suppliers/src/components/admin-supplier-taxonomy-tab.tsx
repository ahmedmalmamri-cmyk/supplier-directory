import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronLeft, Download, FileText, Folder, FolderOpen, FolderTree, History, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import {
  useGetAdminSupplierTaxonomyTree, getGetAdminSupplierTaxonomyTreeQueryKey,
  useCreateAdminSupplierTaxonomyNode, useUpdateAdminSupplierTaxonomyNode, useMoveAdminSupplierTaxonomyNode, useDeleteAdminSupplierTaxonomyNode, useReorderAdminSupplierTaxonomyNodes,
  useListAdminSupplierTaxonomyItems, getListAdminSupplierTaxonomyItemsQueryKey,
  useCreateAdminSupplierTaxonomyItem, useBulkCreateAdminSupplierTaxonomyItems, useUpdateAdminSupplierTaxonomyItem, useMoveAdminSupplierTaxonomyItem, useDeleteAdminSupplierTaxonomyItem,
  useListAdminSupplierTaxonomyLegacyReview, getListAdminSupplierTaxonomyLegacyReviewQueryKey, useApplyAdminSupplierTaxonomyLegacyMapping,
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
  | { kind: "mapping"; legacy: SupplierTaxonomyLegacyReview };
type Notice = { text: string; error: boolean } | null;
const fmt = (n: number) => n.toLocaleString("ar-SA");
const btn = "taxonomy-button";
const primary = "taxonomy-button taxonomy-button-primary";
const label = "block text-xs font-extrabold mb-1.5";
function message(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
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
  const treeQuery = useGetAdminSupplierTaxonomyTree();
  const itemsQuery = useListAdminSupplierTaxonomyItems();
  const reviewQuery = useListAdminSupplierTaxonomyLegacyReview();
  const auditQuery = useGetAdminSupplierTaxonomyAudit();
  const tree = treeQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const review = reviewQuery.data ?? [];
  const flat = useMemo(() => {
    const walk = (nodes: SupplierTaxonomyNode[], path = "", ancestors: number[] = []): { node: SupplierTaxonomyNode; path: string; ancestors: number[] }[] =>
      nodes.flatMap(node => [{ node, path: path ? `${path} / ${node.name}` : node.name, ancestors }, ...walk(node.children, path ? `${path} / ${node.name}` : node.name, [...ancestors, node.id])]);
    return walk(tree);
  }, [treeQuery.data]);
  const [view, setView] = useState<"tree" | "items" | "review" | "audit">("tree");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [destination, setDestination] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [deleteStrategy, setDeleteStrategy] = useState<"transfer" | "cascade">("transfer");
  const [ackLinks, setAckLinks] = useState(false);
  const [ackItems, setAckItems] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [onlyPending, setOnlyPending] = useState(true);
  const [mappingSelections, setMappingSelections] = useState<Record<number, string>>({});
  const [exporting, setExporting] = useState<"tree" | "items" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const results = await Promise.all([treeQuery.refetch(), itemsQuery.refetch(), reviewQuery.refetch(), auditQuery.refetch()]);
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
    void client.invalidateQueries({ queryKey: getGetAdminSupplierTaxonomyAuditQueryKey() });
    if (reviewChanged) void client.invalidateQueries({ queryKey: getListAdminSupplierTaxonomyLegacyReviewQueryKey() });
  };
  const failed = (error: unknown) => setNotice({ text: message(error), error: true });
  const createNode = useCreateAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("أُضيف القسم الجديد."), onError: failed } });
  const updateNode = useUpdateAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("حُفظت تغييرات القسم."), onError: failed } });
  const moveNode = useMoveAdminSupplierTaxonomyNode({ mutation: { onSuccess: () => changed("نُقل القسم مع أقسامه الفرعية."), onError: failed } });
  const deleteNode = useDeleteAdminSupplierTaxonomyNode({ mutation: { onSuccess: result => changed(`حُذف ${fmt(result.deletedNodeCount)} قسم؛ نُقل ${fmt(result.transferredItemCount)} صنف.`), onError: failed } });
  const reorder = useReorderAdminSupplierTaxonomyNodes({ mutation: { onSuccess: () => changed("حُفظ ترتيب الأقسام."), onError: failed } });
  const createItem = useCreateAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("أُضيف الصنف إلى القسم."), onError: failed } });
  const bulkCreate = useBulkCreateAdminSupplierTaxonomyItems({ mutation: { onSuccess: result => { setBulkText(""); changed(`أُضيف ${fmt(result.added)} صنف؛ تم تخطي ${fmt(result.skipped)} مكرر.`); }, onError: failed } });
  const updateItem = useUpdateAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("حُفظت تغييرات الصنف."), onError: failed } });
  const moveItem = useMoveAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("نُقل الصنف إلى القسم الجديد."), onError: failed } });
  const deleteItem = useDeleteAdminSupplierTaxonomyItem({ mutation: { onSuccess: () => changed("حُذف الصنف."), onError: failed } });
  const applyMapping = useApplyAdminSupplierTaxonomyLegacyMapping({ mutation: { onSuccess: () => changed("حُفظ الربط بعد المراجعة. لم يتحول الدليل العام إلى التصنيف الجديد.", true), onError: failed } });
  const pending = [createNode, updateNode, moveNode, deleteNode, reorder, createItem, bulkCreate, updateItem, moveItem, deleteItem, applyMapping].some(m => m.isPending);
  const openNode = (node?: SupplierTaxonomyNode, parentId?: number) => { setNotice(null); setName(node?.name ?? ""); setIcon(node?.icon ?? ""); setDescription(node?.description ?? ""); setActive(node?.isActive ?? true); setDestination(String(parentId ?? node?.parentId ?? "")); setModal({ kind: "node", node, parentId }); };
  const openItem = (item?: SupplierTaxonomyItem) => { setNotice(null); setName(item?.name ?? ""); setNotes(item?.notes ?? ""); setActive(item?.isActive ?? true); setDestination(String(item?.categoryId ?? selectedId ?? "")); setModal({ kind: "item", item }); };
  const openMove = (m: Modal) => { setNotice(null); setDestination(""); setModal(m); };
  const openDelete = (m: Modal) => { setNotice(null); setDeleteStrategy("transfer"); setDestination(""); setAckLinks(false); setAckItems(false); setModal(m); };
  const exportCsv = async (kind: "tree" | "items") => {
    setExporting(kind); setNotice(null);
    try { download(await (kind === "tree" ? exportAdminSupplierTaxonomyCsv({ responseType: "text" }) : exportAdminSupplierTaxonomyItemsCsv({ responseType: "text" })), kind === "tree" ? "supplier-taxonomy.csv" : "supplier-taxonomy-items.csv"); setNotice({ text: "تم تجهيز ملف CSV للتنزيل.", error: false }); }
    catch (error) { failed(error); } finally { setExporting(null); }
  };
  const filtered = items.filter(item =>
    (!search.trim() || `${item.name} ${item.categoryPath} ${item.notes ?? ""}`.toLocaleLowerCase("ar").includes(search.trim().toLocaleLowerCase("ar"))) &&
    (filterStatus === "all" || item.isActive === (filterStatus === "active")) &&
    (filterCategory === "all" || item.categoryId === Number(filterCategory) || flat.find(n => n.node.id === item.categoryId)?.ancestors.includes(Number(filterCategory)))
  );
  const selected = flat.find(n => n.node.id === selectedId);
  const pendingReview = review.filter(row => row.mappedItemId === null).length;
  const renderBranch = (nodes: SupplierTaxonomyNode[], depth = 0): ReactNode => nodes.map((node, index) => {
    const open = expanded.has(node.id);
    const siblings = nodes.map(n => n.id);
    const order = (direction: -1 | 1) => { const ids = [...siblings]; [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]; reorder.mutate({ data: { parentId: node.parentId, orderedIds: ids } }); };
    return <div key={node.id} className={depth ? "taxonomy-tree-line" : ""}>
      <div data-testid={`row-taxonomy-node-${node.id}`} className={`group my-1.5 flex flex-col gap-2 rounded-xl border p-2.5 sm:flex-row sm:items-center ${selectedId === node.id ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-secondary/25"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" data-testid={`button-expand-taxonomy-${node.id}`} disabled={!node.children.length} aria-label={open ? `طي ${node.name}` : `توسيع ${node.name}`} aria-expanded={open} onClick={() => setExpanded(current => { const next = new Set(current); if (open) next.delete(node.id); else next.add(node.id); return next; })} className="rounded-md p-1 disabled:opacity-30">{open ? <ChevronDown size={16}/> : <ChevronLeft size={16}/>}</button>
          <button type="button" data-testid={`button-select-taxonomy-${node.id}`} onClick={() => { setSelectedId(node.id); setFilterCategory(String(node.id)); setView("items"); }} className="flex min-w-0 flex-1 items-center gap-2 text-right">
            {open ? <FolderOpen size={20} className="shrink-0 text-primary"/> : <Folder size={20} className="shrink-0 text-primary"/>}
            <span className="min-w-0 truncate font-extrabold">{node.name}</span>
            {!node.isActive && <span className="rounded-full bg-muted px-2 text-[10px]">معطل</span>}
            <span className="shrink-0 text-xs text-muted-foreground">{fmt(node.itemCount)} صنف</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1 ps-7 sm:ps-0">
          <button className={btn} type="button" data-testid={`button-add-child-${node.id}`} onClick={() => { setExpanded(current => new Set(current).add(node.id)); openNode(undefined, node.id); }}><Plus size={14}/>فرعي</button>
          <button className={btn} type="button" data-testid={`button-edit-node-${node.id}`} onClick={() => openNode(node)}><Pencil size={14}/>تعديل</button>
          <button className={btn} type="button" data-testid={`button-move-node-${node.id}`} onClick={() => openMove({ kind: "move-node", node })}>نقل</button>
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
    if (modal.kind === "item") { if (!clean || !destination) return; const data = { name: clean, notes: notes.trim() || null, isActive: active, categoryId: Number(destination) }; modal.item ? updateItem.mutate({ id: modal.item.id, data }) : createItem.mutate({ data }); }
    if (modal.kind === "move-node") moveNode.mutate({ id: modal.node.id, data: { parentId: destination ? Number(destination) : null } });
    if (modal.kind === "move-item" && destination) moveItem.mutate({ id: modal.item.id, data: { categoryId: Number(destination) } });
    if (modal.kind === "delete-node") deleteNode.mutate({ id: modal.node.id, data: { strategy: deleteStrategy, confirmed: true, ...(deleteStrategy === "cascade" ? { confirmItems: ackItems, confirmLegacySupplierLinks: ackLinks } : { transferToNodeId: Number(destination) }) } });
    if (modal.kind === "delete-item") deleteItem.mutate({ id: modal.item.id, data: { confirmed: true } });
    if (modal.kind === "bulk" && destination) { const names = bulkText.split(/\r?\n/).map(s => s.trim()).filter(Boolean); if (names.length && names.length <= 1000 && names.every(n => n.length <= 120)) bulkCreate.mutate({ data: { items: names.map(n => ({ name: n, categoryId: Number(destination) })) } }); else failed(new Error("أدخل من ١ إلى ١٠٠٠ اسم، بحد أقصى ١٢٠ حرفاً لكل اسم.")); }
    if (modal.kind === "mapping" && destination) {
      if (review.find(row => row.legacyId === modal.legacy.legacyId)?.mappedItemId != null) { setModal(null); failed(new Error("سبق تأكيد هذا الربط؛ لا يمكن تغييره.")); return; }
      applyMapping.mutate({ legacyId: modal.legacy.legacyId, data: { itemId: Number(destination), confirmed: true } });
    }
  };
  const nodeOptions = (excludeId?: number) => <><option value="">اختر القسم</option>{flat.filter(n => n.node.id !== excludeId && !n.ancestors.includes(excludeId ?? -1)).map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</>;
  return <section dir="rtl" className="taxonomy-workbench space-y-5" aria-label="شجرة تصنيفات الموردين الجديدة">
    <header className="taxonomy-surface overflow-hidden">
      <div className="flex flex-col justify-between gap-5 bg-secondary/35 p-5 md:flex-row md:items-end md:p-7">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary"><FolderTree size={17}/> إدارة الفهرس / الهيكل الجديد</div><h2 className="text-2xl font-extrabold md:text-3xl">الأقسام والأصناف، في مكانها الصحيح.</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">ابنِ شجرة أقسام بأي عمق، ثم ضع كل صنف في قسمه. راجع ربط التصنيفات القديمة بالموردين قبل أي انتقال للدليل العام.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" data-testid="button-refresh-taxonomy" disabled={refreshing} className={btn} onClick={() => void refresh()}><RefreshCw size={15}/>{refreshing ? "جارٍ التحديث..." : "تحديث"}</button><button type="button" data-testid="button-export-taxonomy" disabled={!!exporting} className={btn} onClick={() => void exportCsv("tree")}><Download size={15}/> CSV الأقسام</button><button type="button" data-testid="button-export-taxonomy-items" disabled={!!exporting} className={btn} onClick={() => void exportCsv("items")}><Download size={15}/> CSV الأصناف</button></div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">{[["الأقسام", flat.length], ["الأصناف", items.length], ["روابط الموردين بالأصناف", items.reduce((sum,item) => sum + item.supplierCount,0)], ["بانتظار مراجعة الربط", pendingReview]].map(([title,value]) => <div key={title} className="bg-card p-4"><p className="text-xs text-muted-foreground">{title}</p><strong className="text-2xl" data-testid={`metric-taxonomy-${title}`}>{fmt(Number(value))}</strong></div>)}</div>
    </header>
    <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4 text-sm"><AlertTriangle size={19} className="mt-1 shrink-0 text-warning"/><p><strong>مساحة إعداد ومراجعة.</strong> إنشاء الأقسام وربط العناصر القديمة هنا لا يعني أن الدليل العام انتقل تلقائياً إلى التصنيف الجديد. راجع الروابط الحالية قبل أي حذف.</p></div>
    {notice && <div role={notice.error ? "alert" : "status"} data-testid="status-taxonomy-action" className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${notice.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/25 bg-success/5 text-foreground"}`}><span>{notice.text}</span><button type="button" data-testid="button-dismiss-taxonomy-notice" aria-label="إغلاق الإشعار" onClick={() => setNotice(null)} className="ms-auto"><X size={16}/></button></div>}
    <div role="tablist" aria-label="أقسام إدارة الهيكل" className="flex flex-wrap gap-2 border-b pb-3">
      {([["tree","شجرة الأقسام",FolderTree],["items","الأصناف",FileText],["review",`مراجعة القديم (${fmt(pendingReview)})`,AlertTriangle],["audit","سجل النشاط",History]] as const).map(([id,title,Icon]) => <button key={id} type="button" role="tab" aria-selected={view === id} data-testid={`button-taxonomy-view-${id}`} onClick={() => setView(id)} className={view === id ? primary : btn}><Icon size={16}/>{title}</button>)}
    </div>
    {view === "tree" && <div className="taxonomy-surface p-4 md:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-extrabold">شجرة الأقسام</h3><p className="text-xs text-muted-foreground">افتح القسم لعرض فروعه. الأسهم تغيّر ترتيبه بين إخوته فقط.</p></div><button type="button" data-testid="button-create-root-taxonomy" className={primary} onClick={() => openNode()}><Plus size={16}/> قسم رئيسي</button></div>
      {treeQuery.isLoading ? <Skeleton/> : treeQuery.isError ? <Failure retry={() => void treeQuery.refetch()}/> : !tree.length ? <Empty title="الشجرة جاهزة للبناء" detail="أضف قسماً رئيسياً، ثم أنشئ تحته أقساماً فرعية بالعمق المناسب." action={<button type="button" className={primary} onClick={() => openNode()}>إضافة القسم الأول</button>}/> : renderBranch([...tree].sort((a,b) => a.displayOrder - b.displayOrder || a.id - b.id))}
    </div>}
    {view === "items" && <div className="space-y-4"><div className="taxonomy-surface p-4 md:p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h3 className="text-lg font-extrabold">قائمة الأصناف</h3><p className="text-xs text-muted-foreground">{selected ? `القسم المحدد: ${selected.path}` : "ابحث وراجع المسار وحالة كل صنف وروابط مورديه."}</p></div><div className="flex flex-wrap gap-2"><button type="button" data-testid="button-bulk-taxonomy-items" className={btn} onClick={() => { setDestination(String(selectedId ?? "")); setBulkText(""); setModal({kind:"bulk"}); }}><Plus size={15}/> إضافة قائمة</button><button type="button" data-testid="button-create-taxonomy-item" className={primary} onClick={() => openItem()}><Plus size={15}/> صنف جديد</button></div></div>
      <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)_minmax(9rem,11rem)]"><label className="relative"><span className="sr-only">بحث الأصناف</span><Search size={16} className="absolute right-3 top-3.5 text-muted-foreground"/><input data-testid="input-taxonomy-search" className="taxonomy-field pr-10" placeholder="ابحث باسم الصنف أو المسار أو الملاحظات" value={search} onChange={e => setSearch(e.target.value)}/></label><select data-testid="select-taxonomy-category-filter" aria-label="تصفية حسب القسم" className="taxonomy-field" value={filterCategory} onChange={e => {setFilterCategory(e.target.value);setSelectedId(e.target.value === "all" ? null : Number(e.target.value));}}><option value="all">كل الأقسام</option>{flat.map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select><select data-testid="select-taxonomy-status-filter" aria-label="تصفية حسب الحالة" className="taxonomy-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">كل الحالات</option><option value="active">نشط</option><option value="inactive">معطّل</option></select></div></div>
      {itemsQuery.isLoading || treeQuery.isLoading ? <Skeleton/> : itemsQuery.isError || treeQuery.isError ? <Failure retry={() => void refresh()}/> : !filtered.length ? <Empty title="لا توجد أصناف مطابقة" detail={items.length ? "غيّر البحث أو المرشحات لعرض أصناف أخرى." : "أضف صنفاً إلى أحد أقسام الشجرة للبدء."} action={flat.length ? <button type="button" className={primary} onClick={() => openItem()}>إضافة صنف</button> : undefined}/> : <div className="taxonomy-surface overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-secondary/30 text-xs"><tr><th className="p-4">الصنف</th><th className="p-4">مسار القسم</th><th className="p-4">الموردون</th><th className="p-4">الحالة</th><th className="p-4">الإجراءات</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} data-testid={`row-taxonomy-item-${item.id}`} className="border-t hover:bg-secondary/15"><td className="p-4"><div className="flex items-center gap-2 font-extrabold"><FileText size={16} className="text-primary"/>{item.name}</div>{item.notes && <p className="mt-1 max-w-44 truncate text-xs text-muted-foreground" title={item.notes}>{item.notes}</p>}</td><td className="p-4 text-muted-foreground">{item.categoryPath}</td><td className="p-4">{fmt(item.supplierCount)}</td><td className="p-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "نشط" : "معطل"}</span></td><td className="p-4"><div className="flex flex-wrap gap-1"><button type="button" data-testid={`button-edit-taxonomy-item-${item.id}`} className={btn} onClick={() => openItem(item)}>تعديل</button><button type="button" data-testid={`button-toggle-taxonomy-item-${item.id}`} disabled={pending} className={btn} onClick={() => updateItem.mutate({id:item.id,data:{isActive:!item.isActive}})}>{item.isActive ? "تعطيل" : "تفعيل"}</button><button type="button" data-testid={`button-move-taxonomy-item-${item.id}`} className={btn} onClick={() => openMove({kind:"move-item",item})}>نقل</button><button type="button" data-testid={`button-delete-taxonomy-item-${item.id}`} className={`${btn} text-destructive`} onClick={() => openDelete({kind:"delete-item",item})}>حذف</button></div></td></tr>)}</tbody></table></div>}<p data-testid="text-taxonomy-result-count" className="text-xs text-muted-foreground">{fmt(filtered.length)} من {fmt(items.length)} صنف</p>
    </div>}
    {view === "review" && <div className="taxonomy-surface p-4 md:p-6"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="text-lg font-extrabold">مراجعة ربط الأصناف القديمة</h3><p className="mt-1 text-sm text-muted-foreground">اختر صنفاً جديداً لكل تصنيف قديم ثم أكّد الربط بنفسك. عدد الموردين يعرض الروابط الموجودة لا روابط جديدة.</p></div><label className="flex items-center gap-2 text-sm"><input data-testid="checkbox-only-pending-review" type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)}/> المعلّقة فقط</label></div>
      {reviewQuery.isLoading || itemsQuery.isLoading ? <Skeleton/> : reviewQuery.isError || itemsQuery.isError ? <Failure retry={() => void refresh()}/> : !review.length ? <Empty title="لا توجد تصنيفات قديمة للمراجعة" detail="ستظهر هنا سجلات الربط عندما تتوفر بياناتها."/> : <div className="space-y-2">
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
      {auditQuery.isLoading ? <Skeleton/> : auditQuery.isError ? <Failure retry={() => void auditQuery.refetch()}/> : !auditQuery.data?.length ? <Empty title="لم يُسجّل نشاط بعد" detail="ستظهر تغييرات التصنيفات هنا بعد تنفيذها."/> : <ol className="divide-y">
        {[...auditQuery.data].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(entry => <li key={entry.id} data-testid={`row-taxonomy-audit-${entry.id}`} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><History size={16}/></span><div><strong data-testid={`text-taxonomy-audit-action-${entry.id}`} className="text-sm">{auditAction(entry.action)} · {auditEntity(entry.entityType)}{entry.entityId !== null ? ` رقم ${fmt(entry.entityId)}` : ""}</strong><p data-testid={`text-taxonomy-audit-actor-${entry.id}`} className="text-xs text-muted-foreground">بواسطة {entry.adminId === null ? "مدير غير محدد" : `المدير رقم ${fmt(entry.adminId)}`}</p></div></div>
          <time data-testid={`text-taxonomy-audit-date-${entry.id}`} dateTime={entry.createdAt} className="ps-11 text-xs text-muted-foreground sm:ps-0">{Number.isNaN(Date.parse(entry.createdAt)) ? "تاريخ غير متاح" : new Date(entry.createdAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time>
        </li>)}
      </ol>}
    </div>}
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-3" onMouseDown={e => { if (e.target === e.currentTarget && !pending) setModal(null); }}><div role="dialog" aria-modal="true" aria-labelledby="taxonomy-dialog-title" className="taxonomy-surface max-h-[90dvh] w-full max-w-lg overflow-y-auto p-5 shadow-warm-lg md:p-7"><div className="mb-5 flex items-start justify-between gap-2"><div><h3 id="taxonomy-dialog-title" className="text-xl font-extrabold">{modal.kind === "node" ? modal.node ? "تعديل القسم" : "إضافة قسم" : modal.kind === "item" ? modal.item ? "تعديل الصنف" : "إضافة صنف" : modal.kind === "bulk" ? "إضافة أصناف دفعة واحدة" : modal.kind === "mapping" ? "تأكيد ربط التصنيف القديم" : modal.kind.startsWith("delete") ? "تأكيد الحذف" : "نقل إلى مكان جديد"}</h3><p className="mt-1 text-xs text-muted-foreground">احفظ التغييرات بعد التحقق من القسم والروابط المرتبطة به.</p></div><button type="button" data-testid="button-close-taxonomy-dialog" aria-label="إغلاق" disabled={pending} onClick={() => setModal(null)}><X size={20}/></button></div>
      <form onSubmit={submit} className="space-y-4">
        {notice?.error && <p role="alert" data-testid="status-taxonomy-dialog-error" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{notice.text}</p>}
        {(modal.kind === "node" || modal.kind === "item") && <><label><span className={label}>الاسم</span><input data-testid="input-taxonomy-name" autoFocus className="taxonomy-field" required maxLength={modal.kind === "node" ? 100 : 120} value={name} onChange={e => setName(e.target.value)}/></label>{modal.kind === "node" ? <><label><span className={label}>رمز القسم (اختياري)</span><input data-testid="input-taxonomy-icon" className="taxonomy-field" maxLength={24} value={icon} onChange={e => setIcon(e.target.value)} placeholder="رمز قصير"/></label><label><span className={label}>الوصف</span><textarea data-testid="input-taxonomy-description" className="taxonomy-field min-h-20" maxLength={500} value={description} onChange={e => setDescription(e.target.value)}/></label></> : <label><span className={label}>ملاحظات داخلية</span><textarea data-testid="input-taxonomy-notes" className="taxonomy-field min-h-20" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)}/></label>}<label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" data-testid="checkbox-taxonomy-active" checked={active} onChange={e => setActive(e.target.checked)}/> نشط</label></>}
        {modal.kind === "bulk" && <label><span className={label}>اسم واحد في كل سطر (حتى ١٠٠٠ صنف)</span><textarea data-testid="textarea-taxonomy-bulk" className="taxonomy-field min-h-44" value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"اكتب اسم الصنف الأول\nواسم الصنف الثاني"}/><span className="text-xs text-muted-foreground">{fmt(bulkText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).length)} اسم مُدخل</span></label>}
        {modal.kind === "delete-node" && <><div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"><strong>حذف «{modal.node.name}»</strong><p>هذا القسم يتضمن {fmt(modal.node.itemCount)} صنف بحسب البيانات الحالية. قد تضم فروعه أصنافاً وروابط موردين أيضاً. النقل يحافظ على الأصناف؛ الحذف المتسلسل قد يزيلها وروابطها.</p></div><div role="radiogroup" aria-label="طريقة الحذف" className="flex flex-col gap-2 text-sm"><label><input type="radio" name="strategy" data-testid="radio-taxonomy-transfer" checked={deleteStrategy === "transfer"} onChange={() => setDeleteStrategy("transfer")}/> نقل الأصناف ثم حذف القسم وفروعه</label><label><input type="radio" name="strategy" data-testid="radio-taxonomy-cascade" checked={deleteStrategy === "cascade"} onChange={() => setDeleteStrategy("cascade")}/> حذف متسلسل للأقسام والأصناف</label></div></>}
        {modal.kind === "delete-item" && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">سيُحذف الصنف «{modal.item.name}». عدد الموردين المرتبطين به: <strong>{fmt(modal.item.supplierCount)}</strong>. تأكد من مراجعة الروابط قبل المتابعة.</div>}
        {modal.kind === "mapping" && <div className="rounded-xl border bg-secondary/30 p-3 text-sm">التصنيف القديم: <strong>{modal.legacy.legacyName}</strong> · {fmt(modal.legacy.supplierCount)} مورد<br/>الصنف الجديد: <strong>{items.find(i => i.id === Number(destination))?.name ?? "غير محدد"}</strong><p className="mt-2 text-xs text-muted-foreground">تأكيد الربط لا ينقل الدليل العام تلقائياً.</p></div>}
        {modal.kind === "node" && !modal.node && <label><span className={label}>القسم الأب (اختياري للقسم الرئيسي)</span><select data-testid="select-taxonomy-parent" className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}><option value="">قسم رئيسي</option>{flat.map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select></label>}
        {(modal.kind === "item" || modal.kind === "move-item" || modal.kind === "bulk" || (modal.kind === "delete-node" && deleteStrategy === "transfer")) && <label><span className={label}>{modal.kind === "delete-node" ? "القسم المستقبِل للأصناف" : "القسم"}</span><select data-testid="select-taxonomy-destination" required className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}>{nodeOptions(modal.kind === "delete-node" ? modal.node.id : undefined)}</select></label>}
        {modal.kind === "move-node" && <label><span className={label}>القسم الأب الجديد</span><select data-testid="select-taxonomy-destination" className="taxonomy-field" value={destination} onChange={e => setDestination(e.target.value)}><option value="">جذر الشجرة</option>{flat.filter(n => n.node.id !== modal.node.id && !n.ancestors.includes(modal.node.id)).map(n => <option key={n.node.id} value={n.node.id}>{n.path}</option>)}</select></label>}
        {modal.kind === "delete-node" && deleteStrategy === "cascade" && <div className="space-y-2 rounded-xl border border-destructive/25 p-3 text-sm"><label className="flex gap-2"><input type="checkbox" data-testid="checkbox-confirm-delete-items" checked={ackItems} onChange={e => setAckItems(e.target.checked)}/> أؤكد حذف الأصناف الموجودة ضمن هذا القسم وفروعه.</label><label className="flex gap-2"><input type="checkbox" data-testid="checkbox-confirm-legacy-links" checked={ackLinks} onChange={e => setAckLinks(e.target.checked)}/> راجعت أثر ذلك على روابط الموردين القديمة وأوافق.</label></div>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><button type="button" data-testid="button-cancel-taxonomy" disabled={pending} className={btn} onClick={() => setModal(null)}>إلغاء</button><button type="submit" data-testid="button-submit-taxonomy" disabled={pending || (modal.kind === "delete-node" && ((deleteStrategy === "cascade" && (!ackItems || !ackLinks)) || (deleteStrategy === "transfer" && !destination))) || (modal.kind === "mapping" && !destination) || (modal.kind === "bulk" && (!destination || !bulkText.trim())) || (modal.kind === "move-item" && !destination)} className={primary}>{pending ? "جارٍ الحفظ..." : modal.kind.startsWith("delete") ? "تأكيد الحذف" : modal.kind === "mapping" ? "تأكيد الربط" : "حفظ التغييرات"}</button></div>
      </form>
    </div></div>}
  </section>;
}

function Skeleton() { return <div aria-label="جارٍ التحميل" className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-16 animate-pulse rounded-xl bg-muted"/>)}</div>; }
function Failure({retry}:{retry:()=>void}) { return <Empty title="تعذّر تحميل البيانات" detail="تحقق من الاتصال ثم حاول مرة أخرى." action={<button type="button" data-testid="button-retry-taxonomy" className={primary} onClick={retry}>إعادة المحاولة</button>}/>; }
function Empty({title,detail,action}:{title:string;detail:string;action?:ReactNode}) { return <div className="taxonomy-surface flex flex-col items-center gap-2 p-10 text-center"><FolderTree size={28} className="text-primary"/><strong className="text-lg">{title}</strong><p className="text-sm text-muted-foreground">{detail}</p>{action && <div className="mt-2">{action}</div>}</div>; }