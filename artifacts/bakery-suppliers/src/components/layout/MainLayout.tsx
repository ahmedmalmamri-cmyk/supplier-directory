import { ReactNode } from "react";
import { Link } from "wouter";
import { Menu, Search, X, Package, Users, Mail, FileText, UserPlus, Moon, Sun, UserRound, ShieldCheck, LayoutDashboard, MapPinned } from "lucide-react";
import { useState } from "react";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";
import { chooseTheme } from "@/lib/theme";

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    chooseTheme(nextTheme);
    setIsDark(nextTheme === "dark");
  };

  return <button type="button" onClick={toggleTheme} aria-label={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"} title={isDark ? "الوضع النهاري" : "الوضع الليلي"} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground md:h-10 md:w-10 md:rounded-xl">
    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
  </button>;
}

export function MainLayout({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const authLoading = buyerLoading || supplierLoading;
  const accountHref = user ? "/buyer/profile" : supplier ? "/supplier/dashboard" : "/login";
  const accountLabel = user?.fullName || supplier?.name || "دخول";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
                د
              </div>
              <span className="min-w-0 text-[11px] font-bold leading-4 sm:text-base md:text-lg">دليل موردي<br className="sm:hidden" /> المخابز والحلويات</span>
            </Link>
             <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-muted-foreground">
              <Link href="/suppliers" className="hover:text-foreground transition-colors">الموردين</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">انضم للدليل</Link>
               {supplier && !authLoading && <><Link href="/supplier/dashboard" data-testid="link-header-supplier-dashboard" className="hover:text-foreground transition-colors">لوحة المورد</Link><Link href="/supplier/market" data-testid="link-header-supplier-market" className="hover:text-foreground transition-colors">السوق</Link></>}
               {authLoading ? <span role="status" className="inline-flex items-center gap-2 text-muted-foreground"><span className="h-4 w-20 animate-pulse rounded bg-muted" /><span className="sr-only">جاري التحقق من الحساب</span></span> : <Link data-testid="link-account-desktop" href={accountHref} className="inline-flex max-w-48 items-center gap-1 hover:text-foreground transition-colors"><UserRound className="h-4 w-4 shrink-0" /><span className="truncate" data-testid="text-account-name">{accountLabel}</span></Link>}
              <Link href="/admin" aria-label="دخول لوحة الإدارة" title="لوحة الإدارة" className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ShieldCheck className="h-4 w-4" /> الإدارة</Link>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/search" aria-label="البحث عن منتج أو مورد" title="البحث" className="hidden h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted sm:flex">
              <Search className="h-5 w-5" />
            </Link>
            <ThemeToggle />
            <button 
              aria-label={isMobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="md:hidden border-b bg-card">
          <nav className="flex flex-col gap-1 p-3 text-sm font-medium">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><Package className="h-4 w-4"/> الرئيسية</Link>
            <Link href="/suppliers" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><Users className="h-4 w-4"/> الموردون</Link>
            <Link href="/search" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><Search className="h-4 w-4"/> البحث</Link>
             {supplier && !authLoading && <><Link href="/supplier/dashboard" data-testid="link-mobile-supplier-dashboard" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><LayoutDashboard className="h-4 w-4"/> لوحة المورد</Link><Link href="/supplier/market" data-testid="link-mobile-supplier-market" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><MapPinned className="h-4 w-4"/> السوق</Link><Link href="/supplier/portal" data-testid="link-mobile-supplier-portal" onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><FileText className="h-4 w-4"/> التواصل والبلاغات</Link></>}
             {authLoading ? <span role="status" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-muted-foreground"><span className="h-4 w-24 animate-pulse rounded bg-muted" /> جاري التحقق من الحساب</span> : <Link data-testid="link-account-mobile" href={accountHref} onClick={() => setIsMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted"><UserRound className="h-4 w-4"/><span className="truncate">{accountLabel}</span></Link>}
            <Link href="/register" onClick={() => setIsMobileMenuOpen(false)} className="mt-1 flex min-h-11 items-center gap-3 rounded-xl bg-primary px-3 py-2 font-extrabold text-primary-foreground hover:bg-primary/90"><UserPlus className="h-4 w-4"/> انضم للدليل</Link>
            <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="mt-2 flex min-h-11 items-center gap-3 border-t border-border px-3 pt-3 text-xs font-bold text-muted-foreground hover:text-foreground"><ShieldCheck className="h-4 w-4"/> دخول الإدارة</Link>
          </nav>
        </div>
      )}

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t bg-muted/30 pt-12 pb-8 mt-auto">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                د
              </div>
              <span className="font-bold text-lg">دليل موردي المخابز والحلويات</span>
            </Link>
             <p className="text-muted-foreground text-sm font-medium max-w-sm leading-7 mb-4">
              منصة تجمع بين أصحاب المخابز والحلويات والمقاهي والموردين المتخصصين في قطاع الإمدادات.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-4">روابط سريعة</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/suppliers" className="hover:text-foreground">تصفح الموردين</Link></li>
              <li><Link href="/search" className="hover:text-foreground">البحث عن منتج أو مورد</Link></li>
              <li><Link href="/about" className="hover:text-foreground">من نحن</Link></li>
              <li><Link href="/expansion" className="hover:text-foreground">خطة التوسع</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4">الدعم</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/contact" className="hover:text-foreground flex items-center gap-2"><Mail className="w-3 h-3"/> اتصل بنا</Link></li>
              <li><Link href="/terms" className="hover:text-foreground flex items-center gap-2"><FileText className="w-3 h-3"/> الشروط والأحكام</Link></li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 border-t pt-6 text-center text-sm text-muted-foreground">
          جميع الحقوق محفوظة &copy; {new Date().getFullYear()} دليل موردي المخابز والحلويات
        </div>
      </footer>
    </div>
  );
}
