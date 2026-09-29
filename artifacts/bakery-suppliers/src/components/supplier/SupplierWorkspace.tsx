import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpLeft, BarChart3, ClipboardList, LayoutDashboard, MapPinned, Wheat } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { SupplierUnauthorizedError } from "@/hooks/use-supplier-insights";

export function SupplierWorkspace({ title, eyebrow, subtitle, children, error }: { title: string; eyebrow: string; subtitle: string; children: ReactNode; error?: Error | null }) {
  const [location, navigate] = useLocation();
  useEffect(() => {
    if (error instanceof SupplierUnauthorizedError || (error as (Error & { status?: number }) | null)?.status === 401) navigate("/supplier/login");
  }, [error, navigate]);
  const links = [
    { href: "/supplier/dashboard", label: "نظرة عامة", icon: LayoutDashboard },
    { href: "/supplier/market", label: "السوق", icon: MapPinned },
    { href: "/supplier/almond-variants", label: "أصناف اللوز", icon: Wheat },
    { href: "/supplier/portal", label: "التواصل والبلاغات", icon: ClipboardList },
  ];
  return <MainLayout>
    <div className="supplier-workspace flex-1 pb-20" dir="rtl">
      <div className="supplier-hero border-b border-border/80">
        <div className="container mx-auto max-w-6xl px-4 pb-7 pt-9 md:pb-9 md:pt-12">
          <div className="mb-4 flex items-center gap-2 text-xs font-extrabold tracking-wide text-primary"><BarChart3 className="h-4 w-4" /> مساحة المورد <span className="text-muted-foreground">/ {eyebrow}</span></div>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><h1 className="text-3xl font-extrabold md:text-[2.7rem]" data-testid="text-supplier-page-title">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{subtitle}</p></div>
            <Link href="/supplier/portal" data-testid="link-supplier-contact-history" className="inline-flex w-fit items-center gap-2 rounded-xl border border-primary/20 bg-card/70 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-card">سجل التواصل <ArrowUpLeft className="h-4 w-4" /></Link>
          </div>
          <nav aria-label="أقسام مساحة المورد" className="mt-8 flex gap-2 overflow-x-auto pb-1">
            {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`link-supplier-${href.split("/").pop()}`} aria-current={location === href ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${location === href ? "bg-primary text-primary-foreground" : "bg-card/80 text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</Link>)}
          </nav>
        </div>
      </div>
      <div className="container mx-auto max-w-6xl px-4 pt-7 md:pt-10">{children}</div>
    </div>
  </MainLayout>;
}

export function WorkspaceSkeleton() {
  return <div className="space-y-6" role="status" aria-label="جاري تحميل بيانات المورد"><span className="sr-only">جاري تحميل بيانات المورد</span><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="supplier-panel h-40 animate-pulse bg-muted/60" />)}</div><div className="grid gap-5 lg:grid-cols-2"><div className="supplier-panel h-72 animate-pulse bg-muted/60" /><div className="supplier-panel h-72 animate-pulse bg-muted/60" /></div></div>;
}

export function WorkspaceError({ error, retry }: { error: Error; retry: () => void }) {
  return <div role="alert" className="supplier-panel max-w-xl p-8 text-center"><h2 className="text-xl font-extrabold">تعذر عرض البيانات</h2><p className="mt-2 text-sm text-muted-foreground" data-testid="status-supplier-error">{error.message}</p><button type="button" data-testid="button-retry-supplier" onClick={retry} className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">إعادة المحاولة</button></div>;
}

export function EmptySection({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-9 text-center"><p className="font-bold">{title}</p><p className="mt-1 text-sm leading-7 text-muted-foreground">{detail}</p></div>;
}

export const formatCount = (value: number) => new Intl.NumberFormat("ar-SA").format(value);
export const formatRating = (value: number) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value);