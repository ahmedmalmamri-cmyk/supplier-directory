import { getGetCatalogItemFiltersQueryKey, useGetCatalogItemFilters } from "@workspace/api-client-react";

export type AttributeSelections = Record<number, number>;
export type LegacyAlmondShape = "" | "whole" | "slices" | "powder";

function almondShape(name: string): LegacyAlmondShape {
  if (/حب|كامل|whole/i.test(name)) return "whole";
  if (/شرائح|slices/i.test(name)) return "slices";
  if (/مطحون|powder/i.test(name)) return "powder";
  return "";
}

export function DynamicItemFilters({
  itemId,
  category,
  q,
  formId,
  onFormChange,
  attributes,
  onAttributesChange,
  legacyAlmondForm,
  onLegacyAlmondFormChange,
}: {
  itemId?: number;
  category?: string;
  q?: string;
  formId: number | null;
  onFormChange: (id: number | null, formName?: string, legacyShape?: LegacyAlmondShape) => void;
  attributes: AttributeSelections;
  onAttributesChange: (value: AttributeSelections) => void;
  legacyAlmondForm?: LegacyAlmondShape;
  onLegacyAlmondFormChange?: (value: LegacyAlmondShape) => void;
}) {
  const term = q?.trim() ?? "";
  const selectedCategory = category?.trim() ?? "";
  const almond = selectedCategory === "لوز" || term === "لوز";
  const params = itemId ? { itemId } : almond ? { category: "لوز" }
    : selectedCategory ? { category: selectedCategory } : { q: term };
  const enabled = Boolean(itemId || selectedCategory || term);
  const { data, isLoading, isError, refetch } = useGetCatalogItemFilters(params, {
    query: { enabled, queryKey: getGetCatalogItemFiltersQueryKey(params) },
  });
  const almondItems = !itemId && almond ? (data ?? []).filter((entry) => entry.name === "لوز" || /^لوز\s+(حب|شرائح|مطحون)$/.test(entry.name.trim())) : [];
  const item = itemId
    ? data?.find((entry) => entry.id === itemId)
    : almond ? almondItems[0]
      : data?.find((entry) => [selectedCategory, term].filter(Boolean).some((name) =>
        entry.name.trim().toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar")
          || entry.nameEn?.trim().toLowerCase() === name.toLowerCase()));
  if (!enabled) return null;
  if (isLoading) return <div className="mt-4 rounded-2xl border border-primary/15 bg-background/80 p-4 text-right" role="status" aria-label="جارٍ تحميل خيارات الصنف"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="mt-3 h-11 animate-pulse rounded-xl bg-muted" /></div>;
  if (isError) return <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-right text-sm" role="alert">تعذر تحميل خيارات الصنف. <button type="button" data-testid="button-retry-item-filters" onClick={() => void refetch()} className="font-bold text-primary underline">إعادة المحاولة</button></div>;
  if (!item) return null;

  const entries = almondItems.length ? almondItems : [item];
  const forms = Array.from(new Map(entries.flatMap((entry) => entry.forms.filter((form) => form.isActive)).map((form) => [form.id, form])).values());
  const ownerOfForm = (id: number) => entries.find((entry) => entry.forms.some((form) => form.id === id));
  const inferredForm = !formId && legacyAlmondForm
    ? forms.find((form) => almondShape(ownerOfForm(form.id)?.name ?? "") === legacyAlmondForm
      || almondShape(form.nameAr) === legacyAlmondForm)
    : undefined;
  const shownFormId = forms.some((form) => form.id === formId) ? formId : inferredForm?.id;
  // A combined almond category is not itself a purchasable item. Its extra
  // attributes only belong to the master that owns the selected shape.
  const attributeItem = almondItems.length ? shownFormId ? ownerOfForm(shownFormId) : undefined : item;
  const extraAttributes = (attributeItem?.attributes ?? []).filter((attribute) => attribute.isActive && attribute.options.some((option) => option.isActive));
  if (!forms.length && !extraAttributes.length && !onLegacyAlmondFormChange) return null;

  const displayName = almondItems.length ? "لوز" : item.name;
  return <section className="mt-4 rounded-2xl border border-primary/15 bg-background/80 p-4 text-right" aria-label={`خيارات ${displayName}`} data-testid="section-dynamic-item-filters">
    <p className="mb-3 text-sm font-bold text-foreground">خيارات {displayName}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {forms.length > 0 && <label className="text-sm font-bold" htmlFor="filter-item-form">فلتر الشكل
        <select id="filter-item-form" data-testid="filter-item-form" value={shownFormId ?? ""} onChange={(event) => {
          const selected = forms.find((form) => form.id === Number(event.target.value));
          onAttributesChange({});
          onFormChange(selected?.id ?? null, selected?.nameAr, selected ? almondShape(ownerOfForm(selected.id)?.name ?? "") || almondShape(selected.nameAr) : "");
        }} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
          <option value="">كل الأشكال</option>
          {forms.map((form) => <option key={form.id} value={form.id}>{form.nameAr}</option>)}
        </select>
      </label>}
      {!forms.length && onLegacyAlmondFormChange && <label className="text-sm font-bold" htmlFor="filter-almond-form">فلتر الشكل
        <select id="filter-almond-form" data-testid="filter-almond-form" value={legacyAlmondForm ?? ""} onChange={(event) => { onAttributesChange({}); onLegacyAlmondFormChange(event.target.value as LegacyAlmondShape); }} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
          <option value="">كل الأشكال</option><option value="whole">حب</option><option value="slices">شرائح</option><option value="powder">مطحون</option>
        </select>
      </label>}
      {extraAttributes.map((attribute) => <label key={attribute.id} className="text-sm font-bold" htmlFor={`filter-item-attribute-${attribute.id}`}>{attribute.nameAr}
        <select id={`filter-item-attribute-${attribute.id}`} data-testid={`filter-item-attribute-${attribute.id}`} value={attribute.options.some((option) => option.isActive && option.id === attributes[attribute.id]) ? attributes[attribute.id] : ""} onChange={(event) => {
          const next = { ...attributes };
          if (event.target.value) next[attribute.id] = Number(event.target.value);
          else delete next[attribute.id];
          onAttributesChange(next);
        }} className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
          <option value="">كل الخيارات</option>
          {attribute.options.filter((option) => option.isActive).map((option) => <option key={option.id} value={option.id}>{option.nameAr}</option>)}
        </select>
      </label>)}
    </div>
    <p className="mt-3 text-xs leading-6 text-muted-foreground">يُطبّق كل اختيار على العرض نفسه الذي أعلنه المورد، وليس على عروض منفصلة.</p>
  </section>;
}