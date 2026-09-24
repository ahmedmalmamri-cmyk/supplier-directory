import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpLeft,
  Box,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  CookingPot,
  Droplets,
  Egg,
  FlaskConical,
  Leaf,
  Menu,
  Package,
  Search,
  Sun,
  Wheat,
  X,
} from "lucide-react";

type IngredientCategory = {
  name: string;
  suppliers: number;
};

type IngredientFamily = {
  id: string;
  title: string;
  description: string;
  icon: typeof Wheat;
  tone: string;
  categories: IngredientCategory[];
};

const families: IngredientFamily[] = [
  {
    id: "grains",
    title: "الحبوب والعجين",
    description: "من الدقيق إلى الخمائر — أساس كل وصفة ناجحة.",
    icon: Wheat,
    tone: "#49644b",
    categories: [
      { name: "دقيق", suppliers: 18 },
      { name: "خمائر ومحسنات", suppliers: 12 },
      { name: "خلطات جاهزة", suppliers: 9 },
      { name: "سميد ونخالة", suppliers: 6 },
      { name: "حبوب كاملة", suppliers: 5 },
      { name: "بدائل خالية من الغلوتين", suppliers: 4 },
      { name: "نشا ومكثفات", suppliers: 7 },
    ],
  },
  {
    id: "dairy",
    title: "الألبان والدهون",
    description: "قوام غني ومكونات طازجة للمخبوزات والحلويات.",
    icon: Droplets,
    tone: "#52748a",
    categories: [
      { name: "زبدة ودهون", suppliers: 14 },
      { name: "حليب ومشتقاته", suppliers: 11 },
      { name: "أجبان", suppliers: 8 },
      { name: "قشطة وكريمة", suppliers: 6 },
      { name: "بيض ومنتجاته", suppliers: 7 },
      { name: "زيوت نباتية", suppliers: 10 },
    ],
  },
  {
    id: "sweet",
    title: "التحلية والنكهات",
    description: "لمسات أخيرة تصنع فرقاً واضحاً في كل قطعة.",
    icon: FlaskConical,
    tone: "#a76746",
    categories: [
      { name: "سكر", suppliers: 16 },
      { name: "شوكولاتة وكاكاو", suppliers: 13 },
      { name: "مكسرات", suppliers: 10 },
      { name: "نكهات وألوان", suppliers: 8 },
      { name: "عسل ومحليات", suppliers: 6 },
      { name: "دبس وشراب", suppliers: 5 },
      { name: "تمور وفواكه مجففة", suppliers: 9 },
      { name: "مربى وحشوات", suppliers: 7 },
    ],
  },
  {
    id: "workshop",
    title: "مستلزمات المخبز",
    description: "كل ما يحتاجه فريقك من التحضير حتى التسليم.",
    icon: CookingPot,
    tone: "#8c7548",
    categories: [
      { name: "تغليف وعلب", suppliers: 15 },
      { name: "معدات وأدوات", suppliers: 12 },
      { name: "صواني وقوالب", suppliers: 8 },
      { name: "أفران وتجهيزات", suppliers: 6 },
      { name: "أدوات تزيين", suppliers: 9 },
      { name: "ورق خبز ومواد تشغيل", suppliers: 7 },
      { name: "موازين وقياس", suppliers: 5 },
      { name: "سلامة ونظافة", suppliers: 4 },
      { name: "تبريد وتخزين", suppliers: 6 },
      { name: "مستلزمات عرض", suppliers: 5 },
      { name: "أكياس وملصقات", suppliers: 8 },
    ],
  },
];

const visibleByDefault = 3;

export function IngredientFamilyGroups() {
  const [query, setQuery] = useState("");
  const [expandedFamilies, setExpandedFamilies] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [supplierPanelOpen, setSupplierPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  const filteredFamilies = useMemo(
    () =>
      families
        .map((family) => ({
          ...family,
          categories: normalizedQuery
            ? family.categories.filter((category) =>
                category.name.toLocaleLowerCase("ar").includes(normalizedQuery),
              )
            : family.categories,
        }))
        .filter((family) => !normalizedQuery || family.categories.length > 0),
    [normalizedQuery],
  );

  const toggleFamily = (id: string) => {
    setExpandedFamilies((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const totalCategories = families.reduce((sum, family) => sum + family.categories.length, 0);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-[#f6f3eb] text-[#26382d]">
      <header className="sticky top-0 z-30 border-b border-[#dedfd4] bg-[#fbfaf6]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-4 sm:px-7">
          <a
            href="#top"
            onClick={(event) => event.preventDefault()}
            className="flex items-center gap-3"
            aria-label="دليل موردي المخابز والحلويات"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#31533f] text-[#f8f1df] shadow-[0_4px_12px_rgba(49,83,63,0.16)]">
              <Wheat className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold sm:text-base">دليل المخابز</span>
              <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-[#758176] sm:text-[11px]">
                مورّدون يعرفون المهنة
              </span>
            </span>
          </a>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#536254] transition hover:bg-[#eeeee5] md:hidden"
            >
              <Menu className="h-[19px] w-[19px]" />
            </button>
            <nav className={`${menuOpen ? "absolute inset-x-4 top-[64px] flex flex-col rounded-2xl border border-[#dedfd4] bg-[#fbfaf6] p-2 shadow-lg md:static md:flex-row md:border-0 md:bg-transparent md:p-0 md:shadow-none" : "hidden md:flex"} items-center gap-1`}>
              <a href="#families" className="rounded-full px-4 py-2 text-sm font-bold text-[#526252] hover:bg-[#eeeee5]">
                تصفح المكونات
              </a>
              <button
                type="button"
                onClick={() => setSupplierPanelOpen(true)}
                className="rounded-full px-4 py-2 text-sm font-bold text-[#526252] hover:bg-[#eeeee5]"
              >
                للموردين
              </button>
            </nav>
            <span className="mx-1 hidden h-6 w-px bg-[#dedfd4] sm:block" />
            <button
              type="button"
              aria-label="الوضع النهاري مفعّل"
              title="الوضع النهاري"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e4e2d9] bg-[#f5f0df] text-[#9b7737]"
            >
              <Sun className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative isolate overflow-hidden border-b border-[#e5e0d4] bg-[#e6e5d8]">
          <img
            src="/__mockup/images/bakery-hero.jpg"
            alt=""
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-[0.26]"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(246,243,235,0.99)_0%,rgba(246,243,235,0.96)_48%,rgba(246,243,235,0.7)_100%)]" />
          <div className="mx-auto grid max-w-[1240px] gap-7 px-4 py-8 sm:px-7 sm:py-11 md:grid-cols-[1fr_250px] md:items-center md:gap-10 md:py-14">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#cad4c6] bg-[#f9f8f2]/80 px-3 py-1.5 text-[11px] font-extrabold text-[#45664d]">
                <Leaf className="h-3.5 w-3.5" />
                دليل المكونات والموردين · المنطقة الشرقية
              </div>
              <h1 className="max-w-[700px] text-[32px] font-black leading-[1.24] tracking-[-0.045em] text-[#26382d] sm:text-[42px] md:text-[50px]">
                كل مكوّن له
                <br className="hidden sm:block" /> مورّده المناسب.
              </h1>
              <p className="mt-3 max-w-[590px] text-sm leading-7 text-[#667263] sm:text-base">
                ابدأ من عائلة المكوّنات، واكتشف موردي المخابز والحلويات مرتّبين بطريقة أقرب لشغل مطبخك.
              </p>
              <form
                className="relative mt-6 max-w-[610px]"
                onSubmit={(event) => event.preventDefault()}
                role="search"
              >
                <label className="sr-only" htmlFor="ingredient-search">
                  ابحث عن مكوّن أو مورد
                </label>
                <Search className="pointer-events-none absolute right-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-[#8b9688]" />
                <input
                  id="ingredient-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  type="search"
                  placeholder="ابحث عن مكوّن أو مورد..."
                  className="h-[54px] w-full rounded-[17px] border border-[#d9ded2] bg-[#fffefa]/95 pr-12 pl-14 text-sm text-[#26382d] shadow-[0_8px_28px_rgba(53,65,49,0.08)] outline-none transition focus:border-[#65816a] focus:ring-4 focus:ring-[#65816a]/10 placeholder:text-[#9ba196]"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="مسح البحث"
                    onClick={() => setQuery("")}
                    className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#7c887b] hover:bg-[#f0efe7]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {!query && (
                  <button
                    type="submit"
                    className="absolute left-2 top-1/2 flex h-10 -translate-y-1/2 items-center gap-2 rounded-xl bg-[#31533f] px-4 text-xs font-extrabold text-[#fbf8ed] transition hover:bg-[#264632]"
                  >
                    ابحث
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
              </form>
            </div>
            <aside className="hidden rounded-[22px] border border-[#d7d7c9] bg-[#f8f6ec]/90 p-5 shadow-[0_14px_36px_rgba(55,65,49,0.07)] md:block">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#e5eadf] text-[#527253]">
                  <Box className="h-[19px] w-[19px]" />
                </span>
                <span className="rounded-full bg-[#e9ede3] px-2.5 py-1 text-[10px] font-bold text-[#54705a]">دليل واحد</span>
              </div>
              <p className="mt-5 text-[34px] font-black leading-none tracking-tight text-[#31533f]">{totalCategories}</p>
              <p className="mt-2 text-sm font-extrabold">تصنيف متخصص</p>
              <p className="mt-1 text-xs leading-5 text-[#778172]">مقسّم حسب طبيعة المكوّن واحتياج المخبز.</p>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-[#6c7969]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#80996d]" />
                موردون من المنطقة الشرقية
              </div>
            </aside>
          </div>
        </section>

        <section id="families" className="mx-auto max-w-[1240px] px-4 pb-10 pt-8 sm:px-7 sm:pt-10">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-extrabold tracking-wide text-[#8d7952]">
                <span className="h-px w-5 bg-[#b8a47c]" />
                اختَر نقطة البداية
              </p>
              <h2 className="text-[23px] font-black tracking-[-0.035em] sm:text-[28px]">تصفّح حسب عائلة المكوّن</h2>
              <p className="mt-1.5 text-xs leading-5 text-[#788174] sm:text-sm">أصناف مرتّبة كما تظهر في قائمة مشتريات المخبز.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e1dfd4] bg-[#fbfaf6] px-3 py-2 text-[11px] font-bold text-[#687565]">
              <CircleHelp className="h-3.5 w-3.5 text-[#9b875e]" />
              4 عائلات · {totalCategories} تصنيفاً
            </span>
          </div>

          {selectedCategory && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cbd8c8] bg-[#edf2e9] px-4 py-3">
              <p className="text-sm font-bold text-[#355540]">
                اخترت: <span className="font-black">{selectedCategory}</span>
                <span className="mr-2 text-xs font-medium text-[#6c7d69]">— سنعرض لك الموردين المتخصصين بهذا الصنف.</span>
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[#5d715d] hover:bg-[#dfe8dc]"
              >
                إلغاء الاختيار <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {filteredFamilies.length > 0 ? (
            <div className="grid gap-3.5 md:grid-cols-2">
              {filteredFamilies.map((family, index) => {
                const FamilyIcon = family.icon;
                const expanded = expandedFamilies.includes(family.id) || Boolean(normalizedQuery);
                const categoriesToShow = expanded
                  ? family.categories
                  : family.categories.slice(0, visibleByDefault);
                const remainingCount = family.categories.length - visibleByDefault;

                return (
                  <article
                    key={family.id}
                    className={`group relative overflow-hidden rounded-[22px] border border-[#e2e0d6] bg-[#fbfaf6] p-4 shadow-[0_3px_10px_rgba(50,59,45,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-[#c9d2c3] hover:shadow-[0_12px_28px_rgba(50,59,45,0.08)] sm:p-5 ${index === 0 ? "md:row-span-1" : ""}`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px]"
                          style={{ backgroundColor: `${family.tone}14`, color: family.tone }}
                        >
                          <FamilyIcon className="h-[21px] w-[21px]" strokeWidth={1.8} />
                        </span>
                        <div className="pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-[16px] font-black tracking-[-0.02em]">{family.title}</h3>
                            <span className="rounded-full bg-[#f0efe7] px-2 py-0.5 text-[10px] font-bold text-[#818779]">
                              {family.categories.length} أصناف
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-[#7e8579]">{family.description}</p>
                        </div>
                      </div>
                      <span className="hidden pt-1 text-[10px] font-bold text-[#a0a496] sm:block">
                        {family.categories.reduce((sum, category) => sum + category.suppliers, 0)} مورد
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {categoriesToShow.map((category) => (
                        <button
                          key={category.name}
                          type="button"
                          onClick={() => setSelectedCategory(category.name)}
                          className={`flex min-h-[42px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7e977e]/40 ${
                            selectedCategory === category.name
                              ? "border-[#66816a] bg-[#edf2e9] text-[#31533f]"
                              : "border-[#e8e6dc] bg-[#fffefa] text-[#4d5b4d] hover:border-[#cad4c7] hover:bg-[#f5f7f0]"
                          }`}
                        >
                          <span className="text-[11px] font-extrabold leading-4 sm:text-xs">{category.name}</span>
                          <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[#9da496]" />
                        </button>
                      ))}
                    </div>

                    {!normalizedQuery && remainingCount > 0 && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleFamily(family.id)}
                        className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-extrabold text-[#57735b] transition hover:bg-[#eff2e9]"
                      >
                        {expanded ? "عرض أقل" : `+ ${remainingCount} أصناف أخرى`}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-[#d5d9cd] bg-[#fbfaf6] px-6 py-12 text-center">
              <Search className="mx-auto h-7 w-7 text-[#a4ad9d]" />
              <h3 className="mt-3 text-base font-extrabold">ما لقينا هذا الصنف</h3>
              <p className="mt-1 text-sm text-[#7c8578]">جرّب كلمة أقصر أو اسم عائلة مختلفة.</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 rounded-full bg-[#31533f] px-4 py-2 text-xs font-bold text-[#fbf8ed]"
              >
                مسح البحث
              </button>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-4 rounded-[22px] border border-[#dce0d4] bg-[#edf0e7] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#dce5d8] text-[#4c6b50]">
                <Egg className="h-[19px] w-[19px]" />
              </span>
              <div>
                <p className="text-sm font-black">ما لقيت الصنف الذي تبحث عنه؟</p>
                <p className="mt-1 text-xs leading-5 text-[#748071]">دليلنا يتوسّع باستمرار. أخبرنا بما تحتاجه.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSupplierPanelOpen(true)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#31533f] px-4 py-2 text-xs font-extrabold text-[#fbf8ed] transition hover:bg-[#264632]"
            >
              أنا مورد — أضف نشاطك
              <ArrowUpLeft className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      {supplierPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#1f2c22]/35 p-3 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSupplierPanelOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-panel-title"
            className="w-full max-w-md rounded-[24px] border border-[#e5e1d5] bg-[#fbfaf6] p-5 shadow-[0_24px_80px_rgba(28,41,30,0.24)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#e8ede3] text-[#45664d]">
                <Package className="h-5 w-5" />
              </span>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setSupplierPanelOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#737d70] hover:bg-[#efeee6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h2 id="supplier-panel-title" className="mt-4 text-xl font-black">خلّ أصحاب المخابز يلقونك</h2>
            <p className="mt-2 text-sm leading-6 text-[#737d70]">
              أضف نشاطك إلى دليل الموردين ليظهر ضمن عائلة المكونات المناسبة لمنتجاتك.
            </p>
            <div className="mt-5 rounded-2xl bg-[#f0efe7] p-4">
              <p className="text-xs font-extrabold text-[#566653]">التسجيل قريباً</p>
              <p className="mt-1 text-xs leading-5 text-[#818879]">نجهّز مساحة مخصصة لملفات الموردين في دليل المنطقة الشرقية.</p>
            </div>
            <button
              type="button"
              onClick={() => setSupplierPanelOpen(false)}
              className="mt-5 w-full rounded-xl bg-[#31533f] py-3 text-sm font-extrabold text-[#fbf8ed] hover:bg-[#264632]"
            >
              تمام، شكراً
            </button>
          </section>
        </div>
      )}

      <footer className="border-t border-[#e2dfd5] bg-[#f1efe6]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-5 text-[10px] font-semibold text-[#8a9083] sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <span>دليل موردي المخابز والحلويات · المنطقة الشرقية</span>
          <span>صُمّم لأصحاب المخابز والحلويات</span>
        </div>
      </footer>
    </div>
  );
}

export default IngredientFamilyGroups;