import { MainLayout } from "@/components/layout/MainLayout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useRegisterInterest } from "@workspace/api-client-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertCircle, CheckCircle2, Clock3, MapPin, UserPlus } from "lucide-react";

const registerSchema = z.object({
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").max(80),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  region: z.literal("المنطقة الشرقية"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const upcomingRegions = ["منطقة الرياض", "منطقة مكة المكرمة", "منطقة المدينة المنورة", "باقي مناطق المملكة"];

export default function RegisterPage() {
  const [isSuccess, setIsSuccess] = useState(false);
  const registerInterest = useRegisterInterest({
    mutation: {
      onSuccess: () => {
        setIsSuccess(true);
        form.reset({ name: "", email: "", region: "المنطقة الشرقية" });
      },
    },
  });

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", region: "المنطقة الشرقية" },
  });

  return (
    <MainLayout>
      <div className="bg-secondary/10 py-14 border-b">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center">
            <UserPlus className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-bold mb-4">التسجيل في الدليل</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            اترك بياناتك لنخبرك عند توفر الدليل في منطقتك.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-6 mb-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold text-lg mb-2">الدليل متاح حالياً في المنطقة الشرقية</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                المدن المتاحة حالياً: الدمام، الخبر، الظهران، الأحساء، والجبيل.
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                إذا كنت من خارج المنطقة الشرقية، يمكنك ترك بريدك لنخبرك عند التوسع.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-sm">
            {isSuccess ? (
              <div className="text-center py-10">
                <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-3">تم تسجيل اهتمامك بنجاح</h2>
                <p className="text-muted-foreground mb-6">
                  سنرسل لك إشعاراً عند توفر الدليل في منطقتك.
                </p>
                <button type="button" onClick={() => setIsSuccess(false)} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                  تسجيل اهتمام آخر
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">بيانات التسجيل</h2>
                <p className="text-sm text-muted-foreground mb-7">الحقول المطلوبة تساعدنا على إشعارك في الوقت المناسب.</p>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => registerInterest.mutate({ data }))} className="space-y-5">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الاسم</FormLabel>
                          <FormControl>
                            <input {...field} placeholder="الاسم الكامل" className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <input {...field} type="email" dir="ltr" placeholder="name@example.com" className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary text-left" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>المنطقة</FormLabel>
                          <FormControl>
                            <select {...field} className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                              <option value="المنطقة الشرقية">المنطقة الشرقية — متاحة الآن</option>
                              {upcomingRegions.map((region) => (
                                <option key={region} value={region} disabled>{region} — قريباً</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <button type="submit" disabled={registerInterest.isPending} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-60">
                      {registerInterest.isPending ? "جاري التسجيل..." : "تسجيل اهتمامي"}
                    </button>
                    {registerInterest.isError && (
                      <p className="text-sm text-destructive text-center">تعذر حفظ البيانات حالياً. حاول مرة أخرى.</p>
                    )}
                  </form>
                </Form>
              </>
            )}
          </div>

          <aside className="rounded-2xl border bg-muted/30 p-6 h-fit">
            <div className="flex items-center gap-2 font-bold mb-5">
              <MapPin className="w-5 h-5 text-primary" />
              المدن المتاحة حالياً
            </div>
            <ul className="space-y-3 text-sm">
              {["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل"].map((city) => (
                <li key={city} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  {city}
                </li>
              ))}
            </ul>
            <div className="border-t mt-6 pt-5">
              <a href="/expansion" className="flex items-center gap-2 text-sm text-primary font-bold hover:underline">
                <Clock3 className="w-4 h-4" />
                تعرف على خطة التوسع
              </a>
            </div>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
}