import type { SupplierOfferedSubtypesItem } from "@workspace/api-client-react";

export type CatalogItemOption = {
  id: number;
  name: string;
  subtypes: Array<{ id: number; name: string }>;
};

export function CatalogFilters({
  items,
  itemId,
  subtypeId,
  onItemChange,
  onSubtypeChange,
}: {
  items: CatalogItemOption[];
  itemId: string;
  subtypeId: string;
  onItemChange: (value: string) => void;
  onSubtypeChange: (value: string) => void;
}) {
  const selectedItem = items.find((item) => String(item.id) === itemId);

  return (
    <section className="mt-4 rounded-2xl border border-primary/15 bg-background/80 p-4 text-right" aria-label="تصفية العروض المعلنة">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold" htmlFor="filter-catalog-item">
          الصنف الرئيسي
          <select
            id="filter-catalog-item"
            data-testid="filter-catalog-item"
            value={itemId}
            onChange={(event) => onItemChange(event.target.value)}
            className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal"
          >
            <option value="">كل الأصناف المعلنة</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold" htmlFor="filter-catalog-subtype">
          النوع الفرعي المعلن
          <select
            id="filter-catalog-subtype"
            data-testid="filter-catalog-subtype"
            value={subtypeId}
            onChange={(event) => onSubtypeChange(event.target.value)}
            disabled={!selectedItem}
            className="mt-1 block h-11 w-full rounded-xl border border-input bg-background px-3 font-normal disabled:opacity-60"
          >
            <option value="">كل الأنواع الفرعية</option>
            {selectedItem?.subtypes.map((subtype) => <option key={subtype.id} value={subtype.id}>{subtype.name}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground" data-testid="text-catalog-declaration-scope">
        هذه بيانات يعلنها المورد وليست مخزوناً لحظياً. أكّد التوفر والسعر الحالي مباشرةً مع المورد.
      </p>
    </section>
  );
}

export function CatalogOfferList({ offers }: { offers: SupplierOfferedSubtypesItem[] }) {
  if (!offers.length) return null;
  return (
    <div className="mt-4 border-t pt-3" data-testid="list-catalog-offers">
      <p className="mb-2 text-xs font-bold text-muted-foreground">أنواع أعلن المورد عن توفيرها</p>
      <ul className="space-y-2">
        {offers.map((offer) => (
          <li key={offer.id} data-testid={`text-catalog-offer-${offer.id}`} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="font-bold">{offer.itemName}: {offer.nameAr}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {offer.price !== null && <span>{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(offer.price)} ريال · </span>}
              آخر تحديث للإعلان: {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(offer.lastUpdated))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}