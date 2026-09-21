import { MainLayout } from "@/components/layout/MainLayout";
import { useAdminLogin, useAdminLogout } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { CheckCircle2, Clock3, FileText, LayoutDashboard, LogIn, LogOut, Plus, Settings, ShieldCheck, ShoppingCart, Store, Trash2, UserRound, XCircle } from "lucide-react";

type Tab = "suppliers" | "buyers" | "directory" | "stats" | "settings";
type SupplierRequest = {
  id: number; requestCode: string; businessName: string; contactPerson: string; businessType: string;
  phone: string; whatsapp: string; email: string | null; website: string | null; city: string; address: string | null;
  deliversToOtherCities: boolean; otherCities: string | null; categories: string[]; minOrder: string | null; description: string;
  commercialLicenseUrl: string | null; idCardUrl: string | null; healthCertificateUrl: string | null;
  status: "pending" | "approved" | "rejected"; rejectionReason: string | null; adminNote: string | null;
  createdAt: string; reviewedAt: string | null;
};
type BuyerRequest = { id: number; requestCode: string; fullName: string; phone: string; email: string | null; city: string; businessType: string; businessName: string | null; referralSource: string | null; createdAt: string };
type Supplier = { id: number; name: string; city: string; region: string; description: string; phone: string; whatsapp: string; isVerified: boolean; isActive: boolean; averageRating: number; productCount: number };
type Stats = { pendingSupplierRequests: number; approvedSuppliers: number; buyers: number; products: number; cities: number };
type Settings = { cities: string[]; categories: { id: number; name: string }[] };

const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "suppliers", label: "طلبات الموردين", icon: Store },
  { id: "buyers", label: "طلبات المشترين", icon: ShoppingCart },
  { id: "directory", label: "الموردون المعتمدون", icon: CheckCircle2 },
  { id: "stats", label: "الإحصائيات", icon: LayoutDashboard },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tab, setTab] = useState<Tab>("suppliers");
  const [supplierRequests, setSupplierRequests] = useState<SupplierRequest[]>([]);
  const [buyerRequests, setBuyerRequests] = useState<BuyerRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
      const [requests, buyers, directory, dashboardStats, directorySettings] = await Promise.all([
        adminFetch<SupplierRequest[]>("/api/admin/supplier-requests"),
        adminFetch<BuyerRequest[]>("/api/admin/buyer-requests"),
        adminFetch<Supplier[]>("/api/admin/suppliers"),
        adminFetch<Stats>("/api/admin/stats"),
        adminFetch<Settings>("/api/admin/settings"),
      ]);
      setSupplierRequests(requests);
      setBuyerRequests(buyers);
      setSuppliers(directory);
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

  const act = async (path: string, init?: RequestInit, successMessage?: string) => {
    try {
      await adminFetch(path, init);
      setNotice(successMessage || "تم تنفيذ العملية.");
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "تعذر تنفيذ العملية.");
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
              <button key={id} type="button" onClick={() => setTab(id)} className={`w-full flex items-center gap-3 text-right px-3 py-3 rounded-xl text-sm font-bold transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
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
          {tab === "buyers" && <BuyerRequestsTab requests={buyerRequests} onDelete={(id) => void act(`/api/admin/buyer-requests/${id}`, { method: "DELETE" }, "تم حذف طلب المشتري.")} />}
          {tab === "directory" && <DirectoryTab suppliers={suppliers} settings={settings} onAction={act} />}
          {tab === "stats" && <StatsTab stats={stats} />}
          {tab === "settings" && <SettingsTab settings={settings} onAction={act} />}
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

function SupplierRequestsTab({ requests, selected, onSelect, onAction }: { requests: SupplierRequest[]; selected: SupplierRequest | null; onSelect: (item: SupplierRequest | null) => void; onAction: (path: string, init?: RequestInit, message?: string) => Promise<void> }) {
  const [rejectReason, setRejectReason] = useState("");
  const [note, setNote] = useState("");
  return <div className="space-y-5">{requests.length === 0 ? <Empty title="لا توجد طلبات موردين" description="ستظهر طلبات التسجيل الجديدة هنا." /> : requests.map((request) => <article key={request.id} className="bg-card border rounded-2xl p-5"><div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 mb-3"><span className="text-xs font-bold text-muted-foreground" dir="ltr">{request.requestCode}</span><h3 className="text-xl font-bold">{request.businessName}</h3><Status status={request.status} /></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-muted-foreground"><span>المدينة: {request.city}</span><span>النشاط: {request.businessType}</span><span dir="ltr" className="text-right">{request.phone}</span><span>{formatDate(request.createdAt)}</span></div></div><div className="flex flex-wrap gap-2 shrink-0"><button type="button" onClick={() => onSelect(selected?.id === request.id ? null : request)} className="rounded-xl border px-3 py-2 text-sm font-bold hover:bg-muted"><FileText className="w-4 h-4 inline ml-1" /> عرض التفاصيل</button>{request.status === "pending" && <><button type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/approve`, { method: "POST" }, "تمت الموافقة ونشر المورد.")} className="rounded-xl bg-green-600 text-white px-3 py-2 text-sm font-bold hover:bg-green-700"><CheckCircle2 className="w-4 h-4 inline ml-1" /> موافقة</button><button type="button" onClick={() => setRejectReason(rejectReason ? "" : " ")} className="rounded-xl border border-red-200 text-red-700 px-3 py-2 text-sm font-bold hover:bg-red-50"><XCircle className="w-4 h-4 inline ml-1" /> رفض</button></>}</div></div>{request.status === "pending" && rejectReason !== "" && <div className="mt-4 flex flex-col sm:flex-row gap-2"><input value={rejectReason.trim() ? rejectReason : ""} onChange={(event) => setRejectReason(event.target.value)} placeholder="سبب الرفض (اختياري)" className="flex-1 h-10 px-3 rounded-lg border bg-background" /><button type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: rejectReason }) }, "تم رفض الطلب وحفظ السبب.")} className="rounded-lg bg-red-600 text-white px-4 font-bold">تأكيد الرفض</button></div>}{selected?.id === request.id && <div className="mt-5 border-t pt-5 space-y-4"><DetailGrid request={request} /><div><label className="block text-sm font-bold mb-2">طلب معلومات إضافية</label><div className="flex gap-2"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ما المعلومات المطلوبة؟" className="flex-1 h-10 px-3 rounded-lg border bg-background" /><button type="button" onClick={() => void onAction(`/api/admin/supplier-requests/${request.id}/request-info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }, "تم حفظ طلب المعلومات.")} className="rounded-lg border px-4 font-bold">حفظ</button></div></div></div>}</article>)}</div>;
}

function DetailGrid({ request }: { request: SupplierRequest }) {
  const docs = [["السجل التجاري", request.commercialLicenseUrl], ["الهوية", request.idCardUrl], ["الشهادة الصحية", request.healthCertificateUrl]] as const;
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-muted/30 rounded-xl p-4"><Info label="الشخص المسؤول" value={request.contactPerson} /><Info label="الواتساب" value={request.whatsapp} /><Info label="البريد" value={request.email || "غير مضاف"} /><Info label="الموقع" value={request.website || "غير مضاف"} /><Info label="العنوان" value={request.address || "غير مضاف"} /><Info label="مدن أخرى" value={request.otherCities || "لا يوجد"} /><Info label="الفئات" value={request.categories.join("، ")} /><Info label="الحد الأدنى" value={request.minOrder || "غير محدد"} /><div className="md:col-span-2"><strong>النبذة:</strong><p className="text-muted-foreground leading-7 mt-1">{request.description}</p></div><div className="md:col-span-2 flex flex-wrap gap-2">{docs.map(([label, url]) => url ? <a key={label} href={url} target="_blank" rel="noreferrer" className="text-primary font-bold hover:underline">{label}</a> : <span key={label} className="text-muted-foreground">{label}: غير مرفق</span>)}</div>{request.rejectionReason && <Info label="سبب الرفض" value={request.rejectionReason} />}</div>;
}

function BuyerRequestsTab({ requests, onDelete }: { requests: BuyerRequest[]; onDelete: (id: number) => void }) {
  return requests.length === 0 ? <Empty title="لا توجد طلبات مشترين" description="ستظهر تسجيلات المشترين هنا." /> : <div className="overflow-x-auto bg-card border rounded-2xl"><table className="w-full text-sm text-right"><thead className="bg-muted/50"><tr>{["رقم الطلب", "الاسم", "المدينة", "نوع النشاط", "الجوال", "التاريخ", ""].map((head) => <th key={head} className="p-4 font-bold whitespace-nowrap">{head}</th>)}</tr></thead><tbody>{requests.map((request) => <tr key={request.id} className="border-t"><td className="p-4" dir="ltr">{request.requestCode}</td><td className="p-4 font-bold">{request.fullName}<div className="text-xs text-muted-foreground">{request.businessName || ""}</div></td><td className="p-4">{request.city}</td><td className="p-4">{request.businessType}</td><td className="p-4" dir="ltr">{request.phone}</td><td className="p-4 whitespace-nowrap">{formatDate(request.createdAt)}</td><td className="p-4"><button type="button" onClick={() => onDelete(request.id)} className="text-red-700 hover:underline font-bold"><Trash2 className="w-4 h-4 inline" /> حذف</button></td></tr>)}</tbody></table></div>;
}

function DirectoryTab({ suppliers, settings, onAction }: { suppliers: Supplier[]; settings: Settings | null; onAction: (path: string, init?: RequestInit, message?: string) => Promise<void> }) {
  const [newProduct, setNewProduct] = useState<{ supplierId: number; name: string; categoryId: string } | null>(null);
  const [editing, setEditing] = useState<Pick<Supplier, "id" | "name" | "city" | "description" | "phone" | "whatsapp"> | null>(null);
  return <div className="space-y-4">{suppliers.map((supplier) => <article key={supplier.id} className="bg-card border rounded-2xl p-5"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{supplier.name}</h3>{supplier.isVerified && <Status status="approved" />}{!supplier.isActive && <span className="text-xs rounded-full bg-muted px-2 py-1">موقوف</span>}</div><p className="text-sm text-muted-foreground mt-2">{supplier.city} · منتجات: {supplier.productCount}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing({ id: supplier.id, name: supplier.name, city: supplier.city, description: supplier.description, phone: supplier.phone, whatsapp: supplier.whatsapp })} className="rounded-lg border px-3 py-2 text-sm font-bold">تعديل</button><button type="button" onClick={() => setNewProduct({ supplierId: supplier.id, name: "", categoryId: "" })} className="rounded-lg border px-3 py-2 text-sm font-bold"><Plus className="w-4 h-4 inline ml-1" /> إضافة منتج</button><button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}/pause`, { method: "POST" }, supplier.isActive ? "تم إيقاف المورد." : "تم إعادة تفعيل المورد.")} className="rounded-lg border px-3 py-2 text-sm font-bold">{supplier.isActive ? "إيقاف مؤقت" : "تفعيل"}</button><button type="button" onClick={() => { if (window.confirm("سيتم حذف المورد ومنتجاته. هل تريد المتابعة؟")) void onAction(`/api/admin/suppliers/${supplier.id}`, { method: "DELETE" }, "تم حذف المورد."); }} className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-sm font-bold">حذف</button></div></div>{editing?.id === supplier.id && <div className="mt-4 border-t pt-4 grid md:grid-cols-2 gap-3"><input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="اسم المورد" className="h-10 px-3 rounded-lg border bg-background" /><input value={editing.city} onChange={(event) => setEditing({ ...editing, city: event.target.value })} placeholder="المدينة" className="h-10 px-3 rounded-lg border bg-background" /><input value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} placeholder="الجوال" className="h-10 px-3 rounded-lg border bg-background" /><input value={editing.whatsapp} onChange={(event) => setEditing({ ...editing, whatsapp: event.target.value })} placeholder="الواتساب" className="h-10 px-3 rounded-lg border bg-background" /><textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} placeholder="الوصف" className="md:col-span-2 px-3 py-2 rounded-lg border bg-background" /><div className="md:col-span-2 flex gap-2"><button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) }, "تم تحديث المورد.")} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-bold">حفظ التعديل</button><button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2">إلغاء</button></div></div>}{newProduct?.supplierId === supplier.id && <div className="mt-4 border-t pt-4 grid md:grid-cols-4 gap-3"><input value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="اسم المنتج" className="h-10 px-3 rounded-lg border bg-background" /><select value={newProduct.categoryId} onChange={(event) => setNewProduct({ ...newProduct, categoryId: event.target.value })} className="h-10 px-3 rounded-lg border bg-background"><option value="">التصنيف</option>{settings?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" onClick={() => void onAction(`/api/admin/suppliers/${supplier.id}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newProduct.name, categoryId: newProduct.categoryId }) }, "تمت إضافة المنتج.")} className="h-10 rounded-lg bg-primary text-primary-foreground font-bold">حفظ المنتج</button><button type="button" onClick={() => setNewProduct(null)} className="h-10 rounded-lg border">إلغاء</button></div>}</article>)}</div>;
}

function StatsTab({ stats }: { stats: Stats | null }) {
  const cards = [["الطلبات المعلقة", stats?.pendingSupplierRequests ?? 0, Clock3], ["الموردون المعتمدون", stats?.approvedSuppliers ?? 0, Store], ["المشترون", stats?.buyers ?? 0, ShoppingCart], ["المنتجات", stats?.products ?? 0, FileText], ["المدن المغطاة", stats?.cities ?? 0, LayoutDashboard]] as const;
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{cards.map(([label, value, Icon]) => <div key={label} className="bg-card border rounded-2xl p-6"><Icon className="w-6 h-6 text-primary mb-4" /><div className="text-3xl font-bold">{value}</div><div className="text-muted-foreground mt-1">{label}</div></div>)}</div>;
}

function SettingsTab({ settings, onAction }: { settings: Settings | null; onAction: (path: string, init?: RequestInit, message?: string) => Promise<void> }) {
  const [city, setCity] = useState(""); const [category, setCategory] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState("");
  return <div className="space-y-6"><section className="bg-card border rounded-2xl p-6"><h3 className="text-xl font-bold mb-4">تغيير كلمة مرور اللوحة</h3><div className="grid md:grid-cols-3 gap-3"><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="كلمة المرور الحالية" className="h-11 px-3 rounded-lg border bg-background" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="كلمة المرور الجديدة (8 أحرف)" className="h-11 px-3 rounded-lg border bg-background" /><button type="button" onClick={() => void onAction("/api/admin/settings/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) }, "تم تغيير كلمة المرور.")} className="rounded-lg bg-primary text-primary-foreground font-bold">تغيير كلمة المرور</button></div></section><section className="bg-card border rounded-2xl p-6"><h3 className="text-xl font-bold mb-4">إدارة المدن المتاحة</h3><div className="flex flex-wrap gap-2 mb-4">{settings?.cities.map((item) => <span key={item} className="rounded-full bg-muted px-3 py-1 text-sm">{item}</span>)}</div><div className="flex gap-2 max-w-md"><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="مدينة جديدة" className="flex-1 h-10 px-3 rounded-lg border bg-background" /><button type="button" onClick={() => void onAction("/api/admin/settings/cities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city }) }, "تم تحديث المدن.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold">إضافة</button></div></section><section className="bg-card border rounded-2xl p-6"><h3 className="text-xl font-bold mb-4">إدارة التصنيفات</h3><div className="flex flex-wrap gap-2 mb-4">{settings?.categories.map((item) => <span key={item.id} className="rounded-full bg-muted px-3 py-1 text-sm">{item.name}</span>)}</div><div className="flex gap-2 max-w-md"><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="تصنيف جديد" className="flex-1 h-10 px-3 rounded-lg border bg-background" /><button type="button" onClick={() => void onAction("/api/admin/settings/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: category }) }, "تمت إضافة التصنيف.")} className="rounded-lg bg-primary text-primary-foreground px-4 font-bold">إضافة</button></div></section></div>;
}

function Status({ status }: { status: "pending" | "approved" | "rejected" }) {
  const labels = { pending: "معلق", approved: "موافق", rejected: "مرفوض" };
  const styles = { pending: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800" };
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${styles[status]}`}>{labels[status]}</span>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><strong>{label}:</strong> <span className="text-muted-foreground">{value}</span></div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="rounded-2xl border border-dashed bg-muted/20 p-12 text-center"><UserRound className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" /><h2 className="font-bold text-lg mb-2">{title}</h2><p className="text-muted-foreground">{description}</p></div>; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }); }
async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, credentials: "same-origin", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تنفيذ الطلب."); return result as T; }