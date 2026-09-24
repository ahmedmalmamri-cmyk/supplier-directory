import { MainLayout } from "@/components/layout/MainLayout";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useGetHome } from "@workspace/api-client-react";
import { Candy, Cookie, FlaskConical, Milk, Nut, Package, Sparkles, Wheat, type LucideIcon } from "lucide-react";
import { Link } from "wouter";

const categoryIcons: Record<string, LucideIcon> = {
  Wheat,
  Candy,
  Milk,
  Cookie,
  Nut,
  FlaskConical,
  Sparkles,
  Package,
};

export default function CategoriesPage() {
  const { data, isLoading, error } = useGetHome();

  return <MainLayout>
    <section className="border-b bg-secondary/10 py-10 md:py-14">
      <div className="container mx-auto px-4">
        <p className="mb-2 text-sm font-bold text-primary">دليل المنتجات</p>
        <h1 className="text-3xl font-extrabold md:text-4xl">التصنيفات</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">اختر نوع المواد أو المنتجات لعرض المنتجات والموردين المرتبطين به.</p>
      </div>
    </section>
    <div className="container mx-auto px-4 py-8 md:py-12">
      {isLoading ? <LoadingSpinner className="min-h-[40vh]" /> : error || !data ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-destructive">تعذر تحميل التصنيفات. حاول تحديث الصفحة.</div>
      ) : data.categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">لا توجد تصنيفات متاحة حالياً.</div>
      ) : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.categories.map((category) => {
          const CategoryIcon = categoryIcons[category.icon] ?? Package;
          return <Link key={category.id} href={`/category/${category.id}`} className="group flex min-h-32 items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-warm">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><CategoryIcon className="h-7 w-7" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-extrabold">{category.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{category.productCount ?? 0} منتج متاح</span>
            </span>
            <span aria-hidden="true" className="text-xl text-primary transition-transform group-hover:-translate-x-1">←</span>
          </Link>;
        })}
      </div>}
    </div>
  </MainLayout>;
}