import { getItemCategoryIcon } from "@/lib/item-category-icons";
import { groupIconChoices } from "@/lib/group-icons";

export function GroupIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = groupIconChoices.find((choice) => choice.value === value);
  const CurrentIcon = selected?.Icon ?? getItemCategoryIcon(value);

  return <fieldset>
    <legend className="mb-2 text-sm font-extrabold">أيقونة المجموعة (SVG)</legend>
    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
      <CurrentIcon className="h-7 w-7 text-primary" aria-hidden="true" />
      <span>{selected?.label ?? "الأيقونة الحالية — اختر أيقونة من القائمة لتغييرها"}</span>
    </div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {groupIconChoices.map(({ value: iconValue, label, Icon }) => <button
        key={iconValue}
        type="button"
        aria-label={label}
        aria-pressed={value === iconValue}
        title={label}
        onClick={() => onChange(iconValue)}
        className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${value === iconValue ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"}`}
      >
        <Icon className="h-7 w-7" aria-hidden="true" />
        <span>{label}</span>
      </button>)}
    </div>
  </fieldset>;
}