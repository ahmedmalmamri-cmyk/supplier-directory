import { MainLayout } from "@/components/layout/MainLayout";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useEffect, useMemo, useState } from "react";
import { Building2, CakeSlice, CheckCircle2, ChevronLeft, Coffee, Eye, EyeOff, Factory, FileUp, Hotel, ShoppingCart, Sprout, Store, UserPlus, Utensils, Wheat } from "lucide-react";

type RegistrationType = "supplier" | "buyer";
type SupplierForm = {
  businessName: string; contactPerson: string; businessType: string;
  phone: string; whatsapp: string; sameWhatsapp: boolean; email: string; website: string;
  city: string; address: string; deliversToOtherCities: boolean; otherCities: string;
  categories: string[]; minOrder: string; description: string;
  commercialLicense: string; idCard: string; healthCertificate: string;
  acceptedData: boolean; acceptedTerms: boolean; acceptedBusiness: boolean; acceptedPublish: boolean;
};
type BuyerForm = {
  fullName: string; phone: string; email: string; password: string; city: string; businessType: string;
  businessName: string; otherBusinessType: string; isOwner: boolean | null; jobTitle: string; newsletterWeekly: boolean; buyersGroup: boolean;
};

const supplierCities = ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن", "رأس تنورة"];
const buyerCities = ["الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن", "رأس تنورة", "بريدة", "تبوك", "أبها", "حائل", "جازان", "نجران", "سكاكا", "عرعر", "الطائف", "ينبع"];
const buyerBusinessTypes = [
  { value: "مخبز", icon: Wheat },
  { value: "محل حلويات", icon: CakeSlice },
  { value: "كافيه", icon: Coffee },
  { value: "مطعم", icon: Utensils },
  { value: "أسرة منتجة", icon: Factory },
  { value: "فندق", icon: Hotel },
  { value: "آخر", icon: Building2 },
];
const categories = [
  { value: "دقيق وخبز", label: "دقيق", icon: "🥖" },
  { value: "سكر ومحليات", label: "سكر", icon: "🍰" },
  { value: "زبدة ودهون", label: "زبدة ودهون", icon: "🧈" },
  { value: "حليب ومشتقاته", label: "حليب ومشتقاته", icon: "🥛" },
  { value: "أجبان", label: "أجبان", icon: "🧀" },
  { value: "شوكولاتة وكاكاو", label: "شوكولاتة", icon: "🍫" },
  { value: "مكسرات", label: "مكسرات", icon: "🥜" },
  { value: "خمائر ومحسنات", label: "خمائر", icon: "🧪" },
  { value: "عبوات وتغليف", label: "عبوات وتغليف", icon: "📦" },
  { value: "نكهات وألوان", label: "نكهات وألوان", icon: "🎨" },
  { value: "معدات وأدوات", label: "معدات وأدوات", icon: "🛠️" },
  { value: "أخرى", label: "أخرى", icon: "🛍️" },
];

const emptySupplier: SupplierForm = {
  businessName: "", contactPerson: "", businessType: "", phone: "", whatsapp: "", sameWhatsapp: true,
  email: "", website: "", city: "", address: "", deliversToOtherCities: false, otherCities: "",
  categories: [], minOrder: "", description: "", commercialLicense: "", idCard: "", healthCertificate: "",
  acceptedData: false, acceptedTerms: false, acceptedBusiness: false, acceptedPublish: false,
};
const emptyBuyer: BuyerForm = {
  fullName: "",
  phone: "",
  email: "",
  password: "",
  city: "",
  businessType: "",
  businessName: "",
  otherBusinessType: "",
  isOwner: null,
  jobTitle: "",
  newsletterWeekly: false,
  buyersGroup: false,
};

export default function RegisterPage({ defaultType }: { defaultType?: RegistrationType } = {}) {
  const requestedType = new URLSearchParams(window.location.search).get("type");
  const initialType = defaultType ?? (requestedType === "supplier" || requestedType === "buyer" ? requestedType : null);
  const [type, setType] = useState<RegistrationType | null>(initialType);
  const [supplier, setSupplier] = useState<SupplierForm>(() => loadDraft("supplier", emptySupplier));
  const [buyer, setBuyer] = useState<BuyerForm>(() => loadDraft("buyer", emptyBuyer));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{ code: string; type: RegistrationType } | null>(null);
  const { refresh } = useBuyerAuth();

  useEffect(() => saveDraft("supplier", supplier), [supplier]);
  useEffect(() => saveDraft("buyer", buyer), [buyer]);

  const title = type === "supplier" ? "تسجيل مورد" : type === "buyer" ? "تسجيل صاحب عمل" : "التسجيل في الدليل";
  const updateSupplier = (patch: Partial<SupplierForm>) => setSupplier((current) => ({ ...current, ...patch }));

  if (submitted) return <ThankYou requestCode={submitted.code} type={submitted.type} onAgain={() => { setSubmitted(null); setType(null); }} />;

  return (
    <MainLayout>
      <div className="bg-secondary/10 py-12 border-b">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center"><UserPlus className="w-7 h-7" /></div>
          <h1 className="text-4xl font-bold mb-4">{title}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{type === "buyer" ? "أنشئ حساباً مجانياً خلال دقيقة وابدأ التواصل مع الموردين مباشرة." : "أرسل طلب انضمامك في دقيقة: اختر فئتك وأدخل اسم النشاط ووسيلة التواصل والمدينة. تُراجع الطلبات قبل النشر."}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-5xl">
        {!type ? (
          <TypeChoice onSelect={setType} />
        ) : type === "supplier" ? (
          <SupplierWizard
            form={supplier}
            error={error}
            isSubmitting={isSubmitting}
            onChange={updateSupplier}
            onBack={() => { setType(null); setError(""); }}
            onSubmit={async () => {
              setError("");
              const validation = validateSupplier(supplier);
              if (validation) { setError(validation); return; }
              setIsSubmitting(true);
              try {
                const response = await postRegistration("/api/supplier-requests", {
                  businessName: supplier.businessName, contactPerson: supplier.contactPerson, businessType: supplier.businessType,
                  phone: normalizeSaudiPhone(supplier.phone), whatsapp: normalizeSaudiPhone(supplier.whatsapp), email: supplier.email, website: supplier.website,
                  city: supplier.city, address: supplier.address, deliversToOtherCities: supplier.deliversToOtherCities,
                  otherCities: supplier.otherCities, categories: supplier.categories, minOrder: supplier.minOrder,
                  description: supplier.description, commercialLicense: supplier.commercialLicense,
                  idCard: supplier.idCard, healthCertificate: supplier.healthCertificate,
                  acceptedData: supplier.acceptedData, acceptedTerms: supplier.acceptedTerms, acceptedBusiness: supplier.acceptedBusiness, acceptedPublish: supplier.acceptedPublish,
                });
                setSubmitted({ code: response.requestCode, type: "supplier" });
                localStorage.removeItem("bakery-supplier-registration-draft");
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : "تعذر إرسال الطلب.");
              } finally { setIsSubmitting(false); }
            }}
          />
        ) : (
          <BuyerForm
            form={buyer}
            error={error}
            isSubmitting={isSubmitting}
            onChange={(patch) => setBuyer((current) => ({ ...current, ...patch }))}
            onBack={() => { setType(null); setError(""); }}
            onSubmit={async () => {
              setError("");
              const validation = validateBuyer(buyer);
              if (validation) { setError(validation); return; }
              setIsSubmitting(true);
               try {
                 const response = await postRegistration("/api/buyer/register", {
                    ...buyer,
                    email: buyer.email.trim() || undefined,
                   phone: normalizeSaudiPhone(buyer.phone),
                 });
                 await refresh();
                setSubmitted({ code: response.requestCode, type: "buyer" });
                localStorage.removeItem("bakery-buyer-registration-draft");
              } catch (submitError) {
                setError(submitError instanceof Error ? submitError.message : "تعذر إرسال الطلب.");
              } finally { setIsSubmitting(false); }
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}

function TypeChoice({ onSelect }: { onSelect: (type: RegistrationType) => void }) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-center mb-2">من أنت؟ اختر نوع التسجيل</h2>
      <p className="text-muted-foreground text-center mb-8">سنستخدم بياناتك فقط لإدارة طلب التسجيل والتواصل معك.</p>
      <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        <button type="button" onClick={() => onSelect("supplier")} className="text-right bg-card border-2 border-transparent hover:border-primary rounded-3xl p-8 shadow-sm hover:shadow-lg transition-all group">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-105 transition-transform"><Sprout className="w-8 h-8" /></div>
          <h3 className="text-2xl font-bold mb-3">أنا مورد أو موزع للمواد الأولية</h3>
          <p className="text-muted-foreground text-lg">أريد عرض منتجاتي في الدليل</p>
             <span className="inline-flex items-center gap-2 text-primary font-bold mt-8">سجّل كمورد <ChevronLeft className="w-5 h-5" /></span>
        </button>
        <button type="button" onClick={() => onSelect("buyer")} className="text-right bg-card border-2 border-transparent hover:border-primary rounded-3xl p-8 shadow-sm hover:shadow-lg transition-all group">
           <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-105 transition-transform"><Store className="w-8 h-8" /></div>
          <h3 className="text-2xl font-bold mb-3">أنا صاحب عمل</h3>
          <p className="text-muted-foreground text-lg">أملك مخبز أو محل حلويات أو كافيه</p>
          <span className="inline-flex items-center gap-2 text-primary font-bold mt-8">سجّل كصاحب عمل <ChevronLeft className="w-5 h-5" /></span>
        </button>
      </div>
    </section>
  );
}

function SupplierWizard({ form, error, isSubmitting, onChange, onBack, onSubmit }: {
  form: SupplierForm; error: string; isSubmitting: boolean; onChange: (patch: Partial<SupplierForm>) => void;
  onBack: () => void; onSubmit: () => void;
}) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const acceptedAll = form.acceptedData && form.acceptedBusiness && form.acceptedTerms && form.acceptedPublish;
  return (
    <section className="bg-card border rounded-3xl p-5 md:p-8 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-6">
        <button type="button" onClick={() => { if (step === 0) onBack(); else { setStep(0); setStepError(""); } }} className="text-sm text-muted-foreground hover:text-foreground">{step === 0 ? "تغيير نوع التسجيل" : "السابق"}</button>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">الخطوة {step + 1} من 2 · نحو دقيقة</span>
      </div>
      {step === 0 ? (
        <SupplierCategoryStep
          selected={form.categories}
          error={stepError}
          onChange={(selected) => { onChange({ categories: selected }); setStepError(""); }}
          onNext={() => {
            if (!form.categories.length) { setStepError("اختر فئة واحدة على الأقل."); return; }
            setStep(1);
            setStepError("");
          }}
        />
      ) : (
        <>
      <div className="mb-6 rounded-xl bg-muted/30 p-4 text-sm">
        <span className="font-bold">فئاتك:</span> {form.categories.join("، ")}
        <button type="button" onClick={() => setStep(0)} className="mr-3 font-bold text-primary hover:underline">تعديل</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="اسم المورد أو النشاط التجاري *" value={form.businessName} onChange={(value) => onChange({ businessName: value })} autoComplete="organization" />
        <Field label="اسمك للتواصل *" value={form.contactPerson} onChange={(value) => onChange({ contactPerson: value })} autoComplete="name" />
        <SelectField label="نوع المورد *" value={form.businessType} options={["منتج / مصنع", "موزع", "مستورد", "تاجر جملة", "أخرى"]} onChange={(value) => onChange({ businessType: value })} placeholder="اختر نوع النشاط" />
        <SelectField label="المدينة *" value={form.city} options={supplierCities} onChange={(value) => onChange({ city: value })} placeholder="اختر المدينة" />
        <Field label="رقم الجوال وواتساب *" value={form.phone} onChange={(value) => onChange({ phone: value, ...(form.sameWhatsapp ? { whatsapp: value } : {}) })} dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX" />
        <div className="flex flex-col justify-center gap-3 rounded-xl border bg-muted/20 p-4">
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.sameWhatsapp} onChange={(event) => onChange({ sameWhatsapp: event.target.checked, ...(event.target.checked ? { whatsapp: form.phone } : {}) })} /> رقم واتساب المورد هو نفس رقم الجوال</label>
          {!form.sameWhatsapp && <Field label="رقم واتساب *" value={form.whatsapp} onChange={(value) => onChange({ whatsapp: value })} dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX" />}
        </div>
      </div>

      <details className="mt-6 rounded-2xl border border-border bg-muted/10 p-4">
        <summary className="cursor-pointer font-bold text-primary">تفاصيل إضافية اختيارية — لا تحتاجها لإرسال الطلب</summary>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="البريد الإلكتروني" value={form.email} onChange={(value) => onChange({ email: value })} dir="ltr" type="email" autoComplete="email" />
            <Field label="الموقع الإلكتروني" value={form.website} onChange={(value) => onChange({ website: value })} dir="ltr" placeholder="https://" />
            <Field label="العنوان التفصيلي" value={form.address} onChange={(value) => onChange({ address: value })} />
            <Field label="الحد الأدنى للطلب" value={form.minOrder} onChange={(value) => onChange({ minOrder: value })} placeholder="مثال: 10 كراتين" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.deliversToOtherCities} onChange={(event) => onChange({ deliversToOtherCities: event.target.checked })} /> أوصل إلى مدن أخرى</label>
          {form.deliversToOtherCities && <TextAreaField label="اذكر المدن التي توصل إليها" value={form.otherCities} onChange={(value) => onChange({ otherCities: value })} placeholder="اكتب المدن التي توصل إليها..." />}
          <TextAreaField label="نبذة عن النشاط" value={form.description} onChange={(value) => onChange({ description: value })} placeholder="عرّف بنشاطك والمنتجات التي توفرها..." />
          <div className="grid gap-4 md:grid-cols-2">
            <FileField label="السجل التجاري (اختياري)" value={form.commercialLicense} onChange={(value) => onChange({ commercialLicense: value })} />
            <FileField label="صورة الهوية (اختياري)" value={form.idCard} onChange={(value) => onChange({ idCard: value })} />
            <FileField label="الشهادة الصحية (اختياري)" value={form.healthCertificate} onChange={(value) => onChange({ healthCertificate: value })} />
          </div>
        </div>
      </details>

      <div className="mt-6 border-t pt-5">
        <CheckField
          label="أؤكد صحة البيانات، وأن نشاطي مرتبط بقطاع المخابز والحلويات، وأوافق على الشروط ونشر بياناتي في الدليل بعد مراجعة الإدارة."
          checked={acceptedAll}
          onChange={(value) => onChange({ acceptedData: value, acceptedBusiness: value, acceptedTerms: value, acceptedPublish: value })}
        />
      </div>

      {error && <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      <div className="mt-7 flex flex-col-reverse justify-between gap-3 border-t pt-6 sm:flex-row">
        <button type="button" onClick={() => setStep(0)} className="rounded-xl border px-5 py-3 font-bold hover:bg-muted">السابق</button>
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{isSubmitting ? "جاري الإرسال..." : "أرسل طلب الانضمام"}</button>
      </div>
        </>
      )}
    </section>
  );
}

function SupplierCategoryStep({ selected, error, onChange, onNext }: {
  selected: string[];
  error: string;
  onChange: (selected: string[]) => void;
  onNext: () => void;
}) {
  const selectedCount = selected.length;
  return (
    <div>
      <h2 className="text-2xl font-extrabold">ما الذي تبيعه؟</h2>
      <p className="mt-1 text-sm text-muted-foreground">اختر كل ما ينطبق. يكفي تحديد الفئة؛ تفاصيل الأنواع والتوفر تُعرف عبر واتساب.</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {categories.map((category) => {
          const isSelected = selected.includes(category.value);
          return (
            <label key={category.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${isSelected ? "border-primary bg-primary/5 font-bold text-primary" : "hover:border-primary/50"}`}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(event) => onChange(event.target.checked
                  ? [...selected, category.value]
                  : selected.filter((item) => item !== category.value))}
                className="h-4 w-4 accent-primary"
              />
              <span aria-hidden="true" className="text-xl">{category.icon}</span>
              <span>{category.label}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-4 rounded-xl bg-muted/30 px-4 py-3 text-sm font-bold" aria-live="polite">
        {selectedCount
          ? `اخترت ${selectedCount} ${selectedCount === 1 ? "صنفاً" : "أصناف"}`
          : "اختر فئة واحدة على الأقل للمتابعة"}
      </p>
      {error && <p className="mt-3 text-sm font-bold text-destructive" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end border-t pt-5">
        <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90">
          التالي <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function BuyerForm({ form, error, isSubmitting, onChange, onBack, onSubmit }: { form: BuyerForm; error: string; isSubmitting: boolean; onChange: (patch: Partial<BuyerForm>) => void; onBack: () => void; onSubmit: () => void }) {
  return <section className="max-w-2xl mx-auto bg-card border rounded-3xl p-6 md:p-8 shadow-sm">
    <button type="button" onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground mb-6">تغيير نوع التسجيل</button>
    <div className="flex items-start gap-4 mb-7">
      <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><ShoppingCart className="w-6 h-6" /></div>
      <div>
        <h2 className="text-2xl font-bold mb-2">تسجيل صاحب عمل</h2>
        <p className="text-muted-foreground">بيانات بسيطة تساعدنا على ترشيح الموردين المناسبين لك.</p>
      </div>
    </div>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="space-y-5">
       <Field label="الاسم الكامل *" value={form.fullName} onChange={(value) => onChange({ fullName: value })} autoComplete="name" />
       <Field label="رقم الجوال *" value={form.phone} onChange={(value) => onChange({ phone: value })} dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX" />
         <Field label="البريد الإلكتروني (اختياري)" value={form.email} onChange={(value) => onChange({ email: value })} dir="ltr" type="email" autoComplete="email" placeholder="name@example.com" />
          <Field label="كلمة المرور *" value={form.password} onChange={(value) => onChange({ password: value })} dir="ltr" type="password" autoComplete="new-password" placeholder="لا تقل عن ٦" showPasswordToggle />
       <fieldset>
         <legend className="text-sm font-bold mb-3">هل أنت صاحب العمل؟ *</legend>
         <div className="grid grid-cols-2 gap-3">
           <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${form.isOwner === true ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
             <input type="radio" name="buyer-is-owner" checked={form.isOwner === true} onChange={() => onChange({ isOwner: true, jobTitle: "" })} className="accent-primary" />
             <span>نعم</span>
           </label>
           <label className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${form.isOwner === false ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
             <input type="radio" name="buyer-is-owner" checked={form.isOwner === false} onChange={() => onChange({ isOwner: false })} className="accent-primary" />
             <span>لا</span>
           </label>
         </div>
       </fieldset>
        {form.isOwner === false && <Field label="المسمى الوظيفي أو الصفة في المنشأة *" value={form.jobTitle} onChange={(value) => onChange({ jobTitle: value })} placeholder="مثال: مسؤول مشتريات، شيف، مدير فرع..." />}
      <SelectField label="المدينة *" value={form.city} options={buyerCities} onChange={(value) => onChange({ city: value })} placeholder="اختر المدينة" />
       <fieldset>
        <legend className="text-sm font-bold mb-3">نوع النشاط *</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
           {buyerBusinessTypes.map(({ value: businessType, icon: BusinessIcon }) => <label key={businessType} className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${form.businessType === businessType ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}>
             <input type="radio" name="buyer-business-type" value={businessType} checked={form.businessType === businessType} onChange={() => onChange({ businessType, ...(businessType === "آخر" ? {} : { otherBusinessType: "" }) })} className="accent-primary" />
             <BusinessIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
             <span>{businessType}</span>
          </label>)}
        </div>
      </fieldset>
       {form.businessType === "آخر" && <TextAreaField label="اذكر نوع النشاط *" value={form.otherBusinessType} onChange={(value) => onChange({ otherBusinessType: value })} placeholder="مثال: تموينات، سوبرماركت، محل بقالة، موزع..." />}
       <Field label="اسم النشاط التجاري (اختياري)" value={form.businessName} onChange={(value) => onChange({ businessName: value })} />
      <div className="rounded-2xl border bg-muted/20 p-4 space-y-4">
        <p className="text-sm font-bold">خيارات التواصل</p>
         <CheckField label="أرغب باستقبال نشرة الأسعار الأسبوعية (يتطلب البريد الإلكتروني)" checked={form.newsletterWeekly} onChange={(value) => onChange({ newsletterWeekly: value })} />
         <CheckField label="أرغب بالانضمام إلى مجموعة أصحاب الأعمال" checked={form.buyersGroup} onChange={(value) => onChange({ buyersGroup: value })} />
      </div>
      {error && <div className="rounded-xl bg-destructive/10 text-destructive border border-destructive/20 p-4 text-sm">{error}</div>}
       <button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-60">{isSubmitting ? "جاري التسجيل..." : "تسجيل"}</button>
     </form>
  </section>;
}

function ThankYou({ requestCode, type, onAgain }: { requestCode: string; type: RegistrationType; onAgain: () => void }) {
  const [whatsapp, setWhatsapp] = useState("0566866805");

  useEffect(() => {
    fetch("/api/contact-settings")
      .then((response) => response.json())
      .then((data: { whatsapp?: string }) => {
        if (data.whatsapp) setWhatsapp(data.whatsapp);
      })
      .catch(() => undefined);
  }, []);

   const whatsappHref = buildWhatsAppUrl(whatsapp);
  return <MainLayout><div className="container mx-auto px-4 py-20 max-w-2xl text-center">
    <CheckCircle2 className="w-20 h-20 text-green-600 mx-auto mb-6" />
     <h1 className="text-3xl font-bold mb-4">{type === "buyer" ? "شكراً لك! تم استلام طلبك كصاحب عمل" : "تم استلام طلبك بنجاح"}</h1>
      <p className="text-lg text-muted-foreground leading-8">{type === "buyer" ? "تم إنشاء حسابك وتسجيل دخولك تلقائياً. يمكنك الآن التواصل مع جميع الموردين." : "تم استلام طلبك. تراجعه الإدارة قبل نشر ملف المورد، ثم تتواصل معك خلال 48 ساعة. لا يلزمك تحديث المنتجات يومياً؛ يمكن لأصحاب الأعمال الاستفسار عن الأنواع والتوفر عبر واتساب."}</p>
    <div className="my-8 rounded-2xl bg-primary/10 border border-primary/20 p-5"><div className="text-sm text-muted-foreground mb-2">رقم طلبك المرجعي</div><strong dir="ltr" className="text-2xl text-primary">{requestCode}</strong></div>
     <p className="text-sm text-muted-foreground mb-8">في حال لم يتم التواصل خلال 48 ساعة، يمكنك مراسلتنا على <a href={whatsappHref} target="_blank" rel="noreferrer" dir="ltr" className="text-primary font-bold hover:underline">{whatsapp}</a>.</p>
     <button type="button" onClick={onAgain} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold">تسجيل طلب آخر ({type === "supplier" ? "مورد" : "صاحب عمل"})</button>
  </div></MainLayout>;
}

function Field({ label, value, onChange, dir, type = "text", placeholder, disabled, autoComplete, showPasswordToggle }: { label: string; value: string; onChange: (value: string) => void; dir?: "ltr" | "rtl"; type?: string; placeholder?: string; disabled?: boolean; autoComplete?: string; showPasswordToggle?: boolean }) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const canTogglePassword = showPasswordToggle && type === "password";
  const inputType = canTogglePassword && isPasswordVisible ? "text" : type;
  return <label className="block">
    <span className="text-sm font-bold block mb-2">{label}</span>
    <div className="relative">
      <input type={inputType} value={value} dir={dir} disabled={disabled} autoComplete={autoComplete} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`w-full h-12 px-4 ${canTogglePassword ? "pl-12" : ""} rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60`} />
      {canTogglePassword && <button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)} aria-label={isPasswordVisible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {isPasswordVisible ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
      </button>}
    </div>
  </label>;
}
function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="text-sm font-bold block mb-2">{label}</span><textarea value={value} dir="rtl" placeholder={placeholder} rows={3} onChange={(event) => onChange(event.target.value)} className="w-full min-h-28 px-4 py-3 rounded-xl border bg-background leading-7 outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y break-words" /></label>;
}
function SelectField({ label, value, options, onChange, placeholder }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="text-sm font-bold block mb-2">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary"><option value="">{placeholder}</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" /><span>{label}</span></label>;
}
function FileField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block border border-dashed rounded-xl p-4 cursor-pointer hover:border-primary"><span className="flex items-center gap-2 text-sm font-bold mb-2"><FileUp className="w-4 h-4 text-primary" />{label}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onChange(await readFile(file)); }} className="block w-full text-sm" />{value && <span className="text-xs text-green-700 mt-2 block">تم تجهيز الملف للإرسال</span>}</label>;
}

function validateSupplier(form: SupplierForm) {
  if (!form.businessName.trim() || !form.contactPerson.trim() || !form.businessType) return "أدخل اسم النشاط واسم مسؤول التواصل ونوع المورد.";
  if (!isSaudiPhone(form.phone)) return "أدخل رقم الجوال بصيغة صحيحة، مثل 05XXXXXXXX.";
  if (!isSaudiPhone(form.whatsapp)) return form.sameWhatsapp ? "تحقق من رقم الجوال." : "أدخل رقم الواتساب أو فعّل خيار «رقم واتساب المورد هو نفس رقم الجوال».";
  if (!form.city) return "اختر المدينة.";
  if (!form.categories.length) return "اختر فئة واحدة على الأقل، مثل زبدة.";
  if (form.deliversToOtherCities && !form.otherCities.trim()) return "اذكر المدن التي توصل إليها أو ألغِ خيار التوصيل لمدن أخرى.";
  if (!form.acceptedData || !form.acceptedTerms || !form.acceptedBusiness || !form.acceptedPublish) return "وافق على الإقرار قبل إرسال الطلب.";
  if (wordCount(form.description) > 300) return "اختصر النبذة إلى 300 كلمة أو أقل.";
  return "";
}
function validateBuyer(form: BuyerForm) {
  const email = form.email.trim();
  if (!form.fullName.trim()) return "أدخل الاسم الكامل.";
  if (!isSaudiPhone(form.phone)) return "أدخل رقم الجوال بصيغة صحيحة، مثل 05XXXXXXXX.";
  if (email && (email.length > 160 || !email.includes("@"))) return "أدخل بريداً إلكترونياً صحيحاً أو اترك الحقل فارغاً.";
  if (form.password.length < 6 || !/^[A-Za-z0-9]+$/.test(form.password)) return "أدخل كلمة مرور من 6 خانات على الأقل، أرقام أو أحرف إنجليزية فقط.";
  if (form.isOwner === null) return "حدد هل أنت صاحب العمل: نعم أو لا.";
  if (!form.city) return "اختر المدينة.";
  if (!form.businessType) return "اختر نوع النشاط.";
  if (form.newsletterWeekly && !email) return "أدخل البريد الإلكتروني للاشتراك في النشرة الأسبوعية، أو ألغِ اختيار النشرة.";
  if (form.businessType === "آخر" && (form.otherBusinessType.trim().length < 2 || form.otherBusinessType.trim().length > 80)) return "اذكر نوع النشاط عند اختيار «آخر».";
  if (form.isOwner === false && (form.jobTitle.trim().length < 2 || form.jobTitle.trim().length > 80)) return "أدخل المسمى الوظيفي عند اختيار «لا».";
  return "";
}
function normalizeSaudiPhone(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const westernDigits = value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));
  const digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  return digits;
}
function isSaudiPhone(value: string) {
  return /^05\d{8}$/.test(normalizeSaudiPhone(value));
}
function wordCount(value: string) { return value.trim().split(/\s+/).filter(Boolean).length; }
async function readFile(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }
async function postRegistration(url: string, data: unknown): Promise<{ requestCode: string }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "تعذر إرسال الطلب.");
  return result;
}
function loadDraft<T>(key: string, fallback: T): T { try { const saved = localStorage.getItem(`bakery-${key}-registration-draft`); return saved ? { ...fallback, ...JSON.parse(saved) } : fallback; } catch { return fallback; } }
function saveDraft<T>(key: string, value: T) { try { const safeValue = key === "buyer" ? { ...(value as BuyerForm), password: "" } : value; localStorage.setItem(`bakery-${key}-registration-draft`, JSON.stringify(safeValue)); } catch { /* local storage may be unavailable */ } }