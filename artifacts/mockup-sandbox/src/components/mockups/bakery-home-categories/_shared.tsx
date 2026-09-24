import { Building2, ChevronLeft, Menu, Moon, Plus, Search, Sun, Wheat } from "lucide-react";
import "./_group.css";

export type ThemeMode = "light" | "dark";

const homeCategories = [
  { id: 1, name: "دقيق", icon: "🥖", filter: "دقيق" },
  { id: 3, name: "سكر", icon: "🍰", filter: "سكر" },
  { id: 4, name: "زبدة ودهون", icon: "🧈", filter: "زبدة ودهون" },
  { id: 7, name: "حليب ومشتقاته", icon: "🥛", filter: "حليب ومشتقاته" },
  { id: 8, name: "أجبان", icon: "🧀", filter: "أجبان" },
  { id: 11, name: "شوكولاتة وكاكاو", icon: "🍫", filter: "شوكولاتة وكاكاو" },
  { id: 15, name: "مكسرات", icon: "🥜", filter: "مكسرات" },
  { id: 19, name: "خمائر ومحسنات", icon: "🧪", filter: "خمائر ومحسنات" },
  { id: 20, name: "نكهات وألوان", icon: "🍯", filter: "نكهات وألوان" },
  { id: 14, name: "خلطات جاهزة", icon: "🍰", filter: "خلطات جاهزة" },
  { id: 27, name: "تغليف وعلب", icon: "📦", filter: "تغليف وعلب" },
  { id: 31, name: "معدات وأدوات", icon: "⚙️", filter: "معدات وأدوات" },
];

function PreviewHeader({ mode }: { mode: ThemeMode }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4">
        <a href="#" onClick={(event) => event.preventDefault()} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">د</span>
          <span className="max-w-[135px] truncate text-xs font-bold sm:max-w-none sm:text-lg">دليل موردي المخابز والحلويات</span>
        </a>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="فتح القائمة" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" aria-label={mode === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            {mode === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <a href="#" onClick={(event) => event.preventDefault()} aria-label="البحث" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground">
            <Search className="h-5 w-5" />
          </a>
        </div>
      </div>
    </header>
  );
}

function SearchBar({ refined = false }: { refined?: boolean }) {
  return (
    <form onSubmit={(event) => event.preventDefault()} className={`relative ${refined ? "mt-6 max-w-2xl" : "mx-4 mt-4"}`}>
      <input
        type="search"
        placeholder="ابحث باسم المورد أو المنتج..."
        className={`w-full rounded-2xl border bg-card text-foreground outline-none placeholder:text-muted-foreground ${refined ? "h-14 border-border px-5 pl-16 shadow-lg" : "h-16 border-border/80 px-5 pl-16 shadow-warm-lg backdrop-blur-sm"}`}
      />
      <button type="submit" aria-label="بحث" className={`absolute left-2 top-2 flex items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 ${refined ? "h-10 w-10" : "h-12 w-12"}`}>
        <Search className="h-5 w-5" />
      </button>
    </form>
  );
}

export function CurrentCategoriesPreview({ mode }: { mode: ThemeMode }) {
  return (
    <div className={`preview-root min-h-[100dvh] bg-background text-foreground ${mode === "dark" ? "dark" : ""}`}>
      <PreviewHeader mode={mode} />
      <main>
        <section className="relative isolate min-h-[calc(100dvh-5rem)] overflow-hidden bg-[#f0e4d2] dark:bg-[#241812]">
          <img src="/__mockup/images/bakery-hero.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-50 dark:opacity-75" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(250,246,239,.82)_8%,rgba(250,246,239,.62)_48%,rgba(250,246,239,.24)_100%)] dark:bg-[linear-gradient(90deg,rgba(29,20,16,.96)_8%,rgba(29,20,16,.78)_48%,rgba(29,20,16,.2)_100%)]" />
          <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-4">
            <SearchBar />
            <section className="mx-4 mt-7 max-w-2xl" aria-labelledby="current-category-heading">
              <h2 id="current-category-heading" className="mb-3 text-sm font-extrabold">تصفح حسب نوع المورد</h2>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {homeCategories.map((category) => (
                  <a
                    key={category.id}
                    href={`/suppliers?category=${encodeURIComponent(category.filter)}`}
                    onClick={(event) => event.preventDefault()}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-card/85 px-3 py-2 text-center text-sm font-bold text-primary shadow-sm transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <span aria-hidden="true" className="text-lg">{category.icon}</span>
                    <span>{category.name}</span>
                  </a>
                ))}
              </div>
              <a href="/suppliers" onClick={(event) => event.preventDefault()} className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card/90 px-4 py-2.5 text-sm font-extrabold text-primary">
                <Plus className="h-4 w-4" />
                عرض كل الأصناف (32)
              </a>
            </section>
            <a href="/register/supplier" onClick={(event) => event.preventDefault()} className="mx-4 mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-sm">
              <Building2 className="h-4 w-4" />
              أنا مورد — سجّل نشاطك في الدليل
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

export function RefinedCategoriesPreview({ mode }: { mode: ThemeMode }) {
  return (
    <div className={`preview-root min-h-[100dvh] bg-background text-foreground ${mode === "dark" ? "dark" : ""}`}>
      <PreviewHeader mode={mode} />
      <main>
        <section className="relative isolate overflow-hidden border-b border-border bg-background">
          <img
            src="/__mockup/images/bakery-hero.jpg"
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-30 dark:opacity-20"
          />
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: mode === "dark"
                ? "linear-gradient(90deg, hsl(24 18% 8% / .97) 0%, hsl(24 18% 8% / .93) 56%, hsl(24 18% 8% / .84) 100%)"
                : "linear-gradient(90deg, hsl(40 38% 98% / .97) 0%, hsl(40 38% 98% / .93) 56%, hsl(40 38% 98% / .84) 100%)",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-14">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1.5 text-xs font-bold text-primary shadow-sm">
              <Wheat className="h-4 w-4" />
              دليل موثوق للمنطقة الشرقية
            </p>
            <h1 className="max-w-2xl text-balance text-3xl font-extrabold leading-tight md:text-5xl">
              ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات
            </h1>
            <p className="mt-2 text-lg font-bold text-primary">في المنطقة الشرقية</p>
            <SearchBar refined />
          </div>
        </section>

        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 py-6 md:py-10">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-bold text-primary">اختصارات شائعة</p>
                <h2 className="text-xl font-extrabold md:text-2xl">تصفح حسب نوع المورد</h2>
                <p className="mt-1 text-xs text-muted-foreground md:text-sm">اختر صنفاً للانتقال مباشرةً إلى الموردين المتخصصين.</p>
              </div>
              <a href="/suppliers" onClick={(event) => event.preventDefault()} className="hidden shrink-0 items-center gap-1 text-sm font-bold text-primary sm:inline-flex">
                كل التصنيفات <ChevronLeft className="h-4 w-4" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {homeCategories.map((category) => (
                <a
                  key={category.id}
                  href={`/suppliers?category=${encodeURIComponent(category.filter)}`}
                  onClick={(event) => event.preventDefault()}
                  className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl transition-colors group-hover:bg-primary/15" aria-hidden="true">
                    {category.icon}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-extrabold leading-5 md:text-sm">{category.name}</span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </a>
              ))}
            </div>
            <a href="/suppliers" onClick={(event) => event.preventDefault()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-card px-4 py-2.5 text-sm font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:w-auto">
              <Plus className="h-4 w-4" />
              عرض جميع التصنيفات (32)
            </a>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold">هل أنت مورد؟</p>
                <p className="text-xs text-muted-foreground">أضف نشاطك ليصل إليه أصحاب المخابز والحلويات.</p>
              </div>
              <a href="/register/supplier" onClick={(event) => event.preventDefault()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-sm transition hover:brightness-95">
                <Building2 className="h-4 w-4" />
                سجّل نشاطك في الدليل
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}