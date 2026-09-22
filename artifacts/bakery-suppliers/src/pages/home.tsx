import { ArrowLeft, BadgeCheck, Building2, ChevronLeft, MapPin, Package, Search, ShieldCheck, Star, Users, Wheat, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useGetHome, useGetSupplier, useListSuppliers } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useMemo, useState } from "react";

function InitialBadge({ name, featured = false }: { name: string; featured?: boolean }) {
  return <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-background text-xl font-extrabold shadow-sm ${featured ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"}`} aria-hidden="true">{name.slice(0, 1)}</div>;
}

function Rating({ value }: { value: number }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-accent"><Star className="h-4 w-4 fill-current" />{value.toFixed(1)}</span>;
}

function ProductStrip({ products }: { products: Array<{ id: number; name: string; imageUrl?: string | null }> }) {
  if (!products.length) return <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">صور المنتجات ستظهر هنا عند إضافتها</div>;
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
       <section className="relative isolate overflow-hidden bg-[#f3eadc] dark:bg-[#241812]">
         <img src="/bakery-hero.jpg" alt="مواد أولية ومنتجات مخبوزة" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-25 dark:opacity-70" />
         <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(250,246,239,.98)_8%,rgba(250,246,239,.88)_48%,rgba(250,246,239,.45)_100%)] dark:bg-[linear-gradient(90deg,rgba(29,20,16,.96)_8%,rgba(29,20,16,.78)_48%,rgba(29,20,16,.2)_100%)]" />
        <div className="container mx-auto px-4 py-24 md:py-32">
           <div className="max-w-2xl animate-rise-in text-right text-foreground dark:text-[#fffaf1]">
             <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary dark:border-[#e1b96a]/40 dark:bg-[#e1b96a]/10 dark:text-[#f2cf8a]"><Wheat className="h-4 w-4" /> دليل موثوق للمنطقة الشرقية</p>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.22] md:text-6xl">ابحث عن أفضل موردي المواد الأولية للمخابز والحلويات</h1>
             <p className="mt-4 text-2xl font-semibold text-primary dark:text-[#f2cf8a]">في المنطقة الشرقية</p>
            <form onSubmit={handleSearch} className="relative mt-9 max-w-xl" data-testid="form-home-search">
               <input data-testid="input-home-search" type="search" placeholder="ابحث باسم المورد أو المنتج..." className="h-16 w-full rounded-2xl border border-border bg-card px-5 pl-16 text-base text-foreground shadow-warm-lg outline-none ring-0 placeholder:text-muted-foreground" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button data-testid="button-home-search" type="submit" className="absolute left-2 top-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5"><Search className="h-5 w-5" /></button>
            </form>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-7 px-4">
        <div className="container mx-auto grid max-w-5xl grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-warm md:grid-cols-4">
          {statItems.map(({ label, value, Icon }, index) => <div key={label} data-testid={`stat-${label}`} className={`flex items-center gap-3 px-5 py-5 md:px-7 ${index < 3 ? "border-l border-border" : ""}`}><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/30 text-primary"><Icon className="h-5 w-5" /></span><div><div className="text-2xl font-extrabold text-foreground">{value}{typeof value === "number" ? "+" : ""}</div><div className="text-xs font-semibold text-muted-foreground">{label}</div></div></div>)}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8 pt-20">
        <div className="mb-8 flex items-end justify-between gap-4">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-accent">اختيارات الدليل</p><h2 className="text-3xl font-extrabold md:text-4xl">الموردون المميزون</h2></div>
            <Link href="/suppliers" data-testid="link-featured-all" className="hidden items-center gap-1 text-sm font-bold text-primary hover:gap-2 sm:flex">عرض كل الموردين <ArrowLeft className="h-4 w-4" /></Link>
        </div>
        {featured.length ? <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">{featured.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} featured products={productsBySupplier.get(supplier.id) ?? []} />)}</div> : <EmptySuppliers text="سيظهر الموردون المميزون هنا بعد اعتمادهم." />}
      </section>

      <section className="container mx-auto px-4 py-12">
        <div className="mb-8 flex items-end justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-primary">دليل المنطقة</p><h2 className="text-3xl font-extrabold md:text-4xl">كل الموردين</h2></div><Link href="/suppliers" data-testid="link-all-suppliers" className="flex items-center gap-1 text-sm font-bold text-primary hover:gap-2">تصفح القائمة <ArrowLeft className="h-4 w-4" /></Link></div>
        {suppliersLoading && !suppliers ? <div className="grid grid-cols-1 gap-5 md:grid-cols-3"><div className="h-80 animate-pulse rounded-2xl bg-muted" /><div className="h-80 animate-pulse rounded-2xl bg-muted" /><div className="h-80 animate-pulse rounded-2xl bg-muted" /></div> : suppliersError ? <EmptySuppliers text="تعذر تحميل قائمة الموردين. حاول تحديث الصفحة." /> : allSuppliers.length ? <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{allSuppliers.map((supplier) => <SupplierCard key={supplier.id} supplier={supplier} products={productsBySupplier.get(supplier.id) ?? []} />)}</div> : <EmptySuppliers text="لا يوجد موردون معتمدون في الدليل حالياً." />}
      </section>

      <section className="container mx-auto px-4 pb-20 pt-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-warm-lg md:px-12 md:py-14">
          <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full border-[32px] border-secondary/20" />
          <div className="relative flex flex-col items-start justify-between gap-7 md:flex-row md:items-center"><div><p className="mb-2 text-sm font-semibold text-secondary">هل تورد للمخابز والحلويات؟</p><h2 className="text-2xl font-extrabold md:text-3xl">عرّف أصحاب الأعمال بمنتجاتك</h2><p className="mt-2 max-w-xl text-sm leading-7 text-primary-foreground/75">انضم إلى دليل متخصص يساعدك على الوصول إلى العملاء في المنطقة الشرقية.</p></div><Link href="/register" data-testid="link-register-supplier" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-secondary px-6 py-3 font-extrabold text-secondary-foreground transition-transform hover:-translate-y-0.5">سجّل كمورد <ChevronLeft className="h-4 w-4" /></Link></div>
        </div>
      </section>
    </MainLayout>
  );
}

function SupplierCard({ supplier, products, featured = false }: { supplier: { id: number; name: string; city: string; description: string; averageRating: number; isVerified: boolean }; products: Array<{ id: number; name: string; imageUrl?: string | null }>; featured?: boolean }) {
  const { data: supplierDetails } = useGetSupplier(supplier.id);
  const cardProducts = supplierDetails?.products.slice(0, 3) ?? products.slice(0, 3);
  return <Link key={supplier.id} href={`/supplier/${supplier.id}`} data-testid={`card-supplier-${supplier.id}`} className={`group flex flex-col overflow-hidden rounded-2xl border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-warm-lg ${featured ? "border-accent/55 ring-1 ring-accent/20" : "border-border hover:border-primary/30"}`}>
    {featured && <div className="mb-4 flex items-center gap-2 text-xs font-extrabold text-accent"><BadgeCheck className="h-4 w-4" /> مورد مميز في الدليل</div>}
    <div className="flex items-start gap-4"><InitialBadge name={supplier.name} featured={featured} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-lg font-extrabold">{supplier.name}</h3>{supplier.isVerified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}</div><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {supplier.city}</p></div></div>
    <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">{supplier.description}</p>
    <div className="mt-4 flex items-center justify-between border-y border-border/70 py-3"><Rating value={supplier.averageRating} /><span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary">عرض الملف <ArrowLeft className="h-3.5 w-3.5" /></span></div>
     <div className="mt-4"><ProductStrip products={cardProducts} /></div>
  </Link>;
}

function EmptySuppliers({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-primary/50" /><p className="text-sm text-muted-foreground">{text}</p></div>;
}
