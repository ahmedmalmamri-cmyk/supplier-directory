import { useMemo, useState } from "react";
import { Check, CircleHelp, ClipboardList, Filter, Leaf, Pencil, Plus, Search, ShieldCheck, ShoppingBasket, Trash2, Wheat, X } from "lucide-react";

type Form = "حب" | "شرائح" | "بودرة";
type Processing = "ني" | "محمص";
type Variant = { id: number; form: Form; processing: Processing; size: string };
type Supplier = { name: string; city: string; note: string; variants: Variant[]; demo?: boolean };

const sizes = ["32", "34", "36"];
const initialOwn: Variant[] = [
  { id: 1, form: "حب", processing: "ني", size: "32" },
  { id: 2, form: "حب", processing: "ني", size: "34" },
  { id: 3, form: "حب", processing: "محمص", size: "32" },
  { id: 4, form: "شرائح", processing: "ني", size: "" },
  { id: 5, form: "بودرة", processing: "ني", size: "" },
];
const initialDirectory: Supplier[] = [
  { name: "محمصة السنبلة", city: "الرياض", note: "توريد للمخابز · عبوات حسب الطلب", variants: [
    { id: 11, form: "حب", processing: "ني", size: "32" }, { id: 12, form: "حب", processing: "ني", size: "34" }, { id: 13, form: "شرائح", processing: "ني", size: "" },
  ] },
  { name: "مواد أولية — بيت الدقيق", city: "جدة", note: "تواصل لتأكيد الكمية وموعد التسليم", variants: [
    { id: 21, form: "حب", processing: "محمص", size: "32" }, { id: 22, form: "بودرة", processing: "ني", size: "" },
  ] },
  { name: "مخزن ركن الحلويات", city: "الدمام", note: "توريد أسبوعي · تفاصيل التعبئة عند التواصل", variants: [
    { id: 31, form: "حب", processing: "ني", size: "36" }, { id: 32, form: "شرائح", processing: "محمص", size: "" },
  ] },
];

const variantLabel = (v: Variant) => `لوز ${v.form} ${v.processing}${v.size ? ` مقاس ${v.size}` : ""}`;

export function NutVariants() {
  const [role, setRole] = useState<"supplier" | "buyer">("supplier");
  const [own, setOwn] = useState(initialOwn);
  const [directory, setDirectory] = useState(initialDirectory);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Form>("حب");
  const [processing, setProcessing] = useState<Processing>("ني");
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["32"]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("لوز");
  const [filterForm, setFilterForm] = useState("");
  const [filterProcessing, setFilterProcessing] = useState("");
  const [filterSize, setFilterSize] = useState("");

  const ownVariants = useMemo(() => own.map(v => ({ ...v })), [own]);
  const results = useMemo(() => directory
    .map(supplier => ({ ...supplier, variants: supplier.variants.filter(v =>
      query.trim().toLocaleLowerCase("ar").split(/\s+/).filter(term => term !== "مقاس")
        .every(term => variantLabel(v).toLocaleLowerCase("ar").includes(term)) &&
      (!filterForm || v.form === filterForm) &&
      (!filterProcessing || v.processing === filterProcessing) &&
      (!filterSize || v.size === filterSize)
    ) }))
    .filter(supplier => supplier.variants.length > 0), [directory, query, filterForm, filterProcessing, filterSize]);

  function resetForm() {
    setEditing(null); setForm("حب"); setProcessing("ني"); setSelectedSizes(["32"]); setError("");
  }
  function beginEdit(v: Variant) {
    setEditing(v.id); setForm(v.form); setProcessing(v.processing); setSelectedSizes(v.size ? [v.size] : []); setError("");
    document.getElementById("variant-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function saveVariant() {
    const requested = form === "حب" ? selectedSizes : [""];
    if (form === "حب" && requested.length === 0) { setError("اختر مقاساً واحداً على الأقل لصنف حب."); return; }
    const base = editing === null ? own : own.filter(v => v.id !== editing);
    const duplicates = requested.filter(size => base.some(v => v.form === form && v.processing === processing && v.size === size));
    if (duplicates.length) { setError(`هذه التركيبة موجودة بالفعل${duplicates.length > 1 ? " للمقاسات " + duplicates.join("، ") : ""}.`); return; }
    const created = requested.map((size, index) => ({ id: editing !== null && index === 0 ? editing : Date.now() + index, form, processing, size }));
    setOwn([...base, ...created]); setError(""); setNotice(editing === null ? "أُضيفت الخيارات إلى قائمة المعاينة." : "تم تحديث الخيار في المعاينة."); resetForm();
  }
  function removeVariant(id: number) {
    setOwn(own.filter(v => v.id !== id)); setNotice("حُذف الخيار من قائمة المعاينة.");
    setDirectory(directory.map(s => s.demo ? { ...s, variants: s.variants.filter(v => v.id !== id) } : s));
  }
  function saveDemo() {
    const otherSuppliers = directory.filter(s => !s.demo);
    setDirectory([...otherSuppliers, { name: "مخبز التوريد التجريبي", city: "الرياض", note: "بيانات محلية للمعاينة · اسأل المورد عن توفر المخزون", variants: ownVariants, demo: true }]);
    setNotice("تم تحديث بيانات المورد التجريبية محلياً. ستظهر الخيارات المطابقة في اكتشاف المشتري.");
  }

  return (
    <main className="nv" dir="rtl">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
        .nv{--bg:#faf7f0;--ink:#35241e;--muted:#79675c;--line:#e8ded0;--card:#fffdf8;--primary:#8a4029;--primary-dark:#71331f;--sand:#f2e5d2;--gold:#bd8c3f;min-height:100vh;background:radial-gradient(ellipse at 84% 0%,#f2e5d277,transparent 34rem),var(--bg);color:var(--ink);font-family:'Cairo',sans-serif;padding:24px clamp(16px,4vw,58px) 56px;line-height:1.65}
        .nv *{box-sizing:border-box}.nv button,.nv input,.nv select{font:inherit}.nv button{cursor:pointer}.nv-shell{max-width:1120px;margin:auto}.nv-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:3px 0 22px;border-bottom:1px solid var(--line)}
        .nv-brand{display:flex;align-items:center;gap:11px}.nv-mark{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:var(--primary);color:#fff8ec}.nv-brandname{font-weight:800;font-size:17px;line-height:1.2}.nv-brandsub{font-size:11px;color:var(--muted);margin-top:3px}.nv-preview{display:flex;align-items:center;gap:7px;border:1px solid #e6cfaa;background:#fbf1df;color:#79511c;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:800;white-space:nowrap}
        .nv-hero{padding:26px 0 19px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px}.nv-kicker{font-size:12px;font-weight:800;color:var(--primary);display:flex;gap:7px;align-items:center}.nv h1{font-size:clamp(25px,4vw,38px);line-height:1.34;letter-spacing:-.045em;margin:7px 0 5px;font-weight:800}.nv-intro{margin:0;color:var(--muted);font-size:14px;max-width:620px}.nv-count{flex:0 0 auto;color:var(--muted);font-size:12px;border-inline-start:1px solid var(--line);padding-inline-start:18px}
        .nv-tabs{display:flex;padding:5px;background:#eee5d9;border-radius:14px;width:max-content;gap:4px;margin:5px 0 22px}.nv-tab{border:0;background:transparent;padding:9px 17px;border-radius:10px;color:#725f51;font-weight:800;font-size:13px;display:flex;align-items:center;gap:8px}.nv-tab.active{background:var(--card);color:var(--primary);box-shadow:0 2px 8px #49311b12}
        .nv-grid{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(280px,.82fr);gap:18px;align-items:start}.nv-panel{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:clamp(16px,2.4vw,25px);box-shadow:0 10px 34px #57391a08}.nv-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px}.nv h2{font-size:18px;margin:0 0 4px;line-height:1.4}.nv-sub{font-size:12px;color:var(--muted);margin:0}.nv-mini-tag{border-radius:999px;padding:4px 10px;font-size:10px;color:var(--primary);background:#f7ece1;font-weight:800;white-space:nowrap}
        .nv-list{display:grid;gap:9px}.nv-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 13px;border:1px solid var(--line);border-radius:13px;background:#fffefa}.nv-row-main{min-width:0}.nv-row-title{font-size:13px;font-weight:800}.nv-row-meta{font-size:11px;color:var(--muted);margin-top:2px}.nv-actions{display:flex;gap:5px;flex-shrink:0}.nv-icon{border:1px solid var(--line);background:#fffdf8;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:#806b5d}.nv-icon:hover{background:var(--sand);color:var(--primary)}.nv-icon.danger:hover{background:#fae7e2;color:#a63b28}
        .nv-formbox{margin-top:17px;padding:15px;border:1px dashed #d7c4ac;border-radius:15px;background:#fbf7ef}.nv-form-title{font-weight:800;font-size:13px;margin-bottom:12px}.nv-fields{display:grid;grid-template-columns:1fr 1fr;gap:11px}.nv-field label{display:block;font-size:11px;font-weight:800;margin-bottom:5px}.nv-field select,.nv-field input{width:100%;height:40px;border:1px solid #ddcfbf;border-radius:9px;padding:0 11px;color:var(--ink);background:#fffdf9;outline:none}.nv-field select:focus,.nv-field input:focus{border-color:var(--primary);box-shadow:0 0 0 3px #8a40291b}.nv-sizebox{grid-column:1/-1}.nv-sizes{display:flex;gap:8px;flex-wrap:wrap}.nv-check{display:flex;align-items:center;gap:7px;border:1px solid #ddcfbf;border-radius:9px;padding:6px 12px;background:#fffdf9;font-size:12px;font-weight:700;cursor:pointer}.nv-check:has(input:checked){border-color:var(--primary);background:#f7ece3;color:var(--primary)}.nv-check input{accent-color:var(--primary);width:15px;height:15px;margin:0}.nv-error{color:#a23f2b;font-size:11px;font-weight:700;margin:9px 0 0}.nv-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}
        .nv-btn{min-height:39px;border:1px solid var(--line);border-radius:10px;background:#fffdf8;color:var(--ink);padding:7px 13px;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:transform .16s,background .16s}.nv-btn:hover{transform:translateY(-1px);background:#f5eee3}.nv-btn.primary{background:var(--primary);color:#fffaf2;border-color:var(--primary)}.nv-btn.primary:hover{background:var(--primary-dark)}.nv-btn.quiet{background:transparent}.nv-sidenote{height:100%;background:#f4eadb;border:1px solid #ead8bd;border-radius:20px;padding:22px;position:relative;overflow:hidden}.nv-sidenote:after{content:"";position:absolute;bottom:-34px;left:-17px;width:110px;height:110px;border:1px solid #bd8c3f40;border-radius:50%;box-shadow:0 0 0 15px #bd8c3f0a,0 0 0 30px #bd8c3f08}.nv-noteicon{width:39px;height:39px;border-radius:12px;background:#fff9ed;color:#946421;display:grid;place-items:center;margin-bottom:12px}.nv-sidenote h3{font-size:16px;margin:0 0 7px}.nv-sidenote p{font-size:12px;color:#715e4e;margin:0}.nv-checklist{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:9px;color:#654f40;font-size:11px}.nv-checklist li{display:flex;gap:8px;align-items:center}.nv-checklist svg{color:#8e5b26;flex-shrink:0}.nv-toast{position:sticky;top:10px;z-index:2;margin:0 auto 14px;max-width:670px;display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:11px;background:#e8f1e7;color:#315c37;border:1px solid #c9dfc5;font-size:12px;font-weight:700;box-shadow:0 6px 18px #29201012}
        .nv-searchpanel{margin-bottom:16px}.nv-search-title{display:flex;align-items:center;gap:9px}.nv-filtergrid{display:grid;grid-template-columns:1.1fr 1fr 1fr .8fr;gap:10px}.nv-searchwrap{position:relative}.nv-searchwrap svg{position:absolute;right:11px;top:50%;transform:translateY(-50%);color:#8c7769}.nv-searchwrap input{padding-right:36px}.nv-results-top{display:flex;align-items:center;justify-content:space-between;margin:16px 0 10px}.nv-results-top strong{font-size:13px}.nv-results-top span{font-size:11px;color:var(--muted)}.nv-supplier-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:10px;box-shadow:0 8px 25px #57391a06}.nv-supplier-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.nv-supplier-name{font-weight:800;font-size:14px}.nv-location{font-size:11px;color:var(--muted)}.nv-demo{font-size:9px;background:#fbefdc;color:#865b20;border-radius:999px;padding:4px 8px;font-weight:800}.nv-tags{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.nv-tag{background:#f5eee4;border:1px solid #eee1d0;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:700;color:#644b3e}.nv-stock{display:flex;gap:7px;align-items:center;font-size:10px;color:#79675c;border-top:1px solid #f0e8dd;padding-top:10px}.nv-stock svg{color:#997746;flex-shrink:0}.nv-empty{border:1px dashed #dac9b4;border-radius:15px;padding:26px;text-align:center;color:var(--muted);background:#fffcf6}.nv-empty strong{display:block;color:var(--ink);font-size:13px;margin-bottom:4px}.nv-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);margin-top:22px;padding-top:14px;font-size:10px;color:#847367}.nv-foot b{color:var(--primary)}.nv-mobile-note{display:none}
        @media(max-width:760px){.nv{padding:16px 14px 36px}.nv-header{padding-bottom:15px}.nv-hero{display:block;padding:21px 0 14px}.nv-count{display:block;border:0;padding:0;margin-top:8px}.nv-grid{grid-template-columns:1fr}.nv-sidenote{display:none}.nv-filtergrid{grid-template-columns:1fr 1fr}.nv-filtergrid .nv-field:first-child{grid-column:1/-1}.nv-panel{border-radius:16px}.nv-tabs{width:100%}.nv-tab{flex:1;justify-content:center}.nv-foot{align-items:flex-start;flex-direction:column}.nv-mobile-note{display:flex;gap:8px;margin:0 0 14px;padding:10px 12px;background:#f8efdf;border-radius:11px;color:#6a5748;font-size:10px}.nv-panel-head{margin-bottom:14px}}
        @media(max-width:390px){.nv-preview{font-size:9px;padding:5px 8px}.nv-brandname{font-size:15px}.nv-fields{grid-template-columns:1fr}.nv-sizebox{grid-column:auto}.nv-row{padding:10px}.nv-actions{gap:3px}.nv-icon{width:30px;height:30px}}
      `}</style>
      <div className="nv-shell">
        <header className="nv-header">
          <div className="nv-brand"><div className="nv-mark"><Wheat size={22}/></div><div><div className="nv-brandname">دليل موردي المخابز</div><div className="nv-brandsub">الأصناف كما تحتاجها بالضبط</div></div></div>
          <div className="nv-preview"><CircleHelp size={14}/> معاينة تفاعلية · لا تحفظ بيانات حقيقية</div>
        </header>
        <section className="nv-hero">
          <div><div className="nv-kicker"><Leaf size={15}/> تنظيم أدق لصنف واحد</div><h1>لوز، لكن أي نوع تحتاج؟</h1><p className="nv-intro">كل مورد يختار الخيارات التي يوفّرها فعلاً؛ ابحث عن المقاس والتحضير المناسبين لمخبزك، أو حدّث قائمة أصنافك كمورد.</p></div>
          <div className="nv-count"><b>{own.length} خيارات</b> في قائمة المورد التجريبية</div>
        </section>
        <nav className="nv-tabs" aria-label="اختيار الدور">
          <button className={`nv-tab ${role === "supplier" ? "active" : ""}`} onClick={() => {setRole("supplier");setNotice("");}}><ClipboardList size={16}/> أنا مورد</button>
          <button className={`nv-tab ${role === "buyer" ? "active" : ""}`} onClick={() => {setRole("buyer");setNotice("");}}><ShoppingBasket size={16}/> أبحث كمخبز</button>
        </nav>
        {notice && <div className="nv-toast" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice("")} aria-label="إغلاق" style={{marginInlineStart:"auto",border:0,background:"transparent",color:"inherit",display:"grid",placeItems:"center"}}><X size={15}/></button></div>}
        {role === "supplier" ? <>
          <div className="nv-mobile-note"><ShieldCheck size={16}/> حدّد المتوفر عندك فقط؛ الخيارات لا تعني توافر مخزون مباشر.</div>
          <div className="nv-grid">
            <section className="nv-panel">
              <div className="nv-panel-head"><div><h2>خيارات اللوز التي أوردها</h2><p className="nv-sub">أضف التركيبات المتوفرة لديك، كل خيار مستقل عن الآخر.</p></div><span className="nv-mini-tag">{own.length} أصناف دقيقة</span></div>
              <div className="nv-list">
                {own.map(v => <div className="nv-row" key={v.id}><div className="nv-row-main"><div className="nv-row-title">{variantLabel(v)}</div><div className="nv-row-meta">{v.size ? "مقاس محدد" : "لا ينطبق المقاس على هذا الشكل"}</div></div><div className="nv-actions"><button className="nv-icon" onClick={() => beginEdit(v)} title="تعديل" aria-label={`تعديل ${variantLabel(v)}`}><Pencil size={15}/></button><button className="nv-icon danger" onClick={() => removeVariant(v.id)} title="حذف" aria-label={`حذف ${variantLabel(v)}`}><Trash2 size={15}/></button></div></div>)}
                {own.length === 0 && <div className="nv-empty"><strong>قائمتك فارغة حالياً</strong>أضف أول خيار ليظهر في اكتشاف المخابز.</div>}
              </div>
              <div className="nv-formbox" id="variant-form">
                <div className="nv-form-title">{editing === null ? "إضافة خيارات جديدة" : "تعديل الخيار"}</div>
                <div className="nv-fields">
                  <div className="nv-field"><label htmlFor="nv-form">شكل الصنف</label><select id="nv-form" value={form} onChange={e => {setForm(e.target.value as Form);setError("");}}><option value="حب">حب</option><option value="شرائح">شرائح</option><option value="بودرة">بودرة</option></select></div>
                  <div className="nv-field"><label htmlFor="nv-process">التحضير</label><select id="nv-process" value={processing} onChange={e => {setProcessing(e.target.value as Processing);setError("");}}><option value="ني">ني</option><option value="محمص">محمص</option></select></div>
                  {form === "حب" && <div className="nv-field nv-sizebox"><label>المقاسات المتوفرة (يمكن اختيار أكثر من مقاس)</label><div className="nv-sizes">{sizes.map(size => <label className="nv-check" key={size}><input type="checkbox" checked={selectedSizes.includes(size)} onChange={() => setSelectedSizes(selectedSizes.includes(size) ? selectedSizes.filter(s => s !== size) : [...selectedSizes, size])}/>{size}</label>)}</div></div>}
                </div>
                {error && <p className="nv-error" role="alert">{error}</p>}
                <div className="nv-form-actions"><button className="nv-btn primary" onClick={saveVariant}>{editing === null ? <><Plus size={15}/> أضف إلى القائمة</> : <><Check size={15}/> احفظ التعديل</>}</button>{editing !== null && <button className="nv-btn quiet" onClick={resetForm}>إلغاء</button>}</div>
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:14}}><button className="nv-btn primary" onClick={saveDemo}><Check size={15}/> حفظ القائمة التجريبية</button></div>
            </section>
            <aside className="nv-sidenote"><div className="nv-noteicon"><Wheat size={21}/></div><h3>كل مورد له خياراته</h3><p>المقاس 32 ليس افتراضياً لكل الموردين. نسجل ما يقدمه كل مورد فعلاً، ثم نطابق طلب المخبز مع الخيار المحدد.</p><ul className="nv-checklist"><li><Check size={15}/> حب ني — مقاس 32 و34</li><li><Check size={15}/> حب محمص — مقاس 32</li><li><Check size={15}/> شرائح ني — دون مقاس</li><li><Check size={15}/> بودرة</li></ul></aside>
          </div>
        </> : <>
          <section className="nv-panel nv-searchpanel">
            <div className="nv-panel-head"><div className="nv-search-title"><div className="nv-noteicon" style={{margin:0}}><Filter size={18}/></div><div><h2>ابحث عن خيار اللوز المناسب</h2><p className="nv-sub">النتيجة تعرض الموردين الذين أعلنوا هذه التركيبة فقط.</p></div></div><span className="nv-mini-tag">تصفية دقيقة</span></div>
            <div className="nv-filtergrid">
              <div className="nv-field"><label htmlFor="nv-query">اسم الصنف</label><div className="nv-searchwrap"><Search size={15}/><input id="nv-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="مثال: لوز"/></div></div>
              <div className="nv-field"><label htmlFor="nv-filter-form">الشكل</label><select id="nv-filter-form" value={filterForm} onChange={e => setFilterForm(e.target.value)}><option value="">كل الأشكال</option><option value="حب">حب</option><option value="شرائح">شرائح</option><option value="بودرة">بودرة</option></select></div>
              <div className="nv-field"><label htmlFor="nv-filter-process">التحضير</label><select id="nv-filter-process" value={filterProcessing} onChange={e => setFilterProcessing(e.target.value)}><option value="">ني أو محمص</option><option value="ني">ني</option><option value="محمص">محمص</option></select></div>
              <div className="nv-field"><label htmlFor="nv-filter-size">المقاس</label><select id="nv-filter-size" value={filterSize} onChange={e => setFilterSize(e.target.value)}><option value="">كل المقاسات</option>{sizes.map(s => <option value={s} key={s}>{s}</option>)}</select></div>
            </div>
          </section>
          <div className="nv-results-top"><strong>الموردون المطابقون</strong><span>{results.length} موردين · بيانات توضيحية</span></div>
          {results.map(s => <article className="nv-supplier-card" key={s.name}><div className="nv-supplier-top"><div><div className="nv-supplier-name">{s.name} <span className="nv-location">· {s.city}</span></div><div className="nv-location">{s.note}</div></div>{s.demo && <span className="nv-demo">تحديث محلي تجريبي</span>}</div><div className="nv-tags">{s.variants.map(v => <span className="nv-tag" key={v.id}>{variantLabel(v)}</span>)}</div><div className="nv-stock"><CircleHelp size={14}/> المخزون غير مباشر؛ اسأل المورد عن التوفر والكمية قبل الطلب.</div></article>)}
          {results.length === 0 && <div className="nv-empty"><strong>لا يوجد مورد معلن عن هذه التركيبة</strong>جرّب تغيير الشكل أو المقاس، أو اسأل الموردين عن خيارات أخرى.</div>}
        </>}
        <footer className="nv-foot"><span><b>بيانات الموردين والخيارات توضيحية</b> — لا يوجد اتصال أو حفظ خارج هذه المعاينة.</span><span>تأكيد الكمية والمخزون يكون بالتواصل مع المورد.</span></footer>
      </div>
    </main>
  );
}