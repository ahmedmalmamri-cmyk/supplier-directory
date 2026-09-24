import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { Building2, LogOut, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";

export default function BuyerProfilePage() {
  const { user, isLoading, logout } = useBuyerAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) navigate("/buyer/login");
  }, [isLoading, user, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate("/buyer/login");
  };

  return <MainLayout>
    <div className="border-b bg-secondary/10 py-10">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 text-primary"><UserRound className="h-5 w-5" /><span className="font-bold">حساب صاحب العمل</span></div>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><h1 className="text-3xl font-extrabold md:text-4xl">{user?.fullName || "ملفي الشخصي"}</h1><p className="mt-2 text-muted-foreground">بيانات الحساب المستخدمة عند التواصل مع الموردين.</p></div>
          {user && <button type="button" onClick={() => void handleLogout()} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold hover:bg-muted"><LogOut className="h-4 w-4" /> تسجيل الخروج</button>}
        </div>
      </div>
    </div>
    <div className="container mx-auto max-w-3xl px-4 py-10">
      {isLoading ? <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">جارٍ تحميل الحساب...</div> : user ? <>
        <section className="rounded-3xl border bg-card p-6 shadow-warm md:p-8">
          <div className="mb-6 flex items-center gap-3 border-b pb-5"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div><div><h2 className="text-xl font-extrabold">معلومات الحساب</h2><p className="mt-1 text-sm text-muted-foreground">هذه المعلومات تظهر للمورد عند بدء التواصل.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField icon={<UserRound className="h-4 w-4" />} label="الاسم الكامل" value={user.fullName} />
            <ProfileField icon={<Phone className="h-4 w-4" />} label="رقم الجوال" value={user.phone} dir="ltr" />
            <ProfileField icon={<Building2 className="h-4 w-4" />} label="نوع النشاط" value={user.businessType} />
            <ProfileField icon={<Building2 className="h-4 w-4" />} label="اسم النشاط التجاري" value={user.businessName || "غير محدد"} />
            <ProfileField icon={<MapPin className="h-4 w-4" />} label="المدينة" value={user.city} />
            <ProfileField icon={<UserRound className="h-4 w-4" />} label="الصفة" value={user.isOwner ? "صاحب العمل" : user.jobTitle || "ممثل المنشأة"} />
            {user.email && <ProfileField icon={<span className="text-xs font-bold">@</span>} label="البريد الإلكتروني" value={user.email} dir="ltr" />}
          </div>
        </section>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/suppliers" className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground hover:bg-primary/90">تصفح الموردين</Link>
          <Link href="/search" className="inline-flex items-center justify-center rounded-xl border px-5 py-3 font-bold hover:bg-muted">البحث عن منتج</Link>
        </div>
      </> : null}
    </div>
  </MainLayout>;
}

function ProfileField({ icon, label, value, dir }: { icon: React.ReactNode; label: string; value: string; dir?: "ltr" | "rtl" }) {
  return <div className="rounded-xl bg-muted/30 p-4"><p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">{icon}{label}</p><p dir={dir} className={`mt-2 font-bold ${dir === "ltr" ? "text-left" : ""}`}>{value}</p></div>;
}