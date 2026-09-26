import { Link } from "wouter";
import { ArrowUpLeft, BarChart3, MapPin, PackageSearch, Star, Store } from "lucide-react";
import { EmptySection, formatCount, formatRating, SupplierWorkspace, WorkspaceError, WorkspaceSkeleton } from "@/components/supplier/SupplierWorkspace";
import { useSupplierMarket } from "@/hooks/use-supplier-insights";

export default function SupplierMarketPage() {
  const { data, isPending, error, refetch } = useSupplierMarket();
  const highestDemand = Math.max(0, ...(data?.topDemand.map((item) => item.buyers) ?? []));
  return <SupplierWorkspace title="نبض السوق" eyebrow="السوق" subtitle="إشارات مجمّعة تساعدك على فهم الطلب وأماكن النقص، دون كشف بيانات أي صاحب عمل." error={error}>
    {isPending ? <WorkspaceSkeleton /> : error ? <WorkspaceError error={error} retry={() => void refetch()} /> : data && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>نظرة عامة على نشاط الأصناف والمدن في الدليل</span><span>البيانات مجمّعة وليست طلبات شراء مباشرة.</span></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="supplier-panel flex items-center gap-5 p-6"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Store className="h-6 w-6" /></div><div><p className="text-sm text-muted-foreground">الموردون في السوق</p><p className="mt-1 text-3xl font-extrabold" data-testid="text-market-supplier-count">{formatCount(data.supplierCount)}</p></div></div>
        <div className="supplier-panel flex items-center gap-5 p-6"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Star className="h-6 w-6" /></div><div><p className="text-sm text-muted-foreground">متوسط تقييم السوق</p><p className="mt-1 text-3xl font-extrabold" data-testid="text-market-average">{data.averageRating == null || data.supplierCount === 0 ? "غير متاح" : `${formatRating(data.averageRating)} / ٥`}</p></div></div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="supplier-panel p-5 md:p-7" aria-labelledby="demand-heading">
          <div className="flex items-start gap-3"><BarChart3 className="mt-1 h-5 w-5 text-primary" /><div><p className="text-xs font-bold text-primary">طلب السوق</p><h2 id="demand-heading" className="mt-1 text-xl font-extrabold">الأصناف الأعلى طلباً</h2><p className="mt-1 text-sm text-muted-foreground">عدد أصحاب الأعمال المهتمين بكل صنف.</p></div></div>
          {data.topDemand.length ? <ol className="mt-6 space-y-5">{data.topDemand.map((item, index) => <li key={`${item.name}-${index}`} data-testid={`row-market-demand-${index}`}><div className="mb-2 flex items-center justify-between gap-4 text-sm"><span className="font-bold">{item.name}</span><span className="shrink-0 text-muted-foreground">{formatCount(item.buyers)} صاحب عمل</span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="supplier-bar h-full rounded-full bg-primary" style={{ width: highestDemand > 0 ? `${Math.max(0, Math.min(100, item.buyers / highestDemand * 100))}%` : "0%" }} /></div></li>)}</ol> : <div className="mt-6"><EmptySection title="لا توجد بيانات طلب كافية" detail="ستظهر الأصناف هنا عندما يتوفر نشاط قابل للعرض." /></div>}
        </section>
        <section className="supplier-panel p-5 md:p-7" aria-labelledby="supply-heading">
          <div className="flex items-start gap-3"><PackageSearch className="mt-1 h-5 w-5 text-primary" /><div><p className="text-xs font-bold text-primary">فجوات التغطية</p><h2 id="supply-heading" className="mt-1 text-xl font-extrabold">أصناف قليلة الموردين</h2><p className="mt-1 text-sm text-muted-foreground">الأصناف التي يقل عدد مورديها في الدليل.</p></div></div>
          {data.lowSupply.length ? <ul className="mt-6 divide-y divide-border">{data.lowSupply.map((item, index) => <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 py-4 first:pt-0" data-testid={`row-market-supply-${index}`}><span className="font-bold">{item.name}</span><span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground">{formatCount(item.supplierCount)} {item.supplierCount === 1 ? "مورد" : "موردين"}</span></li>)}</ul> : <div className="mt-6"><EmptySection title="لا تتوفر فجوات أصناف حالياً" detail="ستظهر الأصناف منخفضة التغطية عند توفر بيانات كافية." /></div>}
        </section>
      </div>
      <section className="supplier-panel mt-5 p-5 md:p-7" aria-labelledby="cities-heading">
        <div className="flex items-start gap-3"><MapPin className="mt-1 h-5 w-5 text-primary" /><div><p className="text-xs font-bold text-primary">خريطة الفرص</p><h2 id="cities-heading" className="mt-1 text-xl font-extrabold">مدن تحتاج تغطية أكبر</h2><p className="mt-1 text-sm text-muted-foreground">مدن لم يصلها عدد كافٍ من الموردين المسجلين.</p></div></div>
        {data.underservedCities.length ? <ul className="mt-6 flex flex-wrap gap-2">{data.underservedCities.map((city, index) => <li key={`${city}-${index}`} data-testid={`text-underserved-city-${index}`} className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-bold">{city}</li>)}</ul> : <div className="mt-6"><EmptySection title="لا توجد مدن محددة حالياً" detail="ستُعرض المدن التي تحتاج تغطية إضافية عندما تتوفر إشارات كافية." /></div>}
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-secondary/60 p-5 text-sm"><p className="max-w-2xl leading-7 text-secondary-foreground">هذه المؤشرات تصف النشاط داخل الدليل فقط. ليست ضماناً للطلب أو المبيعات.</p><Link href="/supplier/dashboard" data-testid="link-return-dashboard" className="inline-flex items-center gap-2 font-extrabold text-primary hover:underline">العودة إلى أدائك <ArrowUpLeft className="h-4 w-4" /></Link></div>
    </>}
  </SupplierWorkspace>;
}