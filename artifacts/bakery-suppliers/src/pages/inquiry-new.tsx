import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowRight, Camera, MapPin, PackageSearch, ShieldCheck } from "lucide-react";
import { getGetBuyerItemInquiryMatchesQueryKey, getListBuyerItemInquiriesQueryKey, getListItemCategoriesQueryKey, useCreateBuyerItemInquiry, useCreateBuyerItemInquiryPhotoUploadUrl, useGetBuyerItemInquiryMatches, useListItemCategories, type BuyerItemInquiryInput, type ItemInquiryPhotoUploadInput } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InquiryGuard, InquiryHeader, InquiryLoading } from "@/components/inquiries/shared";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

type Values = { itemId: number; brandOrType: string; city: string; allowAlternatives: boolean; packageDetails: string; note: string; quantity: string };
export default function NewInquiryPage() {
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const initialId = Number(new URLSearchParams(window.location.search).get("itemId"));
  const form = useForm<Values>({ defaultValues: { itemId: Number.isInteger(initialId) && initialId > 0 ? initialId : 0, brandOrType: "", city: user?.city || "", allowAlternatives: false, packageDetails: "", note: "", quantity: "" } });
  useEffect(() => { if (user?.city && !form.getValues("city") && !form.getFieldState("city").isDirty) form.setValue("city", user.city); }, [user?.city, form]);
  const itemId = Number(form.watch("itemId"));
  const city = form.watch("city")?.trim() || "";
  const enabled = !buyerLoading && !supplierLoading && !!user?.isOwner && !supplier;
  const categories = useListItemCategories({ query: { queryKey: getListItemCategoriesQueryKey(), enabled } });
  const matchParams = { itemId, city };
  const matches = useGetBuyerItemInquiryMatches(matchParams, { query: { enabled: enabled && itemId > 0 && !!city, queryKey: getGetBuyerItemInquiryMatchesQueryKey(matchParams) } });
  const create = useCreateBuyerItemInquiry();
  const upload = useCreateBuyerItemInquiryPhotoUploadUrl();
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdPhoto, setCreatedPhoto] = useState<{ id: number; url: string } | null>(null);
  const onPhoto = (file?: File) => {
    setError("");
    if (!file) { setPhoto(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5242880 || file.size === 0) { setPhoto(null); setError("ارفع صورة JPEG أو PNG أو WEBP بحجم لا يتجاوز 5 ميغابايت."); return; }
    setPhoto(file);
  };
  const submit = async (values: Values) => {
    setError("");
    if (!Number.isInteger(Number(values.itemId)) || Number(values.itemId) < 1) { form.setError("itemId", { message: "اختر الصنف المطلوب" }); return; }
    if (!values.brandOrType.trim() || !values.city.trim()) return;
    const quantity = values.quantity.trim() ? Number(values.quantity) : undefined;
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) { form.setError("quantity", { message: "أدخل كمية أكبر من صفر" }); return; }
    setSubmitting(true);
    try {
      let photoPath: string | undefined;
      if (photo) {
        const signed = await upload.mutateAsync({ data: { name: photo.name, size: photo.size, contentType: photo.type as ItemInquiryPhotoUploadInput["contentType"] } });
        const result = await fetch(signed.uploadUrl, { method: "PUT", body: photo, headers: { "Content-Type": photo.type } });
        if (!result.ok) throw new Error("تعذر رفع الصورة. حاول مرة أخرى.");
        photoPath = signed.objectPath;
      }
      const data: BuyerItemInquiryInput = { itemId: Number(values.itemId), brandOrType: values.brandOrType.trim(), city: values.city.trim(), allowAlternatives: values.allowAlternatives, ...(values.packageDetails.trim() ? { packageDetails: values.packageDetails.trim() } : {}), ...(values.note.trim() ? { note: values.note.trim() } : {}), ...(quantity ? { quantity } : {}), ...(photoPath ? { photoPath } : {}) };
      const created = await create.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getListBuyerItemInquiriesQueryKey() });
      if (photoPath) { setCreatedPhoto({ id: created.id, url: created.photoUrl || `/api/item-inquiries/${created.id}/photo` }); return; }
      navigate("/inquiries");
    } catch (e) { setError(e instanceof Error && e.message === "تعذر رفع الصورة. حاول مرة أخرى." ? e.message : "تعذر إرسال الاستفسار. راجع التفاصيل وحاول مرة أخرى."); }
    finally { setSubmitting(false); }
  };
  return <MainLayout><InquiryHeader eyebrow="استفسار عن منتج محدد" title="اسأل عن العلامة أو النوع بالضبط" description="استفسار قصير يصل إلى الموردين المعنيين في مدينتك. لا يلزمك طلب كمية جملة." action={<Link href="/inquiries" data-testid="link-my-inquiries" className="inquiry-btn inquiry-btn-outline"><ArrowRight className="h-4 w-4" /> استفساراتي</Link>} />
    <div className="container mx-auto max-w-6xl flex-1 px-4 py-8 md:py-11">{buyerLoading || supplierLoading ? <InquiryLoading /> : !enabled ? <InquiryGuard kind={supplier ? "owner" : user ? "owner" : "buyer"} /> : createdPhoto ? <section className="inquiry-surface mx-auto max-w-xl p-8 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-3 text-2xl font-extrabold">تم إرسال الاستفسار</h2><p className="mt-2 text-sm text-muted-foreground">يمكنك متابعة الردود من استفساراتي.</p><img src={createdPhoto.url} alt="الصورة المرجعية المرفقة" data-testid="img-created-inquiry-photo" className="mx-auto mt-5 max-h-52 rounded-xl object-contain" /><Link href="/inquiries" data-testid="link-view-created-inquiry" className="inquiry-btn inquiry-btn-primary mt-6">عرض استفساراتي</Link></section> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="inquiry-surface p-5 md:p-8"><h2 className="text-xl font-extrabold">تفاصيل المنتج</h2><p className="mb-7 mt-1 text-sm text-muted-foreground">كلما كان الاسم والعبوة أوضح، كان الرد أدق.</p>
        {categories.isLoading ? <InquiryLoading /> : categories.error ? <div role="alert" className="rounded-xl bg-destructive/10 p-4 text-destructive">تعذر تحميل الأصناف. <button type="button" data-testid="button-retry-inquiry-items" onClick={() => void categories.refetch()} className="font-bold underline">إعادة المحاولة</button></div> : <Form {...form}><form data-testid="form-new-inquiry" onSubmit={form.handleSubmit(submit)} className="space-y-5">
          <FormField control={form.control} name="itemId" rules={{ validate: v => Number(v) > 0 || "اختر الصنف المطلوب" }} render={({ field }) => <FormItem><FormLabel>الصنف المطلوب *</FormLabel><FormControl><select {...field} value={field.value || ""} onChange={e => field.onChange(Number(e.target.value))} data-testid="select-inquiry-item" className="inquiry-field"><option value="" disabled>اختر من أصناف الدليل</option>{(categories.data || []).filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormControl><FormMessage /></FormItem>} />
          <div className="grid gap-5 md:grid-cols-2"><FormField control={form.control} name="brandOrType" rules={{ required: "اكتب العلامة أو النوع", maxLength: { value: 160, message: "الحد الأقصى 160 حرفاً" } }} render={({ field }) => <FormItem><FormLabel>العلامة التجارية أو النوع *</FormLabel><FormControl><input {...field} data-testid="input-inquiry-brand" maxLength={160} placeholder="اكتب الاسم كما يظهر على العبوة" className="inquiry-field" /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="city" rules={{ required: "اكتب المدينة", maxLength: 80 }} render={({ field }) => <FormItem><FormLabel>المدينة *</FormLabel><FormControl><input {...field} data-testid="input-inquiry-city" maxLength={80} placeholder="مدينة الفرع المطلوب" className="inquiry-field" /></FormControl><FormMessage /></FormItem>} /></div>
          <div className="grid gap-5 md:grid-cols-2"><FormField control={form.control} name="packageDetails" render={({ field }) => <FormItem><FormLabel>حجم أو وصف العبوة (اختياري)</FormLabel><FormControl><input {...field} data-testid="input-inquiry-package" maxLength={200} placeholder="مثلاً: علبة 500 غرام" className="inquiry-field" /></FormControl></FormItem>} /><FormField control={form.control} name="quantity" render={({ field }) => <FormItem><FormLabel>الكمية التقريبية (اختياري)</FormLabel><FormControl><input {...field} data-testid="input-inquiry-quantity" type="number" min="0.01" step="any" placeholder="إن كنت تعرفها" className="inquiry-field" /></FormControl><FormMessage /></FormItem>} /></div>
          <FormField control={form.control} name="note" render={({ field }) => <FormItem><FormLabel>ملاحظة للمورد (اختياري)</FormLabel><FormControl><textarea {...field} data-testid="textarea-inquiry-note" maxLength={1000} rows={3} placeholder="تفاصيل تساعد في تحديد المنتج المطلوب" className="inquiry-field resize-y" /></FormControl></FormItem>} />
          <FormField control={form.control} name="allowAlternatives" render={({ field }) => <FormItem><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/20 p-4"><input type="checkbox" checked={field.value} onChange={field.onChange} data-testid="checkbox-inquiry-alternatives" className="mt-1 accent-primary" /><span><strong className="block text-sm">أقبل اقتراح بديل</strong><span className="text-xs text-muted-foreground">إذا لم يتوفر المنتج المحدد، يمكن للمورد عرض بديل مع توضيحه.</span></span></label></FormItem>} />
          <label className="block rounded-xl border border-dashed border-border p-4"><span className="flex items-center gap-2 text-sm font-extrabold"><Camera className="h-4 w-4 text-primary" /> صورة العبوة (اختياري)</span><span className="mt-1 block text-xs text-muted-foreground">JPEG أو PNG أو WEBP، حتى 5 ميغابايت. الصورة مرجعية للاستفسار.</span><input data-testid="input-inquiry-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onPhoto(e.target.files?.[0])} className="mt-3 block w-full text-sm" />{photo && <span className="mt-2 block text-xs">{photo.name}</span>}</label>
          {error && <p role="alert" data-testid="status-inquiry-create-error" className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3 border-t border-border pt-5"><button data-testid="button-submit-inquiry" type="submit" disabled={submitting} className="inquiry-btn inquiry-btn-primary">{submitting ? "جارٍ إرسال الاستفسار..." : "إرسال الاستفسار"}</button><Link href="/inquiries" data-testid="link-cancel-inquiry" className="inquiry-btn inquiry-btn-outline">إلغاء</Link></div>
        </form></Form>}
      </section><aside className="space-y-4"><div className="inquiry-surface p-5"><MapPin className="h-5 w-5 text-primary" /><h3 className="mt-3 font-extrabold">الموردون المطابقون</h3>{itemId && city ? matches.isLoading ? <div className="mt-3 h-8 animate-pulse rounded bg-muted" /> : matches.error ? <p role="alert" className="mt-2 text-sm text-destructive">تعذر التحقق. <button type="button" data-testid="button-retry-inquiry-matches" onClick={() => void matches.refetch()} className="underline">إعادة المحاولة</button></p> : <p data-testid="text-inquiry-matches" className="mt-2 text-sm leading-7 text-muted-foreground">{matches.data?.count ? `${matches.data.count.toLocaleString("ar-SA")} مورد مطابق للصنف والمدينة. التوفر الفعلي يتأكد من الرد.` : "لا يوجد مورد مطابق حالياً في هذه المدينة. يمكنك تعديل الصنف أو المدينة."}</p> : <p className="mt-2 text-sm leading-7 text-muted-foreground">حدد الصنف والمدينة لمعرفة عدد الموردين المحتملين.</p>}</div><div className="inquiry-surface p-5"><PackageSearch className="h-5 w-5 text-primary" /><h3 className="mt-3 font-extrabold">هذا ليس طلب جملة</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">اسأل عن عبوة بعينها وسعرها وفرع توفرها، ثم قارن ردود الموردين قبل التواصل.</p></div></aside>
    </div>}</div></MainLayout>;
}