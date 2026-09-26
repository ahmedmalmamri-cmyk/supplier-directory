import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { forwardRef, useEffect, type ChangeEventHandler, type FocusEventHandler } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, CheckCircle2, ChevronDown, ClipboardPenLine, Info, Megaphone, MapPin, ShieldCheck } from "lucide-react";
import { getGetRequestOptionsQueryKey, getListItemCategoriesQueryKey, getListRequestsQueryKey, useCreateRequest, useGetRequestOptions, useListItemCategories, type RequestInput, RequestInputFrequency, RequestInputUnit } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

const requestSchema = z.object({
  categoryId: z.coerce.number().int("اختر صنفاً").min(1, "اختر الصنف المطلوب"),
  quantity: z.coerce.number({ invalid_type_error: "أدخل الكمية" }).positive("يجب أن تكون الكمية أكبر من صفر"),
  unit: z.enum(["كيلو", "كرتون", "كيس", "علبة"], { required_error: "اختر الوحدة" }),
  frequency: z.enum(["مرة واحدة", "أسبوعي", "شهري"], { required_error: "اختر التكرار" }),
  city: z.string().min(1, "اختر المدينة").max(80, "قائمة المدن غير صالحة"),
  description: z.string().max(1000, "اكتب 1000 حرف كحد أقصى").optional().default(""),
});

type RequestFormValues = z.infer<typeof requestSchema>;

export default function NewRequestPage() {
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const categoriesQuery = useListItemCategories({ query: { queryKey: getListItemCategoriesQueryKey(), enabled: !buyerLoading && !supplierLoading && !!user?.isOwner && !supplier } });
  const optionsQuery = useGetRequestOptions({ query: { queryKey: getGetRequestOptionsQueryKey(), enabled: !buyerLoading && !supplierLoading && !!user?.isOwner && !supplier } });
  const createRequest = useCreateRequest();
  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { categoryId: 0, quantity: undefined, unit: undefined, frequency: undefined, city: "", description: "" },
  });

  useEffect(() => {
    if (!buyerLoading && !supplierLoading && (!user || !user.isOwner || supplier)) navigate("/requests");
  }, [buyerLoading, supplierLoading, user, supplier, navigate]);

  const onSubmit = (values: RequestFormValues) => {
    const input: RequestInput = {
      categoryId: values.categoryId,
      quantity: values.quantity,
      unit: values.unit as RequestInput["unit"],
      frequency: values.frequency as RequestInput["frequency"],
      city: values.city,
      description: values.description?.trim() ?? "",
    };
    createRequest.mutate({ data: input }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
        navigate("/requests");
      },
    });
  };

  if (buyerLoading || supplierLoading) {
    return <MainLayout><FormSkeleton /></MainLayout>;
  }
  if (!user || !user.isOwner || supplier) {
    return <MainLayout><UnauthorizedState supplierSession={!!supplier} /></MainLayout>;
  }

  const dataError = categoriesQuery.error || optionsQuery.error;
  return (
    <MainLayout>
      <section className="border-b border-border/70 bg-secondary/35">
        <div className="container mx-auto px-4 py-9 md:py-12">
          <Link href="/requests" data-testid="link-back-requests" className="inline-flex items-center gap-2 text-sm font-extrabold text-primary hover:underline"><ArrowRight className="h-4 w-4" /> العودة إلى احتياجاتي</Link>
          <div className="mt-7 flex items-start gap-4">
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-warm sm:flex"><Megaphone className="h-7 w-7" /></div>
            <div><p className="text-sm font-extrabold text-primary">طلب توريد جديد</p><h1 className="mt-1 text-3xl font-extrabold md:text-5xl" data-testid="heading-new-request">ما الذي تحتاجه لنشاطك؟</h1><p className="mt-3 max-w-2xl text-sm leading-8 text-muted-foreground">أضف التفاصيل الأساسية ليصل احتياجك إلى الموردين المعتمدين في مدينتك.</p></div>
          </div>
        </div>
      </section>

      <div className="container mx-auto grid max-w-6xl flex-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-12">
        <section className="rounded-[1.5rem] border border-border/80 bg-card p-5 shadow-warm md:p-8" aria-labelledby="new-request-form-heading">
          <div className="mb-7 flex items-center gap-3 border-b border-border/70 pb-5"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><ClipboardPenLine className="h-5 w-5" /></div><div><h2 id="new-request-form-heading" className="font-extrabold">تفاصيل الاحتياج</h2><p className="text-xs text-muted-foreground">الحقول المعلّمة مطلوبة</p></div></div>
          {dataError ? <DataError /> : categoriesQuery.isLoading || optionsQuery.isLoading ? <FormSkeleton /> : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-new-request">
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField control={form.control} name="categoryId" render={({ field }) => <FormItem><FormLabel>الصنف المطلوب <span className="text-destructive">*</span></FormLabel><FormControl><div className="relative"><select {...field} value={field.value || ""} onChange={(event) => field.onChange(Number(event.target.value))} data-testid="select-request-category" className="flex h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-10 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>اختر الصنف</option>{(categoriesQuery.data ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name="city" render={({ field }) => <FormItem><FormLabel>المدينة <span className="text-destructive">*</span></FormLabel><FormControl><div className="relative"><select {...field} data-testid="select-request-city" className="flex h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-10 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>اختر المدينة</option>{(optionsQuery.data?.cities ?? []).map((city) => <option value={city} key={city}>{city}</option>)}</select><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div></FormControl><FormMessage /></FormItem>} />
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  <FormField control={form.control} name="quantity" render={({ field }) => <FormItem><FormLabel>الكمية <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value)} type="number" min="0.01" step="any" placeholder="مثال: 25" data-testid="input-request-quantity" /></FormControl><FormDescription>أدخل رقماً أكبر من صفر</FormDescription><FormMessage /></FormItem>} />
                  <FormField control={form.control} name="unit" render={({ field }) => <FormItem><FormLabel>الوحدة <span className="text-destructive">*</span></FormLabel><FormControl><NativeSelect {...field} testId="select-request-unit" placeholder="اختر الوحدة" options={Object.values(RequestInputUnit)} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name="frequency" render={({ field }) => <FormItem><FormLabel>التكرار <span className="text-destructive">*</span></FormLabel><FormControl><NativeSelect {...field} testId="select-request-frequency" placeholder="اختر التكرار" options={Object.values(RequestInputFrequency)} /></FormControl><FormMessage /></FormItem>} />
                </div>
                  <FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>تفاصيل إضافية <span className="font-normal text-muted-foreground">(اختياري)</span></FormLabel><FormControl><Textarea {...field} rows={5} maxLength={1000} placeholder="اذكر المواصفات أو وقت التوريد المناسب أو أي ملاحظة تساعد المورد..." data-testid="textarea-request-description" className="resize-y rounded-xl" /></FormControl><FormDescription>سيظهر اسم نشاطك التجاري للموردين المعتمدين، لكن لن يظهر اسمك الشخصي أو رقم جوالك في قائمة السوق.</FormDescription><FormMessage /></FormItem>} />
                {createRequest.error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive" data-testid="state-create-request-error">تعذر نشر الاحتياج. راجع البيانات وحاول مرة أخرى.</p>}
                <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-6 sm:flex-row sm:justify-end">
                  <Link href="/requests" data-testid="link-cancel-new-request" className="inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2 text-sm font-extrabold hover:bg-muted">إلغاء</Link>
                  <Button type="submit" disabled={createRequest.isPending} data-testid="button-submit-request" className="min-h-11 rounded-xl px-6 font-extrabold"><Megaphone className="h-4 w-4" />{createRequest.isPending ? "جاري النشر..." : "انشر الاحتياج"}</Button>
                </div>
              </form>
            </Form>
          )}
        </section>
        <aside className="space-y-4">
          <div className="rounded-[1.35rem] border border-primary/15 bg-primary/5 p-5"><div className="flex items-center gap-2 text-sm font-extrabold text-primary"><ShieldCheck className="h-4 w-4" /> نشر واضح وآمن</div><p className="mt-3 text-sm leading-7 text-muted-foreground">سيظهر اسم النشاط والصنف والكمية والمدينة للموردين المعتمدين. يبقى اسمك الشخصي ورقم جوالك خارج قائمة السوق.</p></div>
          <div className="rounded-[1.35rem] border border-border/80 bg-card p-5"><div className="flex items-center gap-2 text-sm font-extrabold"><Info className="h-4 w-4 text-accent" /> قبل النشر</div><ul className="mt-3 space-y-3 text-xs leading-6 text-muted-foreground"><li className="flex gap-2"><CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />استخدم وحدة قياس واضحة.</li><li className="flex gap-2"><CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />اذكر المواصفات المهمة في التفاصيل.</li></ul></div>
        </aside>
      </div>
    </MainLayout>
  );
}

type NativeSelectProps = { options: string[]; placeholder: string; testId: string; value?: string; onChange?: ChangeEventHandler<HTMLSelectElement>; onBlur?: FocusEventHandler<HTMLSelectElement>; name?: string };
const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(({ options, placeholder, testId, value, onChange, onBlur, name }, ref) => (
  <div className="relative"><select ref={ref} name={name} value={value ?? ""} onChange={onChange} onBlur={onBlur} data-testid={testId} className="flex h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pe-10 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="" disabled>{placeholder}</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
));
NativeSelect.displayName = "NativeSelect";

function FormSkeleton() { return <div className="space-y-6" role="status" aria-label="جارٍ تحميل نموذج الاحتياج"><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="grid gap-6 sm:grid-cols-3"><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /><div className="h-11 animate-pulse rounded-xl bg-muted" /></div><div className="h-32 animate-pulse rounded-xl bg-muted" /><span className="sr-only">جارٍ تحميل النموذج</span></div>; }
function DataError() { return <div className="rounded-xl bg-destructive/10 p-5 text-sm font-bold text-destructive" role="alert" data-testid="state-request-form-error">تعذر تحميل خيارات النموذج. حدّث الصفحة وحاول مرة أخرى.</div>; }
function UnauthorizedState({ supplierSession }: { supplierSession: boolean }) { return <div className="container mx-auto flex flex-1 items-center justify-center px-4 py-14"><div className="max-w-md rounded-[1.5rem] border border-dashed p-8 text-center" data-testid="state-new-request-unauthorized"><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><h1 className="mt-4 text-xl font-extrabold">النشر متاح لصاحب العمل فقط</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">{supplierSession ? "أنت مسجل حالياً كمورد. سجّل الخروج من جلسة المورد ثم استخدم حساب صاحب العمل." : "سجّل الدخول بحساب صاحب العمل للبدء."}</p><Link href={supplierSession ? "/supplier/dashboard" : "/buyer/login"} data-testid="link-new-request-login" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 font-extrabold text-primary-foreground">{supplierSession ? "الانتقال إلى لوحة المورد" : "تسجيل الدخول"}</Link></div></div>; }