/** Curated icon choices for the bakery directory. Entries are unique within each section. */
const sections = [
  ["الدقيق والحبوب", "icon:flour-powder icon:flour-sack icon:flour-scoop 🌾 🥣 🛍️ 🌽 🍚 🌰 🫘 🧂"],
  ["المخابز", "icon:round-bread icon:pita-bread icon:bread-loaf icon:dough-ball icon:bread-slices 🥖 🍞 🥐 🥯 🥨 🫓 🍩 🧇 🥞 🍥 🥧 🍕 🌮 🌯 🫔 🥟"],
  ["الحلويات", "🎂 🍰 🧁 🍮 🍭 🍬 🍫 🍪 🍩 🥮 🍡 🍧 🍨 🍦 🥧"],
  ["الألبان", "🥛 🧀 🍶 🍦 🧈 🥚 🥣"],
  ["المكسرات والبذور", "🥜 🌰 🥥 🍯 🌻 🎃 🫘 🌱"],
  ["الفواكه", "🍓 🍒 🍑 🍇 🥭 🍋 🍊 🍎 🍏 🍐 🍌 🍉 🍈 🍋‍🟩 🫐 🍅 🥝"],
  ["الخضروات", "🥬 🥒 🍅 🌶️ 🧄 🧅 🥕 🌽 🥔 🍠 🫒 🥦"],
  ["المشروبات", "💧 🥤 ☕ 🍵 🧃 🍶 🥛 🍷 🥂 🫖 🧋"],
  ["الأدوات", "⚙️ 🔧 🔨 🥄 🍴 🔪 🧪 🧂 🥣 🍽️ 🧊 🔥 💡 🍳 🫙 🫗 🧽"],
  ["التغليف", "📦 🛍️ 🎁 📄 📋 🗂️ 🏷️ 📌 🔖 🎀 🎗️ 🫙 🧴 🥫"],
  ["رموز وإشارات", "⭐ ✨ 🔥 ❄️ 💡 ✅ ❌ ⚠️ ❗ ❓ 💯 🎯 🏆 🥇 🥈 🥉"],
  ["النكهات والتوابل", "🌿 🍃 🌸 🌺 🍯 🧂 🌶️ 🧄 🧅 🍋 🌰 🌱 🫘 🫚 🥬"],
] as const;

/** Additional illustrated choices. IDs are stored as short strings like the existing custom icons. */
const illustratedSections = [
  { name: "رسوم الدقيق والمكونات", choices: [
    ["wheat", "سنابل قمح حبوب دقيق طحين"], ["wheat-off", "دقيق خال من القمح"],
    ["sprout", "حبوب براعم بذور"], ["bean", "حبوب فاصوليا بقوليات"], ["nut", "مكسرات بندق"],
    ["egg", "بيض بيضة"], ["milk", "حليب لبن ألبان"], ["droplets", "زيت سائل ماء"],
    ["citrus", "ليمون حمضيات"], ["apple", "تفاح فاكهة"], ["cherry", "كرز فاكهة"],
    ["grape", "عنب فاكهة"], ["banana", "موز فاكهة"], ["carrot", "جزر خضار"],
    ["leaf", "أوراق أعشاب ورقيات"], ["flower", "وردة زهرة نكهة"],
  ] },
  { name: "رسوم الخبز والحلويات", choices: [
    ["croissant", "كرواسون معجنات"], ["sandwich", "ساندويتش خبز حشوة"],
    ["pizza", "بيتزا عجينة"], ["cookie", "بسكويت كوكيز"], ["cake-slice", "قطعة كيك حلوى"],
    ["cake", "كيك قالب تورتة"], ["dessert", "حلوى طبق تحلية"],
    ["ice-cream", "آيس كريم مثلجات"], ["candy", "حلوى سكر"],
    ["chef-hat", "قبعة خباز طاهي مخبز"], ["cooking-pot", "قدر طبخ تحضير"],
    ["soup", "وعاء شوربة حساء"], ["utensils", "أدوات طعام شوكة سكين"],
  ] },
  { name: "رسوم المشروبات والتقديم", choices: [
    ["coffee", "قهوة فنجان"], ["cup", "كوب مشروب عصير"],
    ["glass-water", "كأس ماء"], ["wine", "كأس شراب"], ["martini", "كأس مشروب"],
    ["teapot", "إبريق شاي"], ["flame", "نار فرن حرارة"], ["snowflake", "تبريد ثلج برودة"],
  ] },
  { name: "رسوم الأدوات والتغليف", choices: [
    ["scale", "ميزان وزن مقادير"], ["timer", "مؤقت وقت خبز"], ["thermometer", "مقياس حرارة فرن"],
    ["refrigerator", "ثلاجة تبريد"], ["microwave", "فرن تسخين"],
    ["package", "صندوق كرتون تغليف"], ["package-open", "صندوق مفتوح تغليف"],
    ["boxes", "صناديق كراتين"], ["shopping-bag", "كيس تسوق"],
    ["tag", "بطاقة ملصق سعر"], ["printer", "طابعة ملصقات"], ["scissors", "مقص تقطيع"],
    ["ruler", "مسطرة قياس"], ["spray-can", "بخاخ عبوة"], ["settings", "معدات أدوات"],
  ] },
] as const;

export type EmojiSection = { name: string; emojis: string[] };
export const emojiCatalog: EmojiSection[] = [...illustratedSections.map(({ name, choices }) => ({
  name,
  emojis: choices.map(([id]) => `icon:${id}`),
})), ...sections.map(([name, choices]) => ({
  name,
  emojis: [...new Set(choices.split(" "))],
}))];

/** Arabic labels and alternate ingredient terms, indexed by grapheme sequence (not code point). */
export const emojiKeywords: Record<string, string> = {
  "icon:flour-powder": "طحين بودرة بودرا دقيق مسحوق ناعم كومة طحين قمح",
  "icon:round-bread": "خبز دائري رغيف مستدير خبز عربي مخبوزات",
  "icon:flour-sack": "كيس طحين شوال دقيق قمح بودرة",
  "icon:flour-scoop": "مغرفة طحين ملعقة دقيق مسحوق بودرة",
  "icon:pita-bread": "خبز عربي مسطح دائري صاج رغيف",
  "icon:bread-loaf": "رغيف خبز قالب مخبز",
  "icon:dough-ball": "كرة عجين عجينة مخبوزات",
  "icon:bread-slices": "شرائح خبز توست",
  "🥖": "رغيف فرنسي باغيت خبز دقيق قمح مخبوزات", "🍞": "خبز توست رغيف دقيق مخبوزات",
  "🥐": "كرواسون معجنات فطائر زبدة", "🥯": "بيغل خبز دائري", "🥨": "بريتزل مخبوزات",
  "🫓": "خبز مسطح صاج", "🍩": "دونات حلويات", "🧇": "وافل", "🥞": "بان كيك فطائر",
  "🍥": "حلوى ملتفة", "🥧": "فطيرة تارت", "🍕": "بيتزا", "🌮": "تاكو", "🌯": "ساندويتش لفافة",
  "🫔": "تامال لفافة", "🎂": "كيك تورتة عيد ميلاد", "🍰": "كيك قطعة حلوى سكر",
  "🧁": "كب كيك كيك صغير", "🍮": "كاسترد كريم كراميل مهلبية", "🍭": "مصاصة سكر حلوى",
  "🍬": "حلوى سكر ملبس", "🍫": "شوكولاتة كاكاو", "🍪": "بسكويت كوكيز",
  "🥮": "كعكة القمر", "🍡": "حلوى دنجو", "🍧": "ثلج مبشور", "🍨": "آيس كريم مثلجات",
  "🍦": "آيس كريم بوظة", "🥛": "حليب لبن ألبان", "🧀": "جبن جبنة أجبان",
  "🍶": "إبريق حليب لبن", "🧈": "زبدة سمن مارجرين", "🥚": "بيض بيضة",
  "🥜": "مكسرات فول سوداني فستق", "🌰": "مكسرات كستناء بندق", "🥥": "جوز هند",
  "🍯": "عسل شهد", "🌻": "دوار الشمس بذور", "🎃": "قرع يقطين بذور",
  "🍓": "فراولة", "🍒": "كرز", "🍑": "خوخ دراق", "🍇": "عنب", "🥭": "مانجو",
  "🍋": "ليمون حامض", "🍊": "برتقال يوسفي", "🍎": "تفاح أحمر", "🍏": "تفاح أخضر",
  "🍐": "كمثرى إجاص", "🍌": "موز", "🍉": "بطيخ أحمر", "🍈": "شمام بطيخ أصفر",
  "🍋‍🟩": "لايم ليمون أخضر", "🫐": "توت أزرق", "🍅": "طماطم بندورة",
  "🥝": "كيوي", "🥬": "خس ورقيات", "🥒": "خيار", "🌶️": "فلفل حار شطة",
  "🧄": "ثوم", "🧅": "بصل", "🥕": "جزر", "🌽": "ذرة", "🥔": "بطاطس بطاطا",
  "🍠": "بطاطا حلوة", "🫒": "زيتون زيت", "🥦": "بروكلي", "💧": "ماء مياه",
  "🥤": "مشروب عصير", "☕": "قهوة", "🍵": "شاي", "🧃": "عصير علبة",
  "🍷": "شراب كأس", "🥂": "كؤوس", "⚙️": "ترس معدات", "🔧": "مفتاح أدوات",
  "🔨": "مطرقة", "🥄": "ملعقة", "🍴": "شوكة سكين أدوات", "🔪": "سكين تقطيع",
  "🧪": "أنبوب اختبار", "🧂": "ملح توابل", "🥣": "وعاء زبدية",
  "🍽️": "طبق أدوات مائدة", "🧊": "ثلج تبريد", "🔥": "نار حرارة ساخن",
  "💡": "مصباح فكرة", "📦": "صندوق كرتون تغليف", "🛍️": "كيس تسوق",
  "🎁": "هدية", "📄": "ورقة", "📋": "قائمة لوح", "🗂️": "ملفات تنظيم",
  "🏷️": "بطاقة سعر ملصق", "📌": "دبوس", "🔖": "علامة مرجعية",
  "🎀": "شريط زينة", "🎗️": "شريط", "⭐": "نجمة", "✨": "لمعان بريق",
  "❄️": "ثلج برودة", "✅": "صح تأكيد", "❌": "خطأ إلغاء", "⚠️": "تحذير",
  "❗": "تعجب", "❓": "سؤال", "💯": "مئة ممتاز", "🎯": "هدف",
  "🏆": "كأس جائزة", "🥇": "ميدالية ذهبية", "🥈": "ميدالية فضية",
  "🥉": "ميدالية برونزية", "🌿": "أعشاب نكهات", "🍃": "ورق نبات",
  "🌸": "زهرة", "🌺": "كركديه زهرة", "🌱": "نبتة براعم",
  "🌾": "قمح دقيق حبوب", "🐝": "نحلة عسل", "🍳": "بيض مقلي",
  "🛢️": "زيت برميل",
  "🫘": "فاصوليا حبوب بقوليات بذور", "🍚": "أرز حبوب دقيق",
  "🫖": "إبريق شاي", "🧋": "مشروب حليب", "🫙": "مرطبان عبوة حفظ",
  "🫗": "سكب سائل زيت", "🧽": "اسفنجة تنظيف", "🥫": "علبة محفوظات",
  "🧴": "عبوة زجاجة", "🫚": "زنجبيل بهارات توابل",
  ...Object.fromEntries(illustratedSections.flatMap(({ choices }) =>
    choices.map(([id, keywords]) => [`icon:${id}`, keywords])
  )),
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ar")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .trim();
}

const ingredientRules: { terms: string[]; emojis: string[] }[] = [
  { terms: ["طحين", "دقيق", "بودرة", "بودرا", "مسحوق"], emojis: ["icon:flour-powder", "🌾", "🥣"] },
  { terms: ["خبز دائري", "خبز عربي", "رغيف دائري", "رغيف مستدير"], emojis: ["icon:round-bread", "🫓", "🥯"] },
  { terms: ["شوكولاتة", "شوكولاته", "كاكاو"], emojis: ["🍫", "🍪"] },
  { terms: ["مكسرات", "مكسر"], emojis: ["🥜", "🌰"] },
  { terms: ["بسكويت", "كوكيز"], emojis: ["🍪", "🍫"] },
  { terms: ["زبدة", "زبده", "سمن"], emojis: ["🧈", "🥛"] },
  { terms: ["حليب", "لبن"], emojis: ["🥛", "🍶"] },
  { terms: ["جبنة", "جبن"], emojis: ["🧀", "🍶"] },
  { terms: ["عسل"], emojis: ["🍯", "🐝"] },
  { terms: ["بيض"], emojis: ["🥚", "🍳"] },
  { terms: ["زيت"], emojis: ["🛢️", "🫒"] },
  { terms: ["سكر"], emojis: ["🍰", "🍬", "🧁"] },
  { terms: ["ملح"], emojis: ["🧂"] },
  { terms: ["خبز"], emojis: ["icon:round-bread", "🍞", "🥖", "🫓"] },
  { terms: ["كيك", "تورتة"], emojis: ["🎂", "🍰"] },
];

const groupRules: { terms: string[]; section: string }[] = [
  { terms: ["دقيق", "طحين", "حبوب", "مسحوق", "بودرة"], section: "الدقيق والحبوب" },
  { terms: ["مخبوز", "مخابز", "معجن", "فطائر", "خبز"], section: "المخابز" },
  { terms: ["حلويات", "حلوى", "سكر", "كيك", "بسكويت", "شوكولات"], section: "الحلويات" },
  { terms: ["ألبان", "البان", "حليب", "لبن", "جبن", "زبد", "سمن", "بيض"], section: "الألبان" },
  { terms: ["مكسر", "بذور", "عسل"], section: "المكسرات والبذور" },
  { terms: ["فواكه", "فاكهة", "تفاح", "توت"], section: "الفواكه" },
  { terms: ["خضروات", "خضار", "زيتون", "زيت"], section: "الخضروات" },
  { terms: ["مشروبات", "مشروب", "عصير", "قهوه", "شاي"], section: "المشروبات" },
  { terms: ["أدوات", "معدات", "ملح"], section: "الأدوات" },
  { terms: ["تغليف", "عبوات", "كرتون"], section: "التغليف" },
  { terms: ["رموز", "إشارات"], section: "رموز وإشارات" },
  { terms: ["نكهات", "توابل", "بهارات", "أعشاب"], section: "النكهات والتوابل" },
];

const ingredientSection: Record<string, string> = {
  "icon:flour-powder": "الدقيق والحبوب", "icon:round-bread": "المخابز",
  "🍫": "الحلويات", "🥜": "المكسرات والبذور", "🍪": "الحلويات",
  "🥖": "المخابز", "🧈": "الألبان", "🥛": "الألبان",
  "🧀": "الألبان", "🍯": "المكسرات والبذور", "🥚": "الألبان",
  "🛢️": "الخضروات", "🍰": "الحلويات", "🧂": "النكهات والتوابل",
  "🍞": "المخابز", "🎂": "الحلويات",
};

/** Ordered, deterministic, name-based suggestions. Unknown names intentionally return []. */
export function getEmojiSuggestions(name: string, limit = 5): string[] {
  const query = normalize(name);
  if (!query) return [];
  const matched = ingredientRules
    .flatMap((rule) => rule.terms.map((term) => ({ rule, term: normalize(term) })))
    .filter(({ term }) => query.includes(term))
    .sort((a, b) => b.term.length - a.term.length);
  const result = [...new Set(matched.flatMap(({ rule }) => rule.emojis))];
  const groups = groupRules
    .flatMap((rule) => rule.terms.map((term) => ({ rule, term: normalize(term) })))
    .filter(({ term }) => query.includes(term))
    .sort((a, b) => b.term.length - a.term.length);
  // Keep the ingredient's own section first, while preserving its explicit emoji order.
  if (matched.length) {
    const section = ingredientSection[matched[0].rule.emojis[0]];
    if (section) groups.unshift({ rule: { terms: [], section }, term: matched[0].term });
  }
  for (const { rule } of groups) {
    const section = emojiCatalog.find((item) => item.name === rule.section);
    for (const emoji of section?.emojis ?? []) if (!result.includes(emoji)) result.push(emoji);
  }
  // Match catalog label terms for ingredients not explicitly covered by rules.
  if (!result.length) {
    const hits = emojiCatalog.flatMap((section) => section.emojis).filter((emoji) =>
      normalize(emojiKeywords[emoji] ?? "").split(/\s+/).some((word) => word.length > 2 && query.includes(word))
    );
    result.push(...new Set(hits));
  }
  return result.slice(0, Math.max(0, limit));
}

/** Keep sections intact so the picker remains navigable while filtering. */
export function searchEmojiCatalog(query: string): EmojiSection[] {
  const term = normalize(query);
  if (!term) return emojiCatalog;
  const words = term.split(/\s+/);
  return emojiCatalog.map((section) => ({
    name: section.name,
    emojis: normalize(section.name).includes(term) ? section.emojis : section.emojis.filter((emoji) =>
      words.every((word) => normalize(emojiKeywords[emoji] ?? "").includes(word)) || emoji === query.trim()
    ),
  })).filter((section) => section.emojis.length > 0);
}