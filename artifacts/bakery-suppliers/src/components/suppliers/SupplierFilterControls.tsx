export const SUPPLIER_TYPES = ["دقيق", "سكر", "شوكولاتة", "زبدة", "مكسرات", "تغليف"] as const;

type SupplierSort = "rating" | "newest" | "alphabetical";
type SupplierPackage = "" | "verified" | "featured";

interface SupplierFilterControlsProps {
  city: string;
  onCityChange: (value: string) => void;
  type: string;
  onTypeChange: (value: string) => void;
  rating: string;
  onRatingChange: (value: string) => void;
  supplierPackage: SupplierPackage;
  onPackageChange: (value: SupplierPackage) => void;
  sort: SupplierSort;
  onSortChange: (value: SupplierSort) => void;
  cities: string[];
}

export function SupplierFilterControls({
  city,
  onCityChange,
  type,
  onTypeChange,
  rating,
  onRatingChange,
  supplierPackage,
  onPackageChange,
  sort,
  onSortChange,
  cities,
}: SupplierFilterControlsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <select
        aria-label="فلترة حسب المدينة"
        data-testid="filter-supplier-city"
        value={city}
        onChange={(event) => onCityChange(event.target.value)}
        className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="">كل المدن</option>
        {cities.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      <select
        aria-label="فلترة حسب نوع النشاط"
        data-testid="filter-supplier-type"
        value={type}
        onChange={(event) => onTypeChange(event.target.value)}
        className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="">كل أنواع النشاط</option>
        {SUPPLIER_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      <select
        aria-label="فلترة حسب التقييم"
        data-testid="filter-supplier-rating"
        value={rating}
        onChange={(event) => onRatingChange(event.target.value)}
        className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="">كل التقييمات</option>
        <option value="5">٥ نجوم فأعلى</option>
        <option value="4">٤ نجوم فأعلى</option>
        <option value="3">٣ نجوم فأعلى</option>
        <option value="2">نجمتان فأعلى</option>
        <option value="1">نجمة فأعلى</option>
      </select>

      <select
        aria-label="فلترة حسب الباقة"
        data-testid="filter-supplier-package"
        value={supplierPackage}
        onChange={(event) => onPackageChange(event.target.value as SupplierPackage)}
        className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="">كل الباقات</option>
        <option value="verified">موثق</option>
        <option value="featured">مميز</option>
      </select>

      <select
        aria-label="ترتيب الموردين"
        data-testid="sort-suppliers"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SupplierSort)}
        className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
      >
        <option value="rating">الأعلى تقييماً</option>
        <option value="newest">الأحدث</option>
        <option value="alphabetical">أبجدياً</option>
      </select>
    </div>
  );
}