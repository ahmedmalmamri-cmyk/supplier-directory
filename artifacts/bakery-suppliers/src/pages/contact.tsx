import { MainLayout } from "@/components/layout/MainLayout";
import { useSendContact } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Mail, MapPin, Phone } from "lucide-react";
import { useEffect, useState } from "react";

const contactSchema = z.object({
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل").max(80),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  subject: z.string().min(2, "عنوان الرسالة مطلوب").max(120),
  message: z.string().min(5, "الرسالة قصيرة جداً").max(1000),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [whatsapp, setWhatsapp] = useState("0566866805");

  useEffect(() => {
    fetch("/api/contact-settings")
      .then((response) => response.json())
      .then((data: { whatsapp?: string }) => {
        if (data.whatsapp) setWhatsapp(data.whatsapp);
      })
      .catch(() => undefined);
  }, []);
  
  const sendContact = useSendContact({
    mutation: {
      onSuccess: () => {
        setIsSuccess(true);
        form.reset();
      }
    }
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: ""
    }
  });

  const onSubmit = (data: ContactFormValues) => {
    sendContact.mutate({ data });
  };

  return (
    <MainLayout>
      <div className="bg-secondary/10 py-16 border-b">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">اتصل بنا</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            نحن هنا للإجابة على استفساراتكم ودعمكم في أي وقت.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          
          <div className="md:col-span-1 space-y-8">
            <div>
              <h2 className="text-xl font-bold mb-6 border-b pb-2">معلومات التواصل</h2>
              <ul className="space-y-6">
                <li className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold mb-1">البريد الإلكتروني</div>
                    <a href="mailto:info@bakery-suppliers.sa" className="text-muted-foreground text-sm hover:text-primary transition-colors dir-ltr block text-right">info@bakery-suppliers.sa</a>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold mb-1">واتساب التواصل</div>
                    <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-muted-foreground text-sm hover:text-primary transition-colors dir-ltr block text-right">{whatsapp}</a>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold mb-1">العنوان</div>
                    <div className="text-muted-foreground text-sm">الرياض، المملكة العربية السعودية</div>
                  </div>
                </li>
              </ul>
            </div>
            
            <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl">
              <h3 className="font-bold mb-2 text-primary">هل أنت مورد؟</h3>
              <p className="text-sm text-muted-foreground mb-4">انضم إلى شبكتنا ووسع نطاق أعمالك وقم بالوصول إلى مئات المخابز والمقاهي.</p>
              <button className="w-full py-2 bg-background border border-primary text-primary rounded-lg font-medium text-sm hover:bg-primary hover:text-primary-foreground transition-colors">
                طلب انضمام كمورد
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-card border rounded-3xl p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-6">أرسل رسالة</h2>
              
              {isSuccess ? (
                <div className="bg-green-50 border border-green-200 text-green-800 p-8 rounded-2xl text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2">تم الإرسال بنجاح!</h3>
                  <p className="text-green-700/80 mb-6">شكراً لتواصلك معنا. سنقوم بالرد عليك في أقرب وقت ممكن.</p>
                  <button onClick={() => setIsSuccess(false)} className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                    إرسال رسالة أخرى
                  </button>
                </div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الاسم الكامل</FormLabel>
                            <FormControl>
                              <input {...field} className="w-full h-12 px-4 rounded-xl border bg-background text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="أحمد محمد" />
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
                              <input {...field} type="email" className="w-full h-12 px-4 rounded-xl border bg-background text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-left dir-ltr" placeholder="ahmed@example.com" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الموضوع</FormLabel>
                          <FormControl>
                            <input {...field} className="w-full h-12 px-4 rounded-xl border bg-background text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="استفسار عن التسجيل كمورد" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الرسالة</FormLabel>
                          <FormControl>
                            <textarea {...field} rows={6} className="w-full p-4 rounded-xl border bg-background text-sm resize-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" placeholder="اكتب رسالتك هنا بوضوح..." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <button 
                      type="submit" 
                      disabled={sendContact.isPending} 
                      className="w-full md:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {sendContact.isPending ? "جاري الإرسال..." : "إرسال الرسالة"}
                      {!sendContact.isPending && <Mail className="w-4 h-4" />}
                    </button>
                  </form>
                </Form>
              )}
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
