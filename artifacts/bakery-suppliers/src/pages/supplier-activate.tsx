import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck, Store } from "lucide-react";
import { getGetSupplierActivationQueryKey, useCompleteSupplierActivation, useGetSupplierActivation } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSupplierAuth } from "@/lib/supplier-auth";

const activationFormSchema = z.object({
  password: z.string().min(8, "استخدم 8 أحرف على الأقل.").max(128, "يجب ألا تتجاوز كلمة المرور 128 حرفاً."),
  confirmPassword: z.string().min(8, "أعد كتابة كلمة المرور."),
}).refine((values) => values.password === values.confirmPassword, {
  path: ["confirmPassword"],
  message: "كلمتا المرور غير متطابقتين.",
});

type ActivationFormValues = z.infer<typeof activationFormSchema>;

export default function SupplierActivatePage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const activation = useGetSupplierActivation({ token }, {
    query: {
      enabled: Boolean(token),
      queryKey: getGetSupplierActivationQueryKey({ token }),
    },
  });
  const completeActivation = useCompleteSupplierActivation();
  const { refresh } = useSupplierAuth();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [activated, setActivated] = useState(false);
  const form = useForm<ActivationFormValues>({
    resolver: zodResolver(activationFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const submit = (values: ActivationFormValues) => {
    completeActivation.mutate({ data: { token, ...values } }, {
      onSuccess: async () => {
        const supplier = await refresh();
        if (supplier) {
          setLocation("/supplier/portal");
        } else {
          setActivated(true);
        }
      },
    });
  };

  const errorMessage = completeActivation.error instanceof Error
    ? completeActivation.error.message
    : "تعذر تفعيل الحساب. اطلب رابطاً جديداً من الإدارة إذا استمرت المشكلة.";
  const activationError = activation.error instanceof Error
    ? activation.error.message
    : "رابط التفعيل غير صالح أو انتهت صلاحيته.";

  return <MainLayout>
    <main className="min-h-[calc(100dvh-5rem)] px-4 py-8 md:py-14" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-warm">
            <Store className="h-7 w-7" />
          </div>
          <p className="mb-2 text-sm font-bold text-primary">تفعيل حساب المورد</p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">أنشئ كلمة مرورك</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
            تمت الموافقة على ملف منشأتك. أنشئ كلمة مرور آمنة للبدء باستخدام حساب المورد.
          </p>
        </header>

        {!token && <ActivationState
          title="رابط التفعيل غير مكتمل"
          body="افتح الرابط الكامل الذي أرسلته لك إدارة الدليل، أو اطلب رابطاً جديداً."
        />}
        {token && activation.isLoading && <div data-testid="status-supplier-activation-loading" className="flex items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
          <LoaderCircle className="h-5 w-5 animate-spin" /> جارٍ التحقق من رابط التفعيل...
        </div>}
        {token && activation.isError && <ActivationState
          title="تعذر فتح رابط التفعيل"
          body={activationError}
        />}
        {activated && <div data-testid="status-supplier-activation-success" className="rounded-2xl border border-success/20 bg-success/5 p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
          <h2 className="text-xl font-extrabold">تم تفعيل حسابك</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">كلمة المرور جاهزة. سجّل الدخول للانتقال إلى لوحة المورد.</p>
          <Button asChild className="mt-5">
            <Link href="/supplier/login">تسجيل الدخول</Link>
          </Button>
        </div>}

        {token && activation.data && !activated && <div className="space-y-5">
          <section data-testid="card-supplier-activation-business" className="rounded-2xl border bg-card p-5 shadow-sm md:p-7">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-secondary p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <h2 className="text-lg font-extrabold">بيانات المنشأة المعتمدة</h2>
                <p className="text-sm text-muted-foreground">تأكد أن هذه البيانات تخص منشأتك.</p>
              </div>
            </div>
            <div className="grid gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
              <div data-testid="text-supplier-activation-business-name">
                <span className="mb-1 block text-xs text-muted-foreground">اسم المنشأة</span>
                <strong className="text-base">{activation.data.supplierName}</strong>
              </div>
              <div data-testid="text-supplier-activation-phone">
                <span className="mb-1 block text-xs text-muted-foreground">رقم الجوال</span>
                <strong dir="ltr" className="block text-right text-base">{activation.data.phone}</strong>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-7">
            <h2 className="text-lg font-extrabold">اختر كلمة مرور لحسابك</h2>
            <p className="mt-1 text-sm text-muted-foreground">يعمل رابط التفعيل مرة واحدة وينتهي بعد 48 ساعة.</p>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="mt-5 space-y-4">
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>كلمة المرور</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input {...field} type={showPassword ? "text" : "password"} autoComplete="new-password" data-testid="input-supplier-activation-password" className="h-12 pl-12" />
                      </FormControl>
                      <button data-testid="button-toggle-supplier-activation-password" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">8 أحرف على الأقل. لا تستخدم كلمة مرور تشاركها مع حساب آخر.</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>تأكيد كلمة المرور</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input {...field} type={showConfirmation ? "text" : "password"} autoComplete="new-password" data-testid="input-supplier-activation-confirm-password" className="h-12 pl-12" />
                      </FormControl>
                      <button data-testid="button-toggle-supplier-activation-confirm-password" type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? "إخفاء التأكيد" : "إظهار التأكيد"} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showConfirmation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                {completeActivation.isError && <p data-testid="status-supplier-activation-error" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p>}
                <Button data-testid="button-submit-supplier-activation" type="submit" disabled={completeActivation.isPending} className="h-12 w-full text-base font-extrabold">
                  {completeActivation.isPending ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" /> جارٍ تفعيل الحساب...</> : "حفظ كلمة المرور وتفعيل الحساب"}
                </Button>
                <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> لن نعرض كلمة المرور أو نرسلها عبر واتساب.
                </p>
              </form>
            </Form>
          </section>
        </div>}
      </div>
    </main>
  </MainLayout>;
}

function ActivationState({ title, body }: { title: string; body: string }) {
  return <div data-testid="state-supplier-activation-error" className="rounded-2xl border bg-card p-8 text-center shadow-sm md:p-12">
    <AlertCircle className="mx-auto mb-4 h-9 w-9 text-warning" />
    <h2 className="text-xl font-extrabold">{title}</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted-foreground">{body}</p>
    <Button asChild variant="outline" className="mt-5">
      <Link href="/supplier/login">الانتقال إلى تسجيل دخول المورد</Link>
    </Button>
  </div>;
}