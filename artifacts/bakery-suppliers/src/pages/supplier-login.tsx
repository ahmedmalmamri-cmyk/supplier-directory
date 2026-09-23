import { MainLayout } from "@/components/layout/MainLayout";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";

export default function SupplierLoginPage() {
  const [, navigate] = useLocation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/supplier/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تسجيل الدخول.");
      navigate("/supplier/portal");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  };

  return <MainLayout>
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-7 w-7" /></div>
        <h1 className="text-3xl font-extrabold">دخول المورد</h1>
        <p className="mt-3 leading-7 text-muted-foreground">الوصول مخصص للموردين المعتمدين. من هنا يمكنك مراجعة تواصلك ورفع بلاغ للإدارة عند الحاجة.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-bold">رقم الجوال المسجل</span><input value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" autoComplete="username" className="h-12 w-full rounded-xl border bg-background px-4 outline-none focus:border-primary focus:ring-1 focus:ring-primary" required /></label>
          <label className="block"><span className="mb-2 block text-sm font-bold">كلمة المرور</span><div className="relative"><KeyRound className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} dir="ltr" autoComplete="current-password" className="h-12 w-full rounded-xl border bg-background px-10 outline-none focus:border-primary focus:ring-1 focus:ring-primary" required /></div></label>
          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}
          <button type="submit" disabled={loading || !phone || !password} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60"><LogIn className="h-4 w-4" />{loading ? "جاري التحقق..." : "دخول"}</button>
        </form>
        <div className="mt-6 rounded-xl bg-muted/50 p-3 text-sm leading-7 text-muted-foreground">لم تستلم بيانات الدخول؟ تواصل مع إدارة الدليل لتفعيل وصول المورد.</div>
        <Link href="/suppliers" className="mt-5 block text-center text-sm font-bold text-primary hover:underline">العودة إلى دليل الموردين</Link>
      </section>
    </div>
  </MainLayout>;
}
