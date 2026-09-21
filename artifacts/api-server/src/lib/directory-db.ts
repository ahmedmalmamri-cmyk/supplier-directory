import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const directoryDb = new DatabaseSync(
  path.join(dataDir, "bakery-directory.sqlite"),
);

directoryDb.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    description TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    average_rating REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    weight TEXT NOT NULL,
    unit TEXT NOT NULL,
    country_of_origin TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    technical_data TEXT NOT NULL,
    recommended_use TEXT NOT NULL,
    shelf_life TEXT NOT NULL,
    storage_conditions TEXT NOT NULL,
    min_order INTEGER NOT NULL,
    price REAL,
    image_url TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registration_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const categoryCount = directoryDb
  .prepare("SELECT COUNT(*) AS count FROM categories")
  .get() as { count: number };

if (categoryCount.count === 0) {
  const categories = [
    [1, "دقيق وخبز", "Wheat", "flour-bread"],
    [2, "سكر ومحليات", "Candy", "sugar-sweeteners"],
    [3, "دهون وزبدة", "Milk", "fats-butter"],
    [4, "شوكولاتة وكاكاو", "Cookie", "chocolate-cocoa"],
    [5, "مكسرات", "Nut", "nuts"],
    [6, "نكهات وألوان", "FlaskConical", "flavors-colors"],
    [7, "خمائر ومحسنات", "Sparkles", "yeast-improvers"],
    [8, "عبوات وتغليف", "Package", "packaging"],
  ] as const;
  const insert = directoryDb.prepare(
    "INSERT INTO categories (id, name, icon, slug) VALUES (?, ?, ?, ?)",
  );
  categories.forEach((row) => insert.run(...row));

  const suppliers = [
    [1, "شركة سنابل الدقيق", "الرياض", "منطقة الرياض", "حلول دقيق احترافية للمخابز الآلية والحرفية بجودة ثابتة ودعم فني متخصص.", "0112456789", "966501112233", 1, "2026-08-20"],
    [2, "مؤسسة مذاق الكاكاو", "جدة", "منطقة مكة المكرمة", "مورد متخصص في الشوكولاتة والكاكاو ومنتجات التزيين للمخابز ومحلات الحلويات.", "0126345678", "966502223344", 1, "2026-08-16"],
    [3, "روائع التغليف", "الدمام", "المنطقة الشرقية", "عبوات غذائية وحلول تغليف عملية تحافظ على جودة المنتج وتعزز حضوره.", "0138456789", "966503334455", 1, "2026-08-12"],
    [4, "بيت المكسرات للتجارة", "مكة", "منطقة مكة المكرمة", "تشكيلة مختارة من المكسرات الخام والمحمصة بمواصفات مناسبة للإنتاج التجاري.", "0125567890", "966504445566", 0, "2026-08-08"],
    [5, "الخميرة الذهبية", "المدينة", "منطقة المدينة المنورة", "خمائر ومحسنات مخابز ذات أداء موثوق لخطوط الإنتاج المختلفة.", "0146678901", "966505556677", 1, "2026-08-03"],
    [6, "أساس الحلوى", "الرياض", "منطقة الرياض", "مواد أولية متكاملة للحلويات والكافيهات تشمل السكر والنكهات والألوان.", "0117789012", "966506667788", 1, "2026-07-28"],
    [7, "زبدة الشرق", "جدة", "منطقة مكة المكرمة", "دهون وزبدة مخصصة للكرواسون والمعجنات والكريمات بمصادر متنوعة.", "0128890123", "966507778899", 0, "2026-07-22"],
    [8, "إمداد المخبوزات", "الدمام", "المنطقة الشرقية", "مورد شامل يخدم المخابز والكافيهات في المنطقة الشرقية بتوريد مرن.", "0139901234", "966508889900", 1, "2026-07-15"],
  ] as const;
  const insertSupplier = directoryDb.prepare(`
    INSERT INTO suppliers
      (id, name, city, region, description, phone, whatsapp, is_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  suppliers.forEach((row) => insertSupplier.run(...row));

  const products = [
    [1,1,1,"دقيق مخابز فاخر","50","كيس","السعودية","قمح مختار","بروتين 12.5%، رطوبة 14% كحد أقصى","الخبز العربي والصامولي","12 شهراً","مكان جاف وبارد",10,92],
    [2,1,1,"دقيق كرواسون قوي","25","كيس","السعودية","دقيق قمح مدعم","بروتين 13%، قوة عجين عالية","الكرواسون والمعجنات المورقة","12 شهراً","بعيداً عن الرطوبة",8,68],
    [3,1,7,"محسن خبز مركز","10","كرتون","فرنسا","إنزيمات غذائية ومستحلبات","جرعة الاستخدام 0.5%","الخبز والتوست","18 شهراً","أقل من 25 درجة",5,210],
    [4,2,4,"شوكولاتة داكنة 55%","10","كرتون","بلجيكا","كتلة كاكاو وسكر وزبدة كاكاو","كاكاو 55%، سيولة متوسطة","الغاناش والتغطية","24 شهراً","16-20 درجة",3,385],
    [5,2,4,"بودرة كاكاو داكنة","20","كيس","هولندا","كاكاو قلوي","دهون 10-12%","الكيك والبسكويت والمشروبات","24 شهراً","مكان جاف",4,430],
    [6,2,4,"شوكولاتة بيضاء حبيبات","10","كرتون","بلجيكا","زبدة كاكاو وحليب وسكر","زبدة كاكاو 28%","الحشوات والتزيين","18 شهراً","16-20 درجة",3,410],
    [7,3,8,"علب كيك بنافذة","100","كرتون","السعودية","كرتون غذائي","مقاس 30×30×15 سم","تغليف الكيك","غير محدد","مكان جاف",5,145],
    [8,3,8,"أكواب ورقية مزدوجة","500","كرتون","الصين","ورق غذائي مزدوج","سعة 12 أونصة","المشروبات الساخنة","36 شهراً","مكان جاف",2,195],
    [9,3,8,"علب حلويات فاخرة","50","كرتون","السعودية","كرتون مقوى","مقاس 24×16×6 سم","الشوكولاتة والمعمول","غير محدد","بعيداً عن الرطوبة",10,120],
    [10,4,5,"لوز شرائح","10","كرتون","الولايات المتحدة","لوز طبيعي","رطوبة أقل من 5%","التزيين والخبز","12 شهراً","مكان بارد وجاف",3,null],
    [11,4,5,"فستق حلبي مجروش","5","كرتون","تركيا","فستق حلبي","حجم 2-4 مم","البقلاوة والحلويات","12 شهراً","تبريد بعد الفتح",4,360],
    [12,4,5,"بندق محمص","10","كرتون","تركيا","بندق كامل","تحميص متوسط","الشوكولاتة والبرالين","10 أشهر","مكان بارد",3,540],
    [13,5,7,"خميرة فورية ذهبية","10","كرتون","فرنسا","خميرة جافة","نشاط مرتفع للعجين الحلو","البريوش والمعجنات","24 شهراً","مكان جاف وبارد",5,175],
    [14,5,7,"خميرة فورية حمراء","10","كرتون","فرنسا","خميرة جافة","مناسبة للعجين منخفض السكر","الخبز والصامولي","24 شهراً","مكان جاف وبارد",5,165],
    [15,6,2,"سكر ناعم للحلويات","25","كيس","السعودية","سكر أبيض مطحون","نعومة 100 ميكرون","الكريمة والتغطيات","24 شهراً","مكان جاف",10,78],
    [16,6,6,"فانيلا طبيعية مركزة","1","عبوة","مدغشقر","مستخلص فانيلا طبيعي","تركيز مزدوج","الكيك والكريمة والمشروبات","18 شهراً","مكان بارد ومظلم",6,155],
    [17,6,6,"لون غذائي أحمر","1","عبوة","إسبانيا","ملون غذائي معتمد","سائل عالي التركيز","الكيك والتزيين","24 شهراً","درجة حرارة الغرفة",6,62],
    [18,7,3,"زبدة صفائح 82%","10","كرتون","فرنسا","قشدة أبقار","دهون حليب 82%","الكرواسون والدانش","12 شهراً","تجميد -18 درجة",4,465],
    [19,7,3,"سمن نباتي للمخابز","15","كرتون","ماليزيا","زيوت نباتية مكررة","نقطة انصهار 42 درجة","البسكويت والمعمول","18 شهراً","أقل من 25 درجة",5,190],
    [20,7,3,"زبدة غير مملحة","20","كرتون","نيوزيلندا","قشدة أبقار","دهون حليب 82%","الكيك والكريمة","12 شهراً","تجميد -18 درجة",4,null],
    [21,8,1,"دقيق متعدد الاستخدام","45","كيس","السعودية","قمح","بروتين 11%","الكيك والخبز الخفيف","12 شهراً","مكان جاف",8,84],
    [22,8,2,"شراب جلوكوز","25","جالون","السعودية","جلوكوز الذرة","مواد صلبة 80%","الحلويات والآيس كريم","18 شهراً","درجة حرارة الغرفة",4,135],
    [23,8,6,"نكهة زعفران","1","عبوة","السعودية","نكهات غذائية","مركزة وقابلة للذوبان","الكيك والحلويات الشرقية","18 شهراً","مكان بارد",6,95],
    [24,8,8,"أكياس خبز شفافة","1000","كرتون","السعودية","بولي بروبلين غذائي","مقاس 20×40 سم","تغليف الخبز والمعجنات","36 شهراً","مكان جاف",3,110],
  ] as const;
  const insertProduct = directoryDb.prepare(`
    INSERT INTO products
      (id, supplier_id, category_id, name, weight, unit, country_of_origin, ingredients,
       technical_data, recommended_use, shelf_life, storage_conditions, min_order, price,
       image_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `);
  products.forEach((row, index) =>
    insertProduct.run(...row, `2026-09-${String(20 - (index % 18)).padStart(2, "0")}`),
  );

  const reviews = [
    [1,"مخبز الروضة",5,"جودة ثابتة والتزام ممتاز بمواعيد التوريد."],
    [1,"حلويات نورة",4,"الدقيق ممتاز وخدمة الفريق متعاونة."],
    [2,"كافيه ركن البن",5,"تشكيلة الشوكولاتة احترافية جداً."],
    [2,"مخبز الساحة",4,"تغليف جيد ووصول سريع."],
    [3,"حلويات الشرقية",5,"العلب أنيقة ومناسبة للعرض."],
    [3,"مقهى المرسى",4,"خيارات المقاسات متنوعة."],
    [4,"معمول الدار",4,"المكسرات طازجة وجودتها واضحة."],
    [4,"حلويات مكة",5,"الفستق ممتاز ومناسب للبقلاوة."],
    [5,"مخابز طيبة",5,"خميرة موثوقة ونتائجها متكررة."],
    [5,"فرن المدينة",5,"دعم فني جيد ومنتج ممتاز."],
    [6,"كيك الرياض",4,"النكهات مركزة والأسعار مناسبة."],
    [6,"بيت الحلوى",5,"سرعة في تجهيز الطلب."],
    [7,"مخبز الكورنيش",4,"الزبدة ممتازة للكرواسون."],
    [8,"مقهى الساحل",5,"مورد شامل وسهل التعامل."],
    [8,"حلويات الخليج",4,"تنوع جيد واستجابة سريعة."],
  ] as const;
  const insertReview = directoryDb.prepare(
    "INSERT INTO reviews (supplier_id, reviewer_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  reviews.forEach((row, index) =>
    insertReview.run(...row, `2026-09-${String(18 - (index % 14)).padStart(2, "0")}`),
  );
}

export function refreshSupplierRatings(supplierId?: number) {
  const where = supplierId ? "WHERE id = ?" : "";
  const statement = directoryDb.prepare(`
    UPDATE suppliers
    SET average_rating = COALESCE(
      (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE supplier_id = suppliers.id),
      0
    )
    ${where}
  `);
  supplierId ? statement.run(supplierId) : statement.run();
}

refreshSupplierRatings();