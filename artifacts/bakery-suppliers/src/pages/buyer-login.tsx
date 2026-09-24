import { LockKeyhole, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { useBuyerAuth } from "@/lib/buyer-auth";

export default function BuyerLoginPage() {
  const [, setLocation] = useLocation();
  const { user, refresh } = useBuyerAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { if (user) setLocation("/buyer/profile"); }, [user, setLocation]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/buyer/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تسجيل الدخول.");
      await refresh();
      setLocation("/buyer/profile");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "تعذر تسجيل الدخول.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <MainLayout><div className="container mx-auto max-w-lg px-4 py-16"><section className="rounded-3xl border border-border bg-card p-6 shadow-warm md:p-8"><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-7 w-7" /></div><h1 className="text-3xl font-extrabold">تسجيل دخول أصحاب الأعمال</h1><p className="mt-2 text-muted-foreground">سجّل الدخول للتواصل المباشر مع الموردين.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block"><span className="mb-2 block text-sm font-bold">رقم الجوال أو البريد الإلكتروني</span><input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-primary" /></label><label className="block"><span className="mb-2 block text-sm font-bold">كلمة المرور</span><input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="h-12 w-full rounded-xl border border-input bg-background px-4 outline-none focus:border-primary" /></label>{error && <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}<button type="submit" disabled={isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-extrabold text-primary-foreground disabled:opacity-60"><LogIn className="h-4 w-4" />{isSubmitting ? "جاري الدخول..." : "تسجيل الدخول"}</button></form><p className="mt-6 text-center text-sm text-muted-foreground">ليس لديك حساب؟ <a href="/register/buyer" className="font-extrabold text-primary hover:underline">سجّل كصاحب عمل</a></p></section></div></MainLayout>;
}