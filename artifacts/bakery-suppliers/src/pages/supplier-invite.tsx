import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "wouter";
import { AlertCircle, ArrowRight, CheckCircle2, ImagePlus, LoaderCircle, MapPin, MessageCircle, ShieldCheck, Store, X } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getGetSupplierInviteQueryKey, useCompleteSupplierInvite, useGetSupplierInvite, useRecordSupplierInviteOpened } from "@workspace/api-client-react";

type FormState = { businessName: string; city: string; whatsapp: string; categories: string[]; otherCategory: string; description: string; images: string[] };

const ALMOND_CATEGORY_ANCHOR = "لوز حب";
const ALMOND_CATEGORY_NAMES = new Set([ALMOND_CATEGORY_ANCHOR, "لوز شرائح", "لوز مطحون"]);

export default function SupplierInvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const invite = useGetSupplierInvite(token, { query: { enabled: Boolean(token), queryKey: getGetSupplierInviteQueryKey(token) } });
  const opened = useRecordSupplierInviteOpened();
  const completed = useCompleteSupplierInvite();
  const openedFor = useRef("");
  const [submitted, setSubmitted] = useState<{ code: string; message: string } | null>(null);
  const [imageError, setImageError] = useState("");
  const [form, setForm] = useState<FormState>({ businessName: "", city: "", whatsapp: "", categories: [], otherCategory: "", description: "", images: [] });

  useEffect(() => {
    if (invite.data && !invite.data.alreadyCompleted && openedFor.current !== token) {
      openedFor.current = token;
      setForm({ businessName: invite.data.supplierName, city: invite.data.initialCity, whatsapp: invite.data.initialWhatsapp, categories: [], otherCategory: "", description: "", images: [] });
      opened.mutate({ token });
    }
  }, [invite.data, opened.mutate, token]);

  const errorKind = useMemo(() => {
    const message = invite.error instanceof Error ? invite.error.message.toLowerCase() : "";
    if (message.includes("expired") || message.includes("انته")) return "expired";
    if (message.includes("completed") || message.includes("مكتمل")) return "completed";
    return "invalid";
  }, [invite.error]);
  const inviteCategories = (invite.data?.categories ?? [])
    .filter((category) => !ALMOND_CATEGORY_NAMES.has(category.name) || category.name === ALMOND_CATEGORY_ANCHOR);

  const toggleCategory = (category: string) => setForm((current) => ({ ...current, categories: current.categories.includes(category) ? current.categories.filter((item) => item !== category) : [...current.categories, category] }));

  const updateImages = async (files: FileList | null) => {
    if (!files) return;
    const next = [...form.images];
    setImageError("");
    try {
      for (const file of Array.from(files).slice(0, 3 - next.length)) {
        next.push(await prepareInviteImage(file));
      }
      setForm((current) => ({ ...current, images: next.slice(0, 3) }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "تعذر تجهيز الصورة.");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    completed.mutate({ token, data: { businessName: form.businessName.trim(), city: form.city, whatsapp: form.whatsapp.trim(), categories: form.categories, ...(form.otherCategory.trim() ? { otherCategory: form.otherCategory.trim() } : {}), ...(form.description.trim() ? { description: form.description.trim() } : {}), ...(form.images.length ? { images: form.images } : {}) } }, {
      onSuccess: (result) => setSubmitted({ code: result.requestCode, message: result.message }),
    });
  };

  return <MainLayout><main className="min-h-[calc(100dvh-5rem)] px-4 py-8 md:py-14" dir="rtl"><div className="mx-auto max-w-3xl">
    <header className="mb-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-warm"><Store className="h-7 w-7" /></div><p className="mb-2 text-sm font-bold text-primary">دعوة خاصة من دليل موردي المخابز والحلويات</p><h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">أكمل ملف منشأتك بدقة</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">نريد أن يعرف أصحاب المخابز والمقاهي ما تقدمه فعلاً. راجع المعلومات التالية وأضف ما يساعدهم على اتخاذ قرار واضح.</p></header>
    {invite.isLoading && <InviteLoading />}
    {invite.isError && <InviteState kind={errorKind} />}
     {submitted && <SuccessState requestCode={submitted.code} message={submitted.message} />}
     {invite.data?.alreadyCompleted && !submitted && <InviteState kind="completed" />}
     {invite.data && !invite.data.alreadyCompleted && !submitted && <form onSubmit={submit} className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-secondary p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold">بيانات المنشأة</h2><p className="text-sm text-muted-foreground">يمكنك تعديل البيانات المقترحة من الإدارة.</p></div></div><div className="grid gap-4 md:grid-cols-2"><Field label="اسم المنشأة" value={form.businessName} onChange={(value) => setForm({ ...form, businessName: value })} required testId="input-invite-business-name" /><Field label="رقم واتساب" value={form.whatsapp} onChange={(value) => setForm({ ...form, whatsapp: value })} required ltr testId="input-invite-whatsapp" /><label className="block md:col-span-2"><span className="mb-1.5 block text-sm font-bold">المدينة</span><div className="relative"><MapPin className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><select data-testid="select-invite-city" required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="h-11 w-full appearance-none rounded-xl border bg-background px-10 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"><option value="">اختر المدينة</option>{invite.data.cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></div></label></div></section>
       <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><div className="mb-5"><h2 className="text-lg font-extrabold">ما الذي توفره؟</h2><p className="text-sm text-muted-foreground">اختر فئة واحدة على الأقل، ويمكنك اختيار أكثر من فئة.</p><p className="mt-2 rounded-xl border border-primary/15 bg-primary/[0.03] px-4 py-3 text-sm leading-6 text-muted-foreground">اختيار «لوز» يربط ملفك بفئة اللوز، ولا يعني أنك توفر جميع أنواعه. بعد الموافقة وتفعيل حسابك يمكنك ضبط الأنواع المتوفرة من لوحة المورد.</p></div><div className="grid gap-2 sm:grid-cols-2">{inviteCategories.map((category) => <button data-testid={`button-invite-category-${category.id}`} type="button" key={category.id} onClick={() => toggleCategory(category.name)} className={`flex items-center justify-between rounded-xl border p-3 text-right text-sm font-bold transition-colors ${form.categories.includes(category.name) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}><span>{category.name === ALMOND_CATEGORY_ANCHOR ? "لوز" : category.name}</span><span className={`h-4 w-4 rounded border ${form.categories.includes(category.name) ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>{form.categories.includes(category.name) && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}</span></button>)}</div>{invite.data.readyMixSubtypes.length > 0 && <div className="mt-5 border-t pt-4"><p className="mb-2 text-xs font-bold text-muted-foreground">تخصصات الخلطات الجاهزة (إن وجدت)</p><div className="flex flex-wrap gap-2">{invite.data.readyMixSubtypes.map((subtype) => <button data-testid={`button-invite-ready-mix-${subtype}`} type="button" key={subtype} onClick={() => toggleCategory(subtype)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${form.categories.includes(subtype) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>{subtype}</button>)}</div></div>}<label className="mt-4 block"><span className="mb-1.5 block text-sm font-bold">فئة أخرى <span className="font-normal text-muted-foreground">(اختياري)</span></span><input data-testid="input-invite-other-category" value={form.otherCategory} onChange={(event) => setForm({ ...form, otherCategory: event.target.value })} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="اكتب الفئة" /></label></section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7"><h2 className="text-lg font-extrabold">نبذة وصور</h2><label className="mt-4 block"><span className="mb-1.5 block text-sm font-bold">نبذة قصيرة <span className="font-normal text-muted-foreground">(اختياري)</span></span><textarea data-testid="textarea-invite-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={4} className="w-full resize-y rounded-xl border bg-background p-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="ما الذي يميز منتجاتكم أو خدمتكم؟" /></label><div className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold">صور المنتجات <span className="font-normal text-muted-foreground">(حتى 3، اختياري)</span></span><span className="text-xs text-muted-foreground">{form.images.length}/3</span></div><div className="grid grid-cols-3 gap-3">{form.images.map((image, index) => <div key={image} className="relative aspect-square overflow-hidden rounded-xl border bg-muted"><img data-testid={`img-invite-product-${index}`} src={image} alt={`صورة المنتج ${index + 1}`} className="h-full w-full object-cover" /><button data-testid={`button-remove-invite-image-${index}`} type="button" onClick={() => setForm((current) => ({ ...current, images: current.images.filter((_, itemIndex) => itemIndex !== index) }))} className="absolute left-1 top-1 rounded-full bg-foreground/75 p-1 text-background"><X className="h-3.5 w-3.5" /></button></div>)}{form.images.length < 3 && <label data-testid="label-invite-images" className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"><ImagePlus className="h-6 w-6" /><span className="text-xs font-bold">إضافة صورة</span><input data-testid="input-invite-images" type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void updateImages(event.target.files)} /></label>}</div></div></section>
       {imageError && <div data-testid="status-invite-image-error" className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{imageError}</div>}
       {completed.isError && <div data-testid="status-invite-submit-error" className="flex gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> تعذر إرسال البيانات. تحقق من الحقول وحاول مرة أخرى.</div>}
      <button data-testid="button-submit-supplier-invite" type="submit" disabled={completed.isPending || !form.businessName.trim() || !form.city || !form.whatsapp.trim() || form.categories.length === 0} className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">{completed.isPending ? <><LoaderCircle className="h-5 w-5 animate-spin" /> جاري إرسال الملف...</> : <><ArrowRight className="h-5 w-5" /> إرسال الملف للمراجعة</>}</button><p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> لن يتم نشر الملف قبل مراجعته من إدارة الدليل.</p>
    </form>}
  </div></main></MainLayout>;
}

function Field({ label, value, onChange, required, ltr, testId }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; ltr?: boolean; testId: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold">{label}</span><input data-testid={testId} required={required} value={value} onChange={(event) => onChange(event.target.value)} dir={ltr ? "ltr" : undefined} className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>;
}

function InviteLoading() {
  return <div className="space-y-4 rounded-2xl border bg-card p-6"><div className="h-6 w-1/3 animate-pulse rounded bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div>;
}

function InviteState({ kind }: { kind: string }) {
  const copy: Record<string, { title: string; body: string }> = { expired: { title: "انتهت صلاحية الدعوة", body: "اطلب من إدارة الدليل إنشاء رابط دعوة جديد لمنشأتك." }, completed: { title: "تم استكمال هذه الدعوة", body: "وصل ملف منشأتك إلى الإدارة. لا حاجة لإرسال النموذج مرة أخرى." }, invalid: { title: "الرابط غير صالح", body: "تحقق من الرابط أو تواصل مع الشخص الذي أرسل لك الدعوة." } };
  const contactPath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/contact`;
  return <div data-testid={`state-invite-${kind}`} className="rounded-2xl border bg-card p-8 text-center shadow-sm"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning"><AlertCircle className="h-7 w-7" /></div><h2 className="text-xl font-extrabold">{copy[kind].title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{copy[kind].body}</p><a data-testid="link-invite-contact" href={contactPath} className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold hover:bg-muted"><MessageCircle className="h-4 w-4" /> تواصل مع الإدارة</a></div>;
}

function SuccessState({ requestCode, message }: { requestCode: string; message: string }) {
  return <div data-testid="state-invite-success" className="animate-rise-in rounded-2xl border border-success/25 bg-card p-8 text-center shadow-warm md:p-12"><div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success"><CheckCircle2 className="h-9 w-9" /></div><p className="mb-2 text-sm font-bold text-success">تم استلام الملف بنجاح</p><h2 className="text-2xl font-extrabold">شكراً لتعاونك</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">{message || "سيراجع فريق الدليل بيانات منشأتك قبل نشرها."}</p><div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm font-bold">رقم الطلب: <span dir="ltr" className="text-primary">{requestCode}</span></div></div>;
}

function prepareInviteImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("اختر صورة بصيغة JPG أو PNG أو WebP."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("يجب ألا يتجاوز حجم الصورة الأصلية 10 ميجابايت."));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("تعذر تجهيز الصورة."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size > 4 * 1024 * 1024) {
          reject(new Error("تعذر ضغط الصورة إلى الحجم المطلوب."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
        reader.readAsDataURL(blob);
      }, "image/webp", 0.82);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("تعذر فتح الصورة."));
    };
    image.src = objectUrl;
  });
}