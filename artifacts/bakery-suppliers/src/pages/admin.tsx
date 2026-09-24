import { MainLayout } from "@/components/layout/MainLayout";
import { SupplierInvitationsPanel } from "@/pages/supplier-invitations";
import { BuyerInvitationsPanel } from "@/pages/buyer-invitations";
import { getGetSupplierInvitationStatsQueryKey, getListSupplierInvitationsQueryKey, useAdminLogin, useAdminLogout, useGenerateSupplierInvitation, useMarkSupplierInvitationSent } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileText, Flag, GripVertical, ImagePlus, LayoutDashboard, LogIn, LogOut, MessageCircle, Package, Plus, Send, Settings, ShieldCheck, ShoppingCart, Store, Trash2, TrendingUp, UserRound, XCircle } from "lucide-react";

type Tab = "suppliers" | "buyers" | "moderation" | "contacts" | "directory" | "invitations" | "buyer-invitations" | "stats" | "settings";
type SupplierRequest = {
  id: number; requestCode: string; businessName: string; contactPerson: string; businessType: string;
  phone: string; whatsapp: string; email: string | null; website: string | null; city: string; address: string | null;
  deliversToOtherCities: boolean; otherCities: string | null; categories: string[]; minOrder: string | null; description: string;
  commercialLicenseUrl: string | null; idCardUrl: string | null; healthCertificateUrl: string | null;
  status: "pending" | "pending_review" | "approved" | "rejected"; rejectionReason: string | null; adminNote: string | null;
  invitedSupplierId: number | null; productImages: string[];
  createdAt: string; reviewedAt: string | null;
};
type BuyerRequest = { id: number; requestCode: string; fullName: string; phone: string; email: string | null; city: string; businessType: string; otherBusinessType: string | null; businessName: string | null; referralSource: string | null; newsletterWeekly: boolean; buyersGroup: boolean; createdAt: string };
type Supplier = { id: number; name: string; city: string; region: string; description: string; phone: string; whatsapp: string; address: string | null; website: string | null; googleCategory: string | null; googleRating: number | null; googleReviewCount: number | null; hoursNote: string | null; isVerified: boolean; isActive: boolean; averageRating: number; productCount: number; planId: number; planName: string | null; maxProductsAllowed: number; isFeatured: boolean };
type BuyerReport = { id: number; contactLogId: number; buyerId: number; supplierId: number; reason: string; note: string | null; status: "open" | "reviewed" | "dismissed" | "actioned"; adminNote: string | null; createdAt: string; reviewedAt: string | null; buyerName: string; buyerPhone: string; businessName: string | null; buyerCity: string; buyerStatus: BuyerStatus; supplierName: string; messageId: string; contactedAt: string };
type BuyerStatus = "active" | "under_review" | "restricted" | "suspended" | "blocked";
type BuyerModerationUser = { id: number; fullName: string; phone: string; email: string | null; city: string; businessType: string; otherBusinessType: string | null; businessName: string | null; moderationStatus: BuyerStatus; moderationReason: string | null; moderationUpdatedAt: string | null; createdAt: string; reportCount: number };
type ContactLog = { id: number; messageId: string; buyerName: string; businessType: string; supplierName: string; sentAt: string };
type AdminProduct = { id: number; name: string; imageUrl: string | null; sortOrder: number };
type Stats = { pendingSupplierRequests: number; approvedSuppliers: number; buyers: number; products: number; cities: number; totalPageViews: number; totalContacts: number; pageViews30d: number; qualifiedContacts30d: number; contactRate30d: number };
type Plan = { id: number; name: string; slug: string; priceMonthly: number; maxProducts: number; maxImagesPerProduct: number; hasVerifiedBadge: boolean; hasFeaturedListing: boolean; hasBanner: boolean; hasAnalytics: boolean; hasPrioritySupport: boolean; description: string; isActive: boolean; displayOrder: number };
type Settings = { whatsapp: string; email: string; address: string; cities: string[]; categories: { id: number; name: string }[]; plans: Plan[] };

const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "suppliers", label: "طلبات الموردين", icon: Store },
  { id: "buyers", label: "طلبات أصحاب الأعمال", icon: ShoppingCart },
  { id: "moderation", label: "بلاغات أصحاب الأعمال", icon: Flag },
  { id: "contacts", label: "سجل التواصل", icon: MessageCircle },
  { id: "directory", label: "الموردون المعتمدون", icon: CheckCircle2 },
  { id: "invitations", label: "دعوات الموردين", icon: Send },
  { id: "buyer-invitations", label: "دعوات أصحاب الأعمال", icon: UserRound },
  { id: "stats", label: "الإحصائيات", icon: LayoutDashboard },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("suppliers");
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>([]);
  const [buyerRequests, setBuyerRequests] = useState<BuyerRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [buyerReports, setBuyerReports] = useState<BuyerReport[]>([]);
  const [contactLogs, setContactLogs] = useState<ContactLog[]>([]);
  const [moderationUsers, setModerationUsers] = useState<BuyerModerationUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<SupplierRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const login = useAdminLogin({
    mutation: {
      onSuccess: () => setIsAuthenticated(true),
    },
  });
  const logout = useAdminLogout({
    mutation: {
      onSuccess: () => setIsAuthenticated(false),
    },
  });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [requests, buyers, directory, moderation, users, contacts, dashboardStats, directorySettings] = await Promise.all([
        adminFetch<SupplierRequest[]>("/api/admin/supplier-requests"),
        adminFetch<BuyerRequest[]>("/api/admin/buyer-requests"),
        adminFetch<Supplier[]>("/api/admin/suppliers"),
        adminFetch<BuyerReport[]>("/api/admin/buyer-reports"),
        adminFetch<BuyerModerationUser[]>("/api/admin/buyer-users"),
        adminFetch<ContactLog[]>("/api/admin/contact-logs"),
        adminFetch<Stats>("/api/admin/stats"),
        adminFetch<Settings>("/api/admin/settings"),
      ]);
      setSupplierRequests(requests);
      setBuyerRequests(buyers);
      setSuppliers(directory);
      setBuyerReports(moderation);
      setModerationUsers(users);
      setContactLogs(contacts);
      setStats(dashboardStats);
      setSettings(directorySettings);
      setSelectedRequest((current) => current ? requests.find((item) => item.id === current.id) ?? null : null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "تعذر تحميل بيانات اللوحة.");
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAuthenticated) void refresh(); }, [isAuthenticated]);

  const act = async (path: string, init?: RequestInit, successMessage?: string): Promise<boolean> => {
    try {
      await adminFetch(path, init);
      setNotice(successMessage || "تم تنفيذ العملية.");
      await refresh();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "تعذر تنفيذ العملية.");
      return false;
    }
  };

  if (!isAuthenticated) {
    return <AdminShell><LoginCard login={login} /></AdminShell>;
  }

  return (
    <AdminShell>
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-60 shrink-0">
          <div className="bg-card border rounded-2xl p-3 lg:sticky lg:top-24">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button data-testid={`button-admin-tab-${id}`} key={id} type="button" onClick={() => setTab(id)} className={`w-full flex items-center gap-3 text-right px-3 py-3 rounded-xl text-sm font-bold transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                <Icon className="w-4 h-4" />{label}
                {id === "suppliers" && (stats?.pendingSupplierRequests ?? 0) > 0 && <span className="mr-auto rounded-full bg-amber-200 text-amber-900 text-[11px] px-2 py-0.5">{stats?.pendingSupplierRequests}</span>}
              </button>
            ))}
            <button type="button" onClick={() => logout.mutate()} className="w-full flex items-center gap-3 text-right px-3 py-3 rounded-xl text-sm font-bold text-red-700 hover:bg-red-50 mt-3 border-t pt-4"><LogOut className="w-4 h-4" /> تسجيل الخروج</button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div><h2 className="text-2xl font-bold">{tabs.find((item) => item.id === tab)?.label}</h2><p className="text-sm text-muted-foreground mt-1">إدارة دليل موردي المخابز والحلويات</p></div>
            <button type="button" onClick={() => void refresh()} className="text-sm text-primary font-bold hover:underline">{loading ? "جاري التحديث..." : "تحديث البيانات"}</button>
          </div>
          {notice && <div className="mb-5 rounded-xl bg-green-50 border border-green-200 text-green-800 p-3 text-sm">{notice}</div>}
          {error && <div className="mb-5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive p-3 text-sm">{error}</div>}
          {tab === "suppliers" && <SupplierRequestsTab requests={supplierRequests} selected={selectedRequest} onSelect={setSelectedRequest} onAction={act} />}
          {tab === "buyers" && <BuyerRequestsTab requests={buyerRequests} onDelete={(id) => void act(`/api/admin/buyer-requests/${id}`, { method: "DELETE" }, "تم حذف طلب صاحب العمل.")} />}
          {tab === "moderation" && <BuyerModerationTab reports={buyerReports} users={moderationUsers} onAction={act} />}
          {tab === "contacts" && <ContactLogsTab logs={contactLogs} />}
          {tab === "directory" && <DirectoryTab suppliers={suppliers} settings={settings} onAction={act} />}
           {tab === "invitations" && <SupplierInvitationsPanel />}
            {tab === "buyer-invitations" && <BuyerInvitationsPanel />}
          {tab === "stats" && <StatsTab stats={stats} />}
           {tab === "settings" && <SettingsTab settings={settings} suppliers={suppliers} onAction={act} />}
        </main>
      </div>
    </AdminShell>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <MainLayout><div className="bg-secondary/10 py-10 border-b"><div className="container mx-auto px-4"><div className="flex items-center gap-2 text-primary mb-2"><ShieldCheck className="w-5 h-5" /><span className="font-bold text-sm">مساحة خاصة بالمدير</span></div><h1 className="text-3xl md:text-4xl font-bold">لوحة التحكم الإدارية</h1><p className="text-muted-foreground mt-2">مراجعة الطلبات قبل نشر الموردين في الدليل.</p></div></div><div className="container mx-auto px-4 py-10 max-w-7xl">{children}</div></MainLayout>;
}

function LoginCard({ login }: { login: ReturnType<typeof useAdminLogin> }) {
  const [password, setPassword] = useState("");
  return <div className="max-w-md mx-auto bg-card border rounded-3xl p-6 md:p-8 shadow-sm"><div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5"><ShieldCheck className="w-7 h-7" /></div><h2 className="text-2xl font-bold mb-2">دخول المدير</h2><p className="text-sm text-muted-foreground mb-6">أدخل كلمة المرور لعرض وإدارة جميع الطلبات.</p><form onSubmit={(event) => { event.preventDefault(); login.mutate({ data: { password } }); }} className="space-y-4"><input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" className="hidden" /><label className="block"><span className="text-sm font-bold block mb-2">كلمة المرور</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary" /></label><button type="submit" disabled={login.isPending || !password} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2"><LogIn className="w-4 h-4" />{login.isPending ? "جاري التحقق..." : "دخول"}</button>{login.isError && <p className="text-sm text-destructive text-center">كلمة المرور غير صحيحة.</p>}</form></div>;
}

function SupplierRequestsTab({ requests, selected, onSelect, onAction }: { requests: SupplierRequest[]; selected: SupplierRequest | null; onSelect: (item: SupplierRequest | null) => void; onAction: (path: string, init?: RequestInit, message?: string) => Promise<boolean> }) {
  const [rejectReason, setRejectReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-5">
      {requests.length === 0 ? <Empty title="لا توجد طلبات موردين" description="ستظهر طلبات التسجيل الجديدة هنا." /> : requests.map((request) => {
        const pending = request.status === "pending" || request.status === "pending_review";
        return (
          <article key={request.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground" dir="ltr">{request.requestCode}</span>
                  <h3 className="text-xl font-bold">{request.businessName}</h3>
                  <Status status={request.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground md:grid-cols-4">
                  <span>المدينة: {request.city}</span><span>النشاط: {request.businessType}</span>
                  <span dir="ltr" className="text-right">{request.phone}</span><span>{formatDate(request.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button data-testid={`button-view-supplier-request-${request.id}`} type="button" onClick={() => onSelect(selected?.id === request.id ? null : request)} className="rounded-xl border px-3 py-2 text-sm font-bold hover:bg-muted"><FileText className="ml-1 inline h-4 w-4" /> عرض التفاصيل</button>
                {pending && <>
                  <button data-testid={`button-approve-supplier-request-${request.id}`} type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/approve`, { method: "POST" }, "تمت الموافقة ونشر المورد.")} className="rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-700"><CheckCircle2 className="ml-1 inline h-4 w-4" /> موافقة</button>
                  <button data-testid={`button-reject-supplier-request-${request.id}`} type="button" onClick={() => setRejectReason(rejectReason ? "" : " ")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"><XCircle className="ml-1 inline h-4 w-4" /> رفض</button>
                </>}
              </div>
            </div>
            {pending && rejectReason !== "" && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={rejectReason.trim() ? rejectReason : ""} onChange={(event) => setRejectReason(event.target.value)} placeholder="سبب الرفض (اختياري)" className="h-10 flex-1 rounded-lg border bg-background px-3" /><button type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: rejectReason }) }, "تم رفض الطلب وحفظ السبب.")} className="rounded-lg bg-red-600 px-4 font-bold text-white">تأكيد الرفض</button></div>}
            {selected?.id === request.id && <div className="mt-5 space-y-4 border-t pt-5"><DetailGrid request={request} /><div><label className="mb-2 block text-sm font-bold">طلب معلومات إضافية</label><div className="flex gap-2"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ما المعلومات المطلوبة؟" className="h-10 flex-1 rounded-lg border bg-background px-3" /><button type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/request-info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }, "تم حفظ طلب المعلومات.")} className="rounded-lg border px-4 font-bold">حفظ</button></div></div></div>}
          </article>
        );
      })}
    </div>
  );
}

function DetailGrid({ request }: { request: SupplierRequest }) {
  const docs = [["السجل التجاري", request.commercialLicenseUrl], ["الهوية", request.idCardUrl], ["الشهادة الصحية", request.healthCertificateUrl]] as const;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl bg-muted/30 p-4 text-sm md:grid-cols-2">
      <Info label="الشخص المسؤول" value={request.contactPerson} />
      <Info label="الواتساب" value={request.whatsapp} />
      <Info label="البريد" value={request.email || "غير مضاف"} />
      <Info label="الموقع" value={request.website || "غير مضاف"} />
      <Info label="العنوان" value={request.address || "غير مضاف"} />
      <Info label="مدن أخرى" value={request.otherCities || "لا يوجد"} />
      <Info label="الفئات" value={request.categories.join("، ")} />
      <Info label="الحد الأدنى" value={request.minOrder || "غير محدد"} />
      <div className="md:col-span-2"><strong>النبذة:</strong><p className="mt-1 leading-7 text-muted-foreground">{request.description}</p></div>
      {request.productImages.length > 0 && <div className="md:col-span-2">
        <strong>صور المنتجات المرفقة</strong>
        <div className="mt-2 flex flex-wrap gap-3">{request.productImages.map((image, index) => <a data-testid={`link-request-product-image-${request.id}-${index}`} key={image} href={image} target="_blank" rel="noreferrer" className="h-24 w-24 overflow-hidden rounded-lg border"><img src={image} alt={`صورة منتج ${index + 1}`} className="h-full w-full object-cover" /></a>)}</div>
      </div>}
      <div className="flex flex-wrap gap-2 md:col-span-2">{docs.map(([label, url]) => url ? <a key={label} href={url} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">{label}</a> : <span key={label} className="text-muted-foreground">{label}: غير مرفق</span>)}</div>
      {request.rejectionReason && <Info label="سبب الرفض" value={request.rejectionReason} />}
    </div>
  );
}

function BuyerRequestsTab({ requests, onDelete }: { requests: BuyerRequest[]; onDelete: (id: number) => void }) {
  return requests.length === 0 ? <Empty title="لا توجد طلبات أصحاب أعمال" description="ستظهر تسجيلات أصحاب الأعمال هنا." /> : <div className="overflow-x-auto bg-card border rounded-2xl"><table className="w-full text-sm text-right"><thead className="bg-muted/50"><tr>{["رقم الطلب", "الاسم", "المدينة", "نوع النشاط", "الجوال", "التفضيلات", "التاريخ", ""].map((head) => <th key={head} className="p-4 font-bold whitespace-nowrap">{head}</th>)}</tr></thead><tbody>{requests.map((request) => <tr key={request.id} className="border-t"><td className="p-4" dir="ltr">{request.requestCode}</td><td className="p-4 font-bold">{request.fullName}<div className="text-xs text-muted-foreground">{request.businessName || ""}</div></td><td className="p-4">{request.city}</td><td className="p-4">{request.businessType === "آخر" ? request.otherBusinessType || "آخر" : request.businessType}</td><td className="p-4" dir="ltr">{request.phone}</td><td className="p-4"><div className="flex flex-wrap gap-1 min-w-44">{request.newsletterWeekly && <span className="rounded-full bg-primary/10 text-primary px-2 py-1 text-xs">نشرة الأسعار</span>}{request.buyersGroup && <span className="rounded-full bg-secondary text-secondary-foreground px-2 py-1 text-xs">مجموعة أصحاب الأعمال</span>}{!request.newsletterWeekly && !request.buyersGroup && <span className="text-muted-foreground text-xs">لا توجد</span>}</div></td><td className="p-4 whitespace-nowrap">{formatDate(request.createdAt)}</td><td className="p-4"><button type="button" onClick={() => onDelete(request.id)} className="text-red-700 hover:underline font-bold"><Trash2 className="w-4 h-4 inline" /> حذف</button></td></tr>)}</tbody></table></div>;
}

function ContactLogsTab({ logs }: { logs: ContactLog[] }) {
  return logs.length === 0
    ? <Empty title="لا توجد سجلات تواصل" description="ستظهر هنا الرسائل التي جُهزت لأصحاب الأعمال للتواصل مع الموردين." />
    : <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-right text-sm">
        <thead className="bg-muted/50"><tr>{["رقم الرسالة", "اسم العميل", "نوع النشاط", "اسم المورد", "تاريخ الإرسال"].map((heading) => <th key={heading} className="whitespace-nowrap p-4 font-bold">{heading}</th>)}</tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id} className="border-t">
          <td className="whitespace-nowrap p-4 font-bold text-primary" dir="ltr">{log.messageId}</td>
          <td className="p-4">{log.buyerName}</td>
          <td className="p-4">{log.businessType}</td>
          <td className="p-4">{log.supplierName}</td>
          <td className="whitespace-nowrap p-4">{formatDateTime(log.sentAt)}</td>
        </tr>)}</tbody>
      </table>
    </div>;
}

function BuyerModerationTab({ reports, users, onAction }: { reports: BuyerReport[]; users: BuyerModerationUser[]; onAction: (path: string, init?: RequestInit, message?: string) => Promise<boolean> }) {
  const [reviewStatuses, setReviewStatuses] = useState<Record<number, string>>({});
  const [userStatuses, setUserStatuses] = useState<Record<number, BuyerStatus>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const statusLabels: Record<BuyerStatus, string> = { active: "نشط", under_review: "قيد المراجعة", restricted: "مقيّد مؤقتاً", suspended: "موقوف", blocked: "محظور" };
  const reportLabels = { open: "مفتوح", reviewed: "تمت المراجعة", dismissed: "مرفوض", actioned: "تم اتخاذ إجراء" };
  return <div className="space-y-8">
    <section>
      <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-xl font-bold">البلاغات الواردة</h3><p className="mt-1 text-sm text-muted-foreground">كل بلاغ مرتبط بتواصل مسجل فعلياً مع المورد.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{reports.filter((report) => report.status === "open").length} مفتوح</span></div>
      {reports.length === 0 ? <Empty title="لا توجد بلاغات" description="ستظهر هنا البلاغات التي يرفعها الموردون عن تواصل موثق." /> : <div className="space-y-4">{reports.map((report) => <article key={report.id} className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h4 className="text-lg font-bold">{report.buyerName}</h4><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{reportLabels[report.status]}</span><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{statusLabels[report.buyerStatus]}</span></div>
            <p className="mt-2 text-sm text-muted-foreground">المورد: {report.supplierName} · السبب: <strong className="text-foreground">{report.reason}</strong></p>
            <p className="mt-1 text-xs text-muted-foreground">سجل التواصل: {report.messageId} · {formatDate(report.createdAt)} · {report.buyerPhone}</p>
            {report.note && <p className="mt-4 rounded-xl bg-muted/40 p-3 text-sm leading-7">{report.note}</p>}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <select value={reviewStatuses[report.id] || report.status} onChange={(event) => setReviewStatuses({ ...reviewStatuses, [report.id]: event.target.value })} className="h-10 rounded-lg border bg-background px-3 text-sm">
              <option value="reviewed">تمت المراجعة</option><option value="dismissed">رفض البلاغ</option><option value="actioned">تم اتخاذ إجراء</option>
            </select>
            <button type="button" onClick={() => void onAction(`/api/admin/buyer-reports/${report.id}/review`, { method: "POST", body: JSON.stringify({ status: reviewStatuses[report.id] || "reviewed" }) }, "تم حفظ نتيجة البلاغ.")} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">حفظ النتيجة</button>
            <button type="button" onClick={() => void onAction(`/api/admin/buyer-users/${report.buyerId}/status`, { method: "POST", body: JSON.stringify({ status: "under_review", reason: `بلاغ من المورد ${report.supplierName}: ${report.reason}` }) }, "تم وضع الحساب قيد المراجعة.")} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800">قيد المراجعة</button>
          </div>
        </div>
      </article>)}</div>}
    </section>
    <section>
      <div className="mb-4"><h3 className="text-xl font-bold">حسابات أصحاب الأعمال</h3><p className="mt-1 text-sm text-muted-foreground">تغيير الحالة قرار إداري مسجل، وليس صلاحية للمورد.</p></div>
      {users.length === 0 ? <Empty title="لا توجد حسابات" description="ستظهر حسابات أصحاب الأعمال بعد التسجيل." /> : <div className="space-y-3">{users.map((user) => <article key={user.id} className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-4 lg:flex-row lg:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{user.fullName}</h4><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{statusLabels[user.moderationStatus]}</span>{user.reportCount > 0 && <span className="text-xs text-amber-700">بلاغات: {user.reportCount}</span>}</div><p className="mt-1 text-sm text-muted-foreground">{user.businessName || "منشأة غير محددة"} · {user.city} · {user.phone}</p>{user.moderationReason && <p className="mt-1 text-xs text-muted-foreground">آخر سبب: {user.moderationReason}</p>}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><select value={userStatuses[user.id] || user.moderationStatus} onChange={(event) => setUserStatuses({ ...userStatuses, [user.id]: event.target.value as BuyerStatus })} className="h-10 rounded-lg border bg-background px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={reasons[user.id] || ""} onChange={(event) => setReasons({ ...reasons, [user.id]: event.target.value })} placeholder="سبب مختصر (اختياري)" className="h-10 rounded-lg border bg-background px-3 text-sm" /><button type="button" onClick={() => void onAction(`/api/admin/buyer-users/${user.id}/status`, { method: "POST", body: JSON.stringify({ status: userStatuses[user.id] || user.moderationStatus, reason: reasons[user.id] || "" }) }, "تم تحديث حالة الحساب.")} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">حفظ</button></div>
      </article>)}</div>}
    </section>
  </div>;
}

function DirectoryTab({ suppliers, settings, onAction }: { suppliers: Supplier[]; settings: Settings | null; onAction: (path: string, init?: RequestInit, message?: string) => Promise<boolean> }) {
  const queryClient = useQueryClient();
  const [newProduct, setNewProduct] = useState<{ supplierId: number; name: string; categoryId: string; imageUrl: string; imageDataUrl: string } | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [editing, setEditing] = useState<Pick<Supplier, "id" | "name" | "city" | "description" | "phone" | "whatsapp"> | null>(null);
  const [orderEditor, setOrderEditor] = useState<{ supplierId: number; products: AdminProduct[] } | null>(null);
  const [draggingProductId, setDraggingProductId] = useState<number | null>(null);
  const [orderLoading, setOrderLoading] = useState<number | null>(null);
  const [accessEditing, setAccessEditing] = useState<{ supplierId: number; password: string } | null>(null);
  const generateInvitation = useGenerateSupplierInvitation();
  const markInvitationSent = useMarkSupplierInvitationSent();

  const sendInvitation = (supplier: Supplier) => {
    const popup = window.open("about:blank", "_blank");
    generateInvitation.mutate({ id: supplier.id }, {
      onSuccess: (result) => {
        const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
        const link = `${window.location.origin}${basePath}/invite/${result.token}`;
        const message = `مرحباً ${result.supplierName}،\nيسر دليل موردي المخابز والحلويات دعوتكم لاستكمال ملف منشأتكم عبر الرابط:\n${link}\nنراجع المعلومات قبل نشرها لضمان دقة الدليل.`;
        void navigator.clipboard?.writeText(link);
        const whatsappUrl = `https://wa.me/${result.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
        if (popup) popup.location.href = whatsappUrl;
        else window.open(whatsappUrl, "_blank", "noopener,noreferrer");
        markInvitationSent.mutate({ id: supplier.id }, {
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: getListSupplierInvitationsQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getGetSupplierInvitationStatsQueryKey() });
          },
        });
      },
      onError: (error) => {
        popup?.close();
        window.alert(error instanceof Error ? error.message : "تعذر إنشاء الدعوة.");
      },
    });
  };

  const openOrderEditor = async (supplierId: number) => {
    setOrderLoading(supplierId);
    try {
      const products = await adminFetch<AdminProduct[]>(`/api/admin/suppliers/${supplierId}/products`);
      setOrderEditor({ supplierId, products });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "تعذر تحميل المنتجات.");
    } finally {
      setOrderLoading(null);
    }
  };

  const moveProduct = (targetId: number) => {
    if (!draggingProductId || draggingProductId === targetId) return;
    setOrderEditor((current) => {
      if (!current) return current;
      const products = [...current.products];
      const sourceIndex = products.findIndex((product) => product.id === draggingProductId);
      const targetIndex = products.findIndex((product) => product.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = products.splice(sourceIndex, 1);
      products.splice(targetIndex, 0, moved);
      return { ...current, products };
    });
    setDraggingProductId(null);
  };

  const saveProduct = async () => {
    if (!newProduct) return;
    setSavingProduct(true);
    try {
      let imageUrl = newProduct.imageUrl.trim();
      if (newProduct.imageDataUrl) {
        const uploaded = await adminFetch<{ imageUrl: string }>("/api/admin/product-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: newProduct.imageDataUrl }),
        });
        imageUrl = uploaded.imageUrl;
      }
      if (!imageUrl) throw new Error("اختر صورة المنتج أو أدخل رابطاً لها.");
      const saved = await onAction(`/api/admin/suppliers/${newProduct.supplierId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProduct.name, categoryId: newProduct.categoryId, imageUrl }),
      }, "تمت إضافة المنتج.");
      if (saved) setNewProduct(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "تعذر رفع الصورة وإضافة المنتج.");
    } finally {
      setSavingProduct(false);
    }
  };

  return <div className="space-y-4">
    {suppliers.map((supplier) => <article key={supplier.id} className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2"><h3 className="text-lg font-bold">{supplier.name}</h3>{supplier.isVerified && <Status status="approved" />}{!supplier.isActive && <span className="rounded-full bg-muted px-2 py-1 text-xs">موقوف</span>}</div>
           <p className="mt-2 text-sm text-muted-foreground">{supplier.city} · منتجات: {supplier.productCount}</p>
           {(supplier.googleCategory || supplier.googleRating) && <p className="mt-2 text-xs font-bold text-primary">{supplier.googleCategory || "مورد"}{supplier.googleRating ? ` · تقييم Google: ${supplier.googleRating.toFixed(1)}${supplier.googleReviewCount ? ` (${supplier.googleReviewCount})` : ""}` : ""}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button data-testid={`button-send-invitation-${supplier.id}`} type="button" disabled={generateInvitation.isPending || markInvitationSent.isPending} onClick={() => sendInvitation(supplier)} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"><Send className="inline h-4 w-4 ml-1" /> {generateInvitation.isPending ? "جاري إنشاء الرابط..." : "إرسال دعوة"}</button>
          <button type="button" onClick={() => setEditing({ id: supplier.id, name: supplier.name, city: supplier.city, description: supplier.description, phone: supplier.phone, whatsapp: supplier.whatsapp })} className="rounded-lg border px-3 py-2 text-sm font-bold">تعديل</button>
           <button type="button" onClick={() => setNewProduct({ supplierId: supplier.id, name: "", categoryId: "", imageUrl: "", imageDataUrl: "" })} className="rounded-lg border px-3 py-2 text-sm font-bold"><Plus className="inline h-4 w-4 ml-1" /> إضافة منتج</button>
          <button type="button" onClick={() => void openOrderEditor(supplier.id)} className="rounded-lg border px-3 py-2 text-sm font-bold"><GripVertical className="inline h-4 w-4 ml-1" /> {orderLoading === supplier.id ? "جاري التحميل..." : "ترتيب المنتجات"}</button>
           <button type="button" onClick={() => setAccessEditing({ supplierId: supplier.id, password: "" })} className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-bold text-primary">تفعيل دخول المورد</button>
          <button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}/pause`, { method: "POST" }, supplier.isActive ? "تم إيقاف المورد." : "تم إعادة تفعيل المورد.")} className="rounded-lg border px-3 py-2 text-sm font-bold">{supplier.isActive ? "إيقاف مؤقت" : "تفعيل"}</button>
          <button type="button" onClick={() => { if (window.confirm("سيتم حذف المورد ومنتجاته. هل تريد المتابعة؟")) void onAction(`/api/admin/suppliers/${supplier.id}`, { method: "DELETE" }, "تم حذف المورد."); }} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">حذف</button>
        </div>
      </div>

      {editing?.id === supplier.id && <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
        <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="اسم المورد" className="h-10 rounded-lg border bg-background px-3" />
        <input value={editing.city} onChange={(event) => setEditing({ ...editing, city: event.target.value })} placeholder="المدينة" className="h-10 rounded-lg border bg-background px-3" />
        <input value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} placeholder="الجوال" className="h-10 rounded-lg border bg-background px-3" />
        <input value={editing.whatsapp} onChange={(event) => setEditing({ ...editing, whatsapp: event.target.value })} placeholder="الواتساب" className="h-10 rounded-lg border bg-background px-3" />
        <textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} placeholder="الوصف" className="rounded-lg border bg-background px-3 py-2 md:col-span-2" />
        <div className="flex gap-2 md:col-span-2"><button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) }, "تم تحديث المورد.")} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">حفظ التعديل</button><button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2">إلغاء</button></div>
      </div>}

      {accessEditing?.supplierId === supplier.id && <div className="mt-4 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div><p className="font-bold">إنشاء وصول آمن للمورد</p><p className="mt-1 text-xs leading-6 text-muted-foreground">سيستخدم المورد جواله المسجل للدخول إلى صفحة البلاغات. سلّمه كلمة المرور خارج المنصة.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><input type="password" dir="ltr" value={accessEditing.password} onChange={(event) => setAccessEditing({ ...accessEditing, password: event.target.value })} placeholder="كلمة مرور 6 خانات أو أكثر" className="h-10 flex-1 rounded-lg border bg-background px-3" /><button type="button" disabled={accessEditing.password.length < 6} onClick={async () => { const saved = await onAction(`/api/admin/suppliers/${supplier.id}/access`, { method: "POST", body: JSON.stringify({ password: accessEditing.password }) }, "تم تفعيل وصول المورد."); if (saved) setAccessEditing(null); }} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">حفظ الوصول</button><button type="button" onClick={() => setAccessEditing(null)} className="rounded-lg border px-4 py-2 font-bold">إلغاء</button></div>
      </div>}

      {newProduct?.supplierId === supplier.id && <div className="mt-4 space-y-4 border-t pt-4">
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4"><div className="flex items-start gap-3"><GripVertical className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><div><p className="font-extrabold text-accent-foreground">اختر أفضل 3 منتجات لديك بعناية</p><p className="mt-1 text-xs leading-6 text-muted-foreground">ستظهر المنتجات الأولى في واجهة المورد. استخدم ترتيب المنتجات لتحديد الأولوية.</p></div></div></div>
         <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.3fr_auto]">
          <input data-testid={`input-product-name-${supplier.id}`} value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="اسم المنتج" className="h-11 rounded-lg border bg-background px-3" />
          <select data-testid={`select-product-category-${supplier.id}`} value={newProduct.categoryId} onChange={(event) => setNewProduct({ ...newProduct, categoryId: event.target.value })} className="h-11 rounded-lg border bg-background px-3"><option value="">التصنيف</option>{settings?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
           <label className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm ${newProduct.imageDataUrl ? "border-primary bg-primary/5" : "border-accent bg-accent/10"}`}><ImagePlus className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate">{newProduct.imageDataUrl ? "تم اختيار الصورة" : "اختر صورة من الجهاز"}</span><input data-testid={`input-product-image-${supplier.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const imageDataUrl = await prepareProductImage(file); setNewProduct({ ...newProduct, imageDataUrl, imageUrl: "" }); } catch (error) { window.alert(error instanceof Error ? error.message : "تعذر تجهيز الصورة."); } }} className="sr-only" /></label>
           <button data-testid={`button-save-product-${supplier.id}`} type="button" disabled={savingProduct || !newProduct.name.trim() || !newProduct.categoryId || (!newProduct.imageUrl.trim() && !newProduct.imageDataUrl)} onClick={() => void saveProduct()} className="h-11 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">{savingProduct ? "جاري الرفع..." : "حفظ المنتج"}</button>
        </div>
         {newProduct.imageDataUrl && <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3"><img src={newProduct.imageDataUrl} alt="معاينة صورة المنتج" className="h-16 w-16 rounded-lg object-cover" /><span className="text-sm font-medium">ستُضغط الصورة تلقائياً قبل حفظها.</span></div>}
         <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>أو</span><input type="url" value={newProduct.imageUrl} onChange={(event) => setNewProduct({ ...newProduct, imageUrl: event.target.value, imageDataUrl: "" })} placeholder="الصق رابط صورة عامة" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3" /></div>
        <div className="flex justify-end"><button type="button" onClick={() => setNewProduct(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">إلغاء</button></div>
      </div>}

      {orderEditor?.supplierId === supplier.id && <div className="mt-4 space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3"><p className="font-bold">ترتيب المنتجات حسب الأهمية</p><button type="button" onClick={() => setOrderEditor(null)} className="text-sm text-muted-foreground hover:text-foreground">إغلاق</button></div>
        {!orderEditor.products.length ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">لا توجد منتجات لترتيبها.</p> : orderEditor.products.map((product, index) => <div key={product.id} draggable onDragStart={() => setDraggingProductId(product.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveProduct(product.id)} className={`flex cursor-grab items-center gap-3 rounded-xl border bg-background p-3 active:cursor-grabbing ${draggingProductId === product.id ? "opacity-50" : ""}`}><GripVertical className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="w-6 text-center text-sm font-bold text-muted-foreground">{index + 1}</span><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <Package className="m-3 h-6 w-6 text-muted-foreground" />}</div><span className="font-bold">{product.name}</span></div>)}
        {!!orderEditor.products.length && <div className="flex justify-end"><button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}/products/order`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: orderEditor.products.map((product) => product.id) }) }, "تم حفظ ترتيب المنتجات.")} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">حفظ الترتيب</button></div>}
      </div>}
    </article>)}
  </div>;
}

function StatsTab({ stats }: { stats: Stats | null }) {
  const cards = [["الطلبات المعلقة", stats?.pendingSupplierRequests ?? 0, Clock3], ["الموردون المعتمدون", stats?.approvedSuppliers ?? 0, Store], ["أصحاب الأعمال", stats?.buyers ?? 0, ShoppingCart], ["المنتجات", stats?.products ?? 0, FileText], ["المدن المغطاة", stats?.cities ?? 0, LayoutDashboard], ["زيارات ملفات الموردين", stats?.totalPageViews ?? 0, Eye], ["فرص التواصل المؤهلة · 30 يوماً", stats?.qualifiedContacts30d ?? 0, MessageCircle], ["نسبة التحويل · 30 يوماً", `${stats?.contactRate30d ?? 0}%`, TrendingUp]] as const;
  return <div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{cards.map(([label, value, Icon]) => <div key={label} className="bg-card border rounded-2xl p-6"><Icon className="w-6 h-6 text-primary mb-4" /><div className="text-3xl font-bold">{value}</div><div className="text-muted-foreground mt-1">{label}</div></div>)}</div><div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-5 text-sm leading-7 text-muted-foreground">تُحسب فرصة التواصل المؤهلة مرة واحدة لكل صاحب عمل مع كل مورد خلال 30 يوماً. الأرقام تقيس فرصاً منشأة عبر الدليل، وليست مبيعات مؤكدة أو دليلاً على قراءة الرسالة أو الرد عليها في واتساب.</div></div>;
}

function SettingsTab({ settings, suppliers, onAction }: { settings: Settings | null; suppliers: Supplier[]; onAction: (path: string, init?: RequestInit, message?: string) => Promise<boolean> }) {
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("free");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (settings) {
      setWhatsapp(settings.whatsapp);
      setEmail(settings.email);
      setAddress(settings.address);
      setSelectedPlanId(String(settings.plans[0]?.id || 1));
    }
  }, [settings]);

  return <div className="space-y-6">
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-2">رقم واتساب التواصل</h3>
      <p className="text-sm text-muted-foreground mb-4">يظهر هذا الرقم في رسالة نجاح التسجيل وصفحة التواصل.</p>
      <div className="flex gap-2 max-w-md">
        <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} dir="ltr" placeholder="05XXXXXXXX" className="flex-1 h-11 px-3 rounded-lg border bg-background" />
        <button type="button" onClick={() => void onAction("/api/admin/settings/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsapp }) }, "تم تحديث رقم الواتساب.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold">حفظ</button>
      </div>
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-2">بيانات التواصل العامة</h3>
      <p className="text-sm text-muted-foreground mb-4">تظهر هذه البيانات في صفحة «اتصل بنا» للموردين والعملاء.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" dir="ltr" placeholder="البريد الإلكتروني" className="h-11 px-3 rounded-lg border bg-background" />
        <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="العنوان" className="h-11 px-3 rounded-lg border bg-background" />
        <button type="button" onClick={() => void onAction("/api/admin/settings/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, address }) }, "تم تحديث بيانات التواصل.")} className="md:col-span-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 font-bold">حفظ بيانات التواصل</button>
      </div>
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-2">الباقات المتاحة</h3>
      <p className="text-sm text-muted-foreground mb-5">يبدأ كل مورد بالباقة الأساسية، ويمكن ترقية الباقة من قسم تعيين الاشتراك أدناه.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {settings?.plans.map((plan) => (
          <article key={plan.id} className={`rounded-2xl border p-4 ${plan.slug === "pro" ? "border-primary shadow-sm" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold">{plan.name}</h4>
              {plan.slug === "pro" && <span className="text-[11px] rounded-full bg-primary/15 text-primary px-2 py-1 font-bold">الأكثر اختياراً</span>}
            </div>
            <div className="text-2xl font-bold text-primary mt-3">{plan.priceMonthly === 0 ? "مجانية" : `${plan.priceMonthly} ر.س / شهر`}</div>
            <p className="text-sm text-muted-foreground mt-2 min-h-10">{plan.description}</p>
            <div className="text-sm mt-4 space-y-1">
              <div>المنتجات: {plan.maxProducts}</div>
              <div>الصور لكل منتج: {plan.maxImagesPerProduct}</div>
              <div>{plan.hasVerifiedBadge ? "شارة موثق متاحة" : "بدون شارة موثق"}</div>
              <div>{plan.hasFeaturedListing ? "ظهور مميز متاح" : "ظهور عادي"}</div>
              <div>{plan.hasBanner ? "بانر إعلاني متاح" : "بدون بانر إعلاني"}</div>
              <div>{plan.hasAnalytics ? "إحصائيات متاحة" : "بدون إحصائيات"}</div>
              <div>{plan.hasPrioritySupport ? "دعم أولوي متاح" : "دعم عادي"}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-2">تعيين اشتراك لمورد</h3>
      <p className="text-sm text-muted-foreground mb-4">يحدّث هذا الإجراء الحد الأقصى للمنتجات والظهور المميز، ويسجل الاشتراك السابق.</p>
      {suppliers.length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد موردون معتمدون حالياً.</p> : <div className="grid md:grid-cols-4 gap-3">
        <select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} className="h-11 px-3 rounded-lg border bg-background">
          <option value="">اختر المورد</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
        <select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)} className="h-11 px-3 rounded-lg border bg-background">
          {settings?.plans.filter((plan) => plan.isActive).map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.maxProducts} منتجات</option>)}
        </select>
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-11 px-3 rounded-lg border bg-background">
          <option value="free">مجاني</option>
          <option value="cash">دفع نقدي</option>
          <option value="bank_transfer">تحويل بنكي</option>
        </select>
        <button type="button" disabled={!selectedSupplierId} onClick={() => void onAction(`/api/admin/suppliers/${selectedSupplierId}/subscription`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: Number(selectedPlanId), paymentMethod }) }, "تم تحديث اشتراك المورد.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold disabled:opacity-50">تفعيل الباقة</button>
      </div>}
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-4">تغيير كلمة مرور اللوحة</h3>
      <div className="grid md:grid-cols-3 gap-3">
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="كلمة المرور الحالية" className="h-11 px-3 rounded-lg border bg-background" />
        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="كلمة المرور الجديدة (8 أحرف)" className="h-11 px-3 rounded-lg border bg-background" />
        <button type="button" onClick={() => void onAction("/api/admin/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }, "تم تغيير كلمة المرور.")} className="rounded-lg bg-primary text-primary-foreground font-bold">تغيير كلمة المرور</button>
      </div>
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-4">إدارة المدن المتاحة</h3>
      <div className="flex flex-wrap gap-2 mb-4">{settings?.cities.map((item) => <span key={item} className="rounded-full bg-muted px-3 py-1 text-sm">{item}</span>)}</div>
      <div className="flex gap-2 max-w-md">
        <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="مدينة جديدة" className="flex-1 h-10 px-3 rounded-lg border bg-background" />
        <button type="button" onClick={() => void onAction("/api/admin/settings/cities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city }) }, "تم تحديث المدن.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold">إضافة</button>
      </div>
    </section>
    <section className="bg-card border rounded-2xl p-6">
      <h3 className="text-xl font-bold mb-4">إدارة التصنيفات</h3>
      <div className="flex flex-wrap gap-2 mb-4">{settings?.categories.map((item) => <span key={item.id} className="rounded-full bg-muted px-3 py-1 text-sm">{item.name}</span>)}</div>
      <div className="flex gap-2 max-w-md">
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="تصنيف جديد" className="flex-1 h-10 px-3 rounded-lg border bg-background" />
        <button type="button" onClick={() => void onAction("/api/admin/settings/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: category }) }, "تمت إضافة التصنيف.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold">إضافة</button>
      </div>
    </section>
  </div>;
}

function Status({ status }: { status: "pending" | "pending_review" | "approved" | "rejected" }) {
  const labels = { pending: "معلق", pending_review: "بانتظار المراجعة", approved: "موافق", rejected: "مرفوض" };
  const styles = { pending: "bg-amber-100 text-amber-800", pending_review: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" };
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[status]}`}>{labels[status]}</span>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><strong>{label}:</strong> <span className="text-muted-foreground">{value}</span></div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="rounded-2xl border border-dashed bg-muted/20 p-12 text-center"><UserRound className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" /><h2 className="font-bold text-lg mb-2">{title}</h2><p className="text-muted-foreground">{description}</p></div>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function prepareProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("اختر صورة بصيغة JPG أو PNG أو WebP."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("حجم الصورة الأصلي يجب ألا يتجاوز 10 ميجابايت."));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) {
          reject(new Error("تعذر تجهيز الصورة."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
        reader.readAsDataURL(blob);
      }, "image/webp", 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("تعذر فتح الصورة."));
    };
    image.src = objectUrl;
  });
}
async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب."); return result as T; }