import { ReactNode } from "react";
import { Link } from "wouter";
import { Menu, Search, X, Package, Users, Mail, FileText, LayoutGrid, UserPlus, Rocket, ShieldCheck, Moon, Sun } from "lucide-react";
import { useState } from "react";

function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleTheme = () => {
    const nextTheme = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme === "dark" ? "only dark" : "only light";
    localStorage.setItem("bakery-theme", nextTheme);
    setIsDark(nextTheme === "dark");
  };

  return <button type="button" onClick={toggleTheme} aria-label={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"} title={isDark ? "الوضع النهاري" : "الوضع الليلي"} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
  </button>;
}

export function MainLayout({ children }: { children: ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                د
              </div>
              <span className="font-bold text-lg hidden sm:inline-block">دليل المخابز والحلويات</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">الرئيسية</Link>
              <a href="/#categories" className="hover:text-foreground transition-colors">التصنيفات</a>
              <Link href="/suppliers" className="hover:text-foreground transition-colors">الموردين</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">التسجيل</Link>
              <Link href="/contact" className="hover:text-foreground transition-colors">اتصل بنا</Link>
              <Link href="/admin" className="hover:text-foreground transition-colors">الإدارة</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/search" className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors transition-all focus:ring-2 ring-primary outline-none hidden sm:flex">
              <Search className="w-4 h-4" />
              <span>بحث عن منتج أو مورد...</span>
            </Link>
            <Link href="/search" className="p-2 text-muted-foreground hover:bg-muted rounded-md sm:hidden">
              <Search className="w-5 h-5" />
            </Link>
            <ThemeToggle />
            <button 
              className="p-2 text-muted-foreground hover:bg-muted rounded-md md:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="md:hidden border-b bg-card">
          <nav className="flex flex-col p-4 space-y-3 text-sm font-medium">
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><Package className="w-4 h-4"/> الرئيسية</Link>
            <a href="/#categories" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><LayoutGrid className="w-4 h-4"/> التصنيفات</a>
            <Link href="/suppliers" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><Users className="w-4 h-4"/> الموردين</Link>
            <Link href="/register" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><UserPlus className="w-4 h-4"/> التسجيل</Link>
            <Link href="/expansion" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><Rocket className="w-4 h-4"/> خطة التوسع</Link>
            <Link href="/contact" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><Mail className="w-4 h-4"/> اتصل بنا</Link>
            <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 p-2 hover:bg-muted rounded-md"><ShieldCheck className="w-4 h-4"/> الإدارة</Link>
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
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-4">
              منصة تجمع بين أصحاب المخابز والحلويات والمقاهي والموردين المتخصصين في قطاع الإمدادات.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-4">روابط سريعة</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/suppliers" className="hover:text-foreground">تصفح الموردين</Link></li>
              <li><Link href="/search" className="hover:text-foreground">البحث عن منتجات</Link></li>
              <li><Link href="/about" className="hover:text-foreground">من نحن</Link></li>
              <li><Link href="/expansion" className="hover:text-foreground">خطة التوسع</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4">الدعم</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/contact" className="hover:text-foreground flex items-center gap-2"><Mail className="w-3 h-3"/> اتصل بنا</Link></li>
              <li><Link href="/terms" className="hover:text-foreground flex items-center gap-2"><FileText className="w-3 h-3"/> الشروط والأحكام</Link></li>
              <li><Link href="/register" className="hover:text-foreground flex items-center gap-2"><UserPlus className="w-3 h-3"/> التسجيل</Link></li>
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
