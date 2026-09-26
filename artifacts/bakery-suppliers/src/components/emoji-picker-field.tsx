import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { DEFAULT_CATEGORY_ICON, emojiKeywords, getEmojiSuggestions, searchEmojiCatalog } from "../lib/emoji-catalog";
import { CategoryIconValue } from "./category-special-icons";

export type EmojiPickerFieldProps = {
  value: string;
  onChange: (emoji: string) => void;
  name: string;
  inputTestId: string;
  idPrefix?: string;
  allowEmpty?: boolean;
};

export function EmojiSuggestions({ name, onSelect }: { name: string; onSelect: (emoji: string) => void }) {
  const suggestions = getEmojiSuggestions(name);
  if (!suggestions.length) return null;
  return <div dir="rtl" data-testid="emoji-suggestions" className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-bold text-muted-foreground">مقترح للاسم:</span>
    {suggestions.map((emoji, index) => <button
      key={emoji} type="button" data-testid={`button-emoji-suggestion-${index}`}
      aria-label={`اختر ${emojiKeywords[emoji]?.split(" ")[0] ?? emoji}`}
      title={emojiKeywords[emoji]} onClick={() => onSelect(emoji)}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/30 text-xl transition-colors hover:border-accent hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    ><CategoryIconValue icon={emoji} /></button>)}
  </div>;
}

export function EmojiPickerField({ value, onChange, name, inputTestId, idPrefix, allowEmpty = false }: EmojiPickerFieldProps) {
  const generatedId = useId().replace(/:/g, "");
  const prefix = idPrefix ?? `emoji-${generatedId}`;
  const titleId = `${prefix}-title`;
  const fieldId = `${prefix}-field`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    setDraft(value);
    setSearch("");
    setFeedback("");
    setOpen(true);
  };
  const closePicker = () => {
    setOpen(false);
    setDraft(value);
    setSearch("");
    opener.current?.focus();
  };
  const confirm = () => {
    onChange(draft);
    setOpen(false);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePicker(); }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // Close is intentionally handled via the current render of the open dialog.
  }, [open, value]);

  const sections = searchEmojiCatalog(search);
  const autoGenerate = () => {
    const best = getEmojiSuggestions(name, 1)[0];
    if (best) {
      onChange(best);
      setFeedback(`اقتراح مناسب لـ ${name.trim()}: ${best}`);
    } else {
      setFeedback("لم نجد أيقونة مناسبة لهذا الاسم. اختر أيقونة من القائمة يدوياً.");
    }
  };

  return <div dir="rtl" className="space-y-2.5">
    <div className="flex min-w-0 items-center gap-2">
      <button ref={opener} id={fieldId} type="button" data-testid={inputTestId} aria-label={`اختر أيقونة ${name || "التصنيف"}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={openPicker}
        className="group flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-2 text-right transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span data-testid={`${prefix}-preview`} aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-[40px] leading-none"><CategoryIconValue icon={value || DEFAULT_CATEGORY_ICON} /></span>
         <span className="min-w-0 flex-1 truncate text-xs font-bold text-muted-foreground">{value ? "تغيير الأيقونة" : allowEmpty ? "أيقونة صندوق افتراضية · يمكن تغييرها" : "اختر أيقونة"}</span>
        <span className="text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true">‹</span>
      </button>
      {value && <button type="button" data-testid={`${prefix}-clear`} aria-label="مسح الأيقونة" title="مسح الأيقونة" onClick={() => { onChange(""); setFeedback(""); }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"><X className="h-4 w-4" /></button>}
    </div>
    <button type="button" data-testid={`${prefix}-auto-generate`} onClick={autoGenerate}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">🎲 توليد تلقائي</button>
    {feedback && <p role="status" data-testid={`${prefix}-feedback`} className="text-xs leading-6 text-muted-foreground">{feedback}</p>}
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} dir="rtl"
        data-testid={`${prefix}-dialog`}
        className="flex h-[min(90dvh,740px)] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-popover text-popover-foreground shadow-warm-lg sm:h-[min(82dvh,740px)] sm:max-w-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
           <div><h2 id={titleId} className="text-lg font-extrabold">اختر أيقونة</h2><p className="text-xs text-muted-foreground">{sections.reduce((total, section) => total + section.emojis.length, 0)} خيار · ابحث عن رمز يناسب {name.trim() || "تصنيفك"}{allowEmpty ? " · أو اترك الصندوق الافتراضي" : ""}</p></div>
          <button type="button" data-testid={`${prefix}-close`} aria-label="إغلاق اختيار الأيقونة" onClick={closePicker}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><X className="h-5 w-5" /></button>
        </header>
        <div className="shrink-0 px-5 pt-4">
          <label className="relative block">
            <span className="sr-only">ابحث عن أيقونة</span>
            <Search aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input ref={searchRef} type="search" data-testid={`${prefix}-search`} value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن أيقونة..." className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </label>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          {sections.length ? sections.map((section) => <section key={section.name} aria-label={section.name} data-testid={`${prefix}-section-${section.name}`}>
             <h3 className="mb-2.5 text-sm font-extrabold text-foreground">{section.name} <span className="font-normal text-muted-foreground">({section.emojis.length})</span></h3>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
              {section.emojis.map((emoji) => <button key={emoji} type="button" data-testid={`${prefix}-option-${section.name}-${emoji}`}
                aria-label={emojiKeywords[emoji]?.split(" ")[0] ?? emoji} aria-pressed={draft === emoji}
                title={emojiKeywords[emoji]} onClick={() => setDraft(emoji)}
                className={`flex aspect-square min-h-10 items-center justify-center rounded-xl border-2 text-[27px] leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${draft === emoji ? "border-accent bg-secondary/70" : "border-transparent bg-secondary/30 hover:border-accent/40 hover:bg-secondary/60"}`}
               ><CategoryIconValue icon={emoji} /></button>)}
            </div>
          </section>) : <div role="status" data-testid={`${prefix}-no-results`} className="rounded-2xl border border-dashed border-border bg-secondary/20 px-5 py-10 text-center">
            <p className="font-bold">لا توجد أيقونات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">جرّب البحث باسم المكوّن أو باسم مجموعة مثل «الألبان».</p>
          </div>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-card px-5 py-4">
            <span data-testid={`${prefix}-selected`} className="ml-auto text-sm font-bold">{draft ? "المختار:" : allowEmpty ? "الافتراضية:" : "المختار:"} <span className="text-2xl align-middle"><CategoryIconValue icon={draft || DEFAULT_CATEGORY_ICON} /></span></span>
          <button type="button" data-testid={`${prefix}-cancel`} onClick={closePicker} className="min-h-10 rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">إلغاء</button>
           <button type="button" data-testid={`${prefix}-confirm`} onClick={confirm} disabled={!draft && !allowEmpty}
            className="min-h-10 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">تأكيد</button>
        </footer>
      </div>
    </div>}
  </div>;
}

export default EmojiPickerField;