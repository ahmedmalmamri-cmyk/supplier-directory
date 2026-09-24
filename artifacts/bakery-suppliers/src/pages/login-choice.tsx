import { MainLayout } from "@/components/layout/MainLayout";
import { BriefcaseBusiness, Store, UserRound } from "lucide-react";
import { Link } from "wouter";

export default function LoginChoicePage() {
  return <MainLayout>
    <div className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
      <div className="mx-auto mb-8 max-w-xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-7 w-7" /></div>
        <h1 className="text-3xl font-extrabold">دخول الحساب</h1>
        <p className="mt-3 leading-7 text-muted-foreground">اختر نوع حسابك للانتقال إلى صفحة الدخول المناسبة.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/buyer/login" className="group rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><BriefcaseBusiness className="h-6 w-6" /></span>
          <span className="block text-xl font-extrabold">صاحب عمل</span>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">الدخول للتواصل مع موردي الدليل.</span>
          <span className="mt-5 block font-bold text-primary">دخول أصحاب الأعمال ←</span>
        </Link>
        <Link href="/supplier/login" className="group rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-warm">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/30 text-primary"><Store className="h-6 w-6" /></span>
          <span className="block text-xl font-extrabold">مورد</span>
          <span className="mt-2 block text-sm leading-6 text-muted-foreground">إدارة المنتجات ومراجعة تواصل العملاء.</span>
          <span className="mt-5 block font-bold text-primary">دخول المورد ←</span>
        </Link>
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">ليس لديك حساب؟ <Link href="/register" className="font-extrabold text-primary hover:underline">انضم إلى الدليل</Link></p>
    </div>
  </MainLayout>;
}