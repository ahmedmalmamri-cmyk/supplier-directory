import { useState } from "react";
import { ChevronLeft, Layers3, Search } from "lucide-react";
import { Link } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { CategorySearch, RootCard, useTaxonomy } from "@/components/categories/taxonomy";

export default function CategoriesPage() {
  const { categories, groups, roots, isLoading, error, refetch } = useTaxonomy();
  const [search, setSearch] = useState("");
  return <MainLayout>
    <section className="border-b border-border bg-secondary/10 py-9 md:py-14"><div className="container mx-auto px-4">
      <nav aria-label="مسار التنقل" className="mb-7 flex items-center gap-2 text-sm text-muted-foreground"><Link href="/" className="hover:text-primary">الرئيسية</Link><ChevronLeft className="h-4 w-4" /><span className="text-foreground">المجموعات</span></nav>
      <div className="flex items-start gap-4"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Layers3 className="h-7 w-7" /></span><div><p className="mb-1 text-sm font-bold text-primary">ابدأ من المجموعة</p><h1 className="text-3xl font-extrabold md:text-4xl">دليل التصنيفات</h1><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">اختر مجموعة رئيسية، ثم الصنف الذي تحتاجه، لتصل إلى الموردين المتخصصين فيه.</p></div></div>
    </div></section>
    <section className="container mx-auto min-h-[50vh] px-4 py-10">
      {isLoading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" role="status" aria-label="جارٍ تحميل التصنيفات">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-muted" />)}</div>
        : error ? <div role="alert" className="rounded-2xl border border-destructive/20 bg-card p-10 text-center"><p className="font-bold">تعذر تحميل التصنيفات</p><button type="button" onClick={() => void refetch()} className="mt-4 rounded-xl bg-primary px-5 py-2 text-primary-foreground">إعادة المحاولة</button></div>
        : <><div className="mb-8 max-w-xl"><CategorySearch value={search} onChange={setSearch} categories={categories} groups={groups} testId="input-all-category-search" /></div>{roots.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{roots.map((category) => <RootCard key={category.id} category={category} categories={categories} />)}</div> : <div className="rounded-2xl border border-dashed border-border p-12 text-center"><Search className="mx-auto mb-3 h-9 w-9 text-primary" /><p>لا توجد مجموعات متاحة حالياً.</p></div>}</>}
    </section>
  </MainLayout>;
}