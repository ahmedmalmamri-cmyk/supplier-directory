import { ArrowLeft, BadgeCheck, Building2, ChevronLeft, MapPin, Package, Search, ShieldCheck, Star, Store, Users, Wheat, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useGetHome, useGetSupplier, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { ProtectedWhatsAppButton } from "@/components/whatsapp/protected-whatsapp-button";
import { useMemo, useState } from "react";

function InitialBadge({ name, featured = false }: { name: string; featured?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-2xl border-4 border-background font-extrabold shadow-sm ${featured ? "h-20 w-20 bg-accent text-3xl text-accent-foreground shadow-accent/20" : "h-14 w-14 bg-primary/10 text-xl text-primary"}`} aria-hidden="true">{name.slice(0, 1)}</div>;
}

function Rating({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-accent"><Star className="h-4 w-4 fill-current" />{value.toFixed(1)}</span>;
}

function ProductStrip({ products }: { products: Array<{ id: number; name: string; imageUrl?: string | null }> }) {
  if (!products.length) return <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/15 text-xs text-muted-foreground">صور المنتجات ستظهر هنا عند إضافتها</div>;
  return <div className="grid grid-cols-3 gap-2">{products.slice(0, 3).map((product) => <div key={product.id} className="aspect-square overflow-hidden rounded-xl bg-muted" title={product.name}>{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-primary/50"><Package className="h-6 w-6" /></div>}</div>)}</div>;
}

export default function Home() {
  const { data: homeData, isLoading, error } = useGetHome();
  const { data: suppliers, isLoading: suppliersLoading, error: suppliersError } = useListSuppliers({ sort: "rating" });
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const allSuppliers = suppliers ?? [];
  const featured = (homeData?.featuredSuppliers ?? []).slice(0, 3);
  const featuredIds = new Set(featured.map((supplier) => supplier.id));
  const otherSuppliers = allSuppliers.filter((supplier) => !featuredIds.has(supplier.id));
  const statItems: Array<{ label: string; value: number | string; Icon: LucideIcon }> = [
    { label: "الموردون", value: homeData?.stats.suppliers ?? 0, Icon: Building2 },
    { label: "المدن", value: homeData?.stats.cities ?? 0, Icon: MapPin },
    { label: "المنتجات", value: homeData?.stats.products ?? 0, Icon: Package },
    { label: "التقييمات", value: homeData?.stats.reviews ?? 0, Icon: Star },
  ];
  const productsBySupplier = useMemo(() => new Map((homeData?.latestProducts ?? []).reduce<Array<[number, Array<{ id: number; name: string; imageUrl?: string | null }>]>>((groups, product) => {
    const current = groups.find(([supplierId]) => supplierId === product.supplierId);
    if (current) current[1].push(product);
    else groups.push([product.supplierId, [product]]);
    return groups;
  }, [])), [homeData?.latestProducts]);

  if (isLoading) return <MainLayout><LoadingSpinner className="min-h-[60vh]" /></MainLayout>;
  if (error || !homeData) return <MainLayout><div className="mx-auto min-h-[50vh] max-w-xl p-12 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><ShieldCheck className="h-7 w-7" /></div><h2 className="text-xl font-bold">تعذر تحميل الدليل</h2><p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة مرة أخرى.</p></div></MainLayout>;

  return (
    <MainLayout>
       <section className="relative isolate overflow-hidden bg-[#f0e4d2] dark:bg-[#241812]">
         <img src="/bakery-hero.jpg" alt="مواد أولية ومنتجات مخبوزة" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-50 dark:opacity-75" />
         <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(250,246,239,.82)_8%,rgba(250,246,239,.62)_48%,rgba(250,246,239,.24)_100%)] dark:bg-[linear-gradient(90deg,rgba(29,20,16,.96)_8%,rgba(29,20,16,.78)_48%,rgba(29,20,16,.2)_100%)]" />
        <div className="container mx-auto px-4 py-24 md:py-32">
           <div className="max-w-2xl animate-rise-in text-right text-foreground dark:text-[#fffaf1]">
             <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-card/75 px-4 py-2 text-sm font-semibold text-primary shadow-sm backdrop-blur-sm dark:border-[#e1b96a]/40 dark:bg-[#e1b96a]/10 dark:text-[#f2cf8a]"><Wheat className="h-4 w-4" /> دليل موثوق للمنطقة الشرقية</p>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.22] md:text-6xl">ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات</h1>
             <p className="mt-4 text-2xl font-semibold text-primary dark:text-[#f2cf8a]">في المنطقة الشرقية</p>
            <form onSubmit={handleSearch} className="relative mt-9 max-w-xl" data-testid="form-home-search">
               <input data-testid="input-home-search" type="search" placeholder="ابحث باسم المورد أو المنتج..." className="h-16 w-full rounded-2xl border border-border/80 bg-card/95 px-5 pl-16 text-base text-foreground shadow-warm-lg outline-none ring-0 backdrop-blur-sm placeholder:text-muted-foreground" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button data-testid="button-home-search" type="submit" className="absolute left-2 top-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5"><Search className="h-5 w-5" /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-7 px-4">
         <div className="container mx-auto grid max-w-5xl grid-cols-2 overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-warm backdrop-blur-sm md:grid-cols-4">
          {statItems.map(({ label, value, Icon }, index) => <div key={label} data-testid={`stat-${label}`} className={`flex items-center gap-3 px-5 py-5 md:px-7 ${index < 3 ? "border-l border-border" : ""}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-primary"><Icon className="h-5 w-5" /></span><div><div className="text-2xl font-extrabold text-foreground">{value}{typeof value === "number" ? "+" : ""}</div><div className="text-xs font-semibold text-muted-foreground">{label}</div></div></div>)}
        </div>
      </section>

       <section className="container mx-auto px-4 pt-16">
         <div className="grid gap-5 md:grid-cols-2">
           <Link href="/register/supplier" className="group rounded-3xl border border-primary/15 bg-card p-6 shadow-warm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-warm-lg">
             <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Wheat className="h-7 w-7" /></div>
             <h2 className="text-2xl font-extrabold">أنا مورد</h2>
             <p className="mt-2 font-medium text-muted-foreground">أريد عرض منتجاتي في الدليل</p>
             <span className="mt-6 inline-flex items-center gap-2 font-bold text-primary">سجّل كمورد <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></span>
           </Link>
           <Link href="/register/buyer" className="group rounded-3xl border border-accent/35 bg-gradient-to-br from-card to-secondary/25 p-6 shadow-warm transition-all hover:-translate-y-1 hover:border-accent/60 hover:shadow-warm-lg">
             <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Store className="h-7 w-7" /></div>
             <h2 className="text-2xl font-extrabold">أنا صاحب عمل</h2>
             <p className="mt-2 font-medium text-muted-foreground">أبحث عن موردين لموادي الأولية</p>
             <span className="mt-6 inline-flex items-center gap-2 font-bold text-primary">سجّل كصاحب عمل <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></span>
           </Link>
         </div>
       </section>

       <section className="container mx-auto px-4 pb-8 pt-20">
         <div className="relative overflow-hidden rounded-[2rem] border border-accent/20 bg-gradient-to-br from-accent/10 via-card to-secondary/20 p-5 shadow-warm md:p-8">
           <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full border-[28px] border-accent/10" />
           <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full border-[32px] border-primary/5" />
           <div className="relative mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
             <div>
               <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-extrabold text-accent"><BadgeCheck className="h-4 w-4" /> اختيارات الدليل</p>
               <h2 className="text-3xl font-extrabold md:text-4xl">الموردون المميزون</h2>
               <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">موردون مختارون بعناية لسهولة الوصول إلى المنتجات والخدمات الموثوقة.</p>
             </div>
             <Link href="/suppliers" data-testid="link-featured-all" className="inline-flex items-center gap-1 self-start text-sm font-bold text-primary transition-all hover:gap-2 sm:self-auto">استكشف الدليل <ArrowLeft className="h-4 w-4" /></Link>
           </div>
           {featured.length ? <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-3">{featured.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} featured products={productsBySupplier.get(supplier.id) ?? []} />)}</div> : <EmptySuppliers text="سيظهر الموردون المميزون هنا بعد اعتمادهم." />}
         </div>
      </section>

      <section className="container mx-auto px-4 py-12">
         <div className="mb-8 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-primary">دليل المنطقة</p><h2 className="text-3xl font-extrabold md:text-4xl">بقية الموردين</h2><p className="mt-2 text-sm text-muted-foreground">قارن بين الموردين واعثر على الأنسب لاحتياجك.</p></div><Link href="/suppliers" data-testid="link-all-suppliers" className="flex items-center gap-1 text-sm font-bold text-primary hover:gap-2">تصفح القائمة <ArrowLeft className="h-4 w-4" /></Link></div>
         {suppliersLoading && !suppliers ? <div className="grid grid-cols-1 gap-5 md:grid-cols-3"><div className="h-72 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div> : suppliersError ? <EmptySuppliers text="تعذر تحميل قائمة الموردين. حاول تحديث الصفحة." /> : otherSuppliers.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{otherSuppliers.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} products={productsBySupplier.get(supplier.id) ?? []} />)}</div> : <EmptySuppliers text="لا يوجد موردون آخرون في الدليل حالياً." />}
      </section>

      <section className="container mx-auto px-4 pb-20 pt-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-warm-lg md:px-12 md:py-14">
          <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[32px] border-secondary/20" />
          <div className="relative flex flex-col items-start justify-between gap-7 md:flex-row md:items-center"><div><p className="mb-2 text-sm font-bold text-secondary">هل تورد للمخابز والحلويات؟</p><h2 className="text-2xl font-extrabold md:text-3xl">عرّف أصحاب الأعمال بمنتجاتك</h2><p className="mt-2 max-w-xl text-sm font-medium leading-8 text-primary-foreground/90">انضم إلى دليل متخصص يساعدك على الوصول إلى العملاء في المنطقة الشرقية.</p></div><div className="flex flex-wrap gap-3"><Link href="/register/supplier" data-testid="link-register-supplier" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-secondary px-6 py-3 font-extrabold text-secondary-foreground transition-transform hover:-translate-y-0.5">سجّل كمورد <ChevronLeft className="h-4 w-4" /></Link><Link href="/register/buyer" data-testid="link-register-business-owner" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-6 py-3 font-extrabold text-primary-foreground transition-colors hover:bg-primary-foreground/20">سجّل كصاحب عمل <ChevronLeft className="h-4 w-4" /></Link></div></div>
        </div>
      </section>
    </MainLayout>
  );
}

function SupplierCard({ supplier, products, featured = false }: { supplier: { id: number; name: string; city: string; description: string; averageRating: number; isVerified: boolean; whatsapp?: string | null }; products: Array<{ id: number; name: string; imageUrl?: string | null }>; featured?: boolean }) {
  const { data: supplierDetails } = useGetSupplier(supplier.id);
  const cardProducts = supplierDetails?.products.slice(0, 3) ?? products.slice(0, 3);
  const hasWhatsApp = Boolean(buildWhatsAppUrl(supplier.whatsapp));
  return <article key={supplier.id} data-testid={`card-supplier-${supplier.id}`} className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${featured ? "min-h-[34rem] rounded-3xl border-accent/55 bg-card p-5 shadow-[0_18px_45px_-24px_hsl(var(--accent))] ring-1 ring-accent/20 hover:shadow-[0_24px_55px_-24px_hsl(var(--accent))] md:p-6" : "border-border bg-card p-4 shadow-sm hover:border-primary/30 hover:shadow-warm"}`}>
    {featured && <div className="mb-5 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-extrabold text-accent"><BadgeCheck className="h-4 w-4" /> مورد مميز في الدليل</span><span className="rounded-full border border-accent/25 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">اختيار موصى به</span></div>}
    <Link href={`/supplier/${supplier.id}`} className="block min-w-0">
      <div className={`flex items-start ${featured ? "gap-4" : "gap-3"}`}><InitialBadge name={supplier.name} featured={featured} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className={`${featured ? "text-xl" : "text-lg"} truncate font-extrabold`}>{supplier.name}</h3>{supplier.isVerified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}</div><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {supplier.city}</p>{featured && <p className="mt-2 text-xs font-bold text-accent">مورد موثق ضمن اختيارات الدليل</p>}</div></div>
      <p className={`line-clamp-2 text-sm leading-6 text-muted-foreground ${featured ? "mt-5 min-h-12" : "mt-3 min-h-10"}`}>{supplier.description}</p>
      <div className={`flex items-center justify-between border-y border-border/70 py-3 ${featured ? "mt-4" : "mt-3"}`}><Rating value={supplier.averageRating} /><span className="text-xs font-bold text-muted-foreground">ملف المورد</span></div>
      <div className={featured ? "mt-4" : "mt-3"}><ProductStrip products={cardProducts} /></div>
    </Link>
    <div className={`${featured ? "mt-5" : "mt-3"} grid grid-cols-2 gap-2`}>
      <Link href={`/supplier/${supplier.id}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2.5 text-xs font-extrabold text-primary transition-colors hover:bg-primary/15">عرض الملف <ArrowLeft className="h-3.5 w-3.5" /></Link>
       {hasWhatsApp ? <ProtectedWhatsAppButton supplierId={supplier.id} supplierName={supplier.name} hasWhatsApp={hasWhatsApp} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#287d56] px-3 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-[#216a49] disabled:cursor-not-allowed disabled:opacity-60" label="واتساب" /> : <span className="inline-flex items-center justify-center rounded-xl bg-muted px-3 py-2.5 text-xs font-bold text-muted-foreground">لا يوجد واتساب</span>}
    </div>
  </article>;
}

function EmptySuppliers({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-primary/50" /><p className="text-sm text-muted-foreground">{text}</p></div>;
}
