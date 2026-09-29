import type { AlmondVariantForm, AlmondVariantPreparation } from "@workspace/api-client-react";

export type AlmondFormFilter = AlmondVariantForm | "";
export type AlmondPreparationFilter = AlmondVariantPreparation | "";
export type AlmondSizeFilter = "" | "32" | "34" | "36";

export function AlmondVariantFilters({
  form,
  onFormChange,
  preparation,
  onPreparationChange,
  size,
  onSizeChange,
}: {
  form: AlmondFormFilter;
  onFormChange: (value: AlmondFormFilter) => void;
  preparation: AlmondPreparationFilter;
  onPreparationChange: (value: AlmondPreparationFilter) => void;
  size: AlmondSizeFilter;
  onSizeChange: (value: AlmondSizeFilter) => void;
}) {
  return <section className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-right" aria-label="فلاتر أصناف اللوز">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-bold">الشكل
        <select data-testid="filter-almond-form" value={form} onChange={(event) => onFormChange(event.target.value as AlmondFormFilter)} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
          <option value="">كل الأشكال</option><option value="whole">حب</option><option value="slices">شرائح</option><option value="powder">مطحون</option>
        </select>
      </label>
      <label className="text-sm font-bold">التحضير
        <select data-testid="filter-almond-preparation" value={preparation} onChange={(event) => onPreparationChange(event.target.value as AlmondPreparationFilter)} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
          <option value="">ني أو محمص</option><option value="raw">ني</option><option value="roasted">محمص</option>
        </select>
      </label>
      <label className="text-sm font-bold">مقاس الحب
        <select data-testid="filter-almond-size" value={size} onChange={(event) => onSizeChange(event.target.value as AlmondSizeFilter)} disabled={form !== "whole"} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal disabled:opacity-60">
          <option value="">كل المقاسات</option><option value="32">32</option><option value="34">34</option><option value="36">36</option>
        </select>
      </label>
    </div>
    <p className="mt-3 text-xs leading-6 text-muted-foreground" data-testid="text-almond-filter-scope">
      بدون تحديد شكل أو تحضير أو مقاس، يعرض البحث موردي اللوز المسجلين دون افتراض خياراتهم. عند اختيار فلتر دقيق، تظهر فقط الخيارات التي أعلنها الموردون المطابقون؛ الموردون الذين لم يحددوا هذه التفاصيل لا يظهرون في نتائج الفلتر الدقيق.
    </p>
  </section>;
}