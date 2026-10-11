const fixedSlugs: Record<string, string> = {
  "المواد الأساسية": "basic-materials",
  "منتجات الألبان": "dairy",
  "الأجبان": "cheese",
  "الشوكولاتة والكاكاو": "chocolate",
  "المكسرات والبذور": "nuts",
  "خلطات جاهزة": "cake-mixes",
  "الخمائر والمحسنات": "yeast",
  "النكهات والألوان": "flavors",
  "العجائن والجاهز": "dough",
  "التغليف والعلب": "packaging",
  "المعدات والأدوات": "equipment",
  "حشوات الكيك": "cake-fillings",
  "مواد أخرى": "others",
  "دقيق": "flour",
  "سكر": "sugar",
  "سميد": "semolina",
  "برغل": "bulgur",
  "نخالة": "bran",
  "سكر بودرة": "powdered-sugar",
  "سكر بني": "brown-sugar",
  "جبن كيري": "kiri-cheese",
  "شوكولاتة بلوك": "chocolate-block",
};

export const canonicalItemCategoryRootSlugs = [
  "basic-materials",
  "dairy",
  "cheese",
  "chocolate",
  "nuts",
  "cake-mixes",
  "yeast",
  "flavors",
  "dough",
  "packaging",
  "equipment",
  "cake-fillings",
  "others",
] as const;

const arabicLetters: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "aa", ب: "b", ت: "t", ث: "th", ج: "j",
  ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh",
  ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q",
  ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y", ى: "a",
  ة: "h", ء: "", ئ: "y", ؤ: "w",
};

export function itemCategorySlugBase(name: string): string {
  const fixed = fixedSlugs[name.trim()];
  if (fixed) return fixed;
  const transliterated = [...name.trim().toLowerCase()]
    .map((letter) => arabicLetters[letter] ?? letter)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return transliterated || "item-category";
}

export function uniqueItemCategorySlug(name: string, isTaken: (slug: string) => boolean): string {
  const base = itemCategorySlugBase(name);
  if (!isTaken(base)) return base;
  let suffix = 2;
  while (isTaken(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}