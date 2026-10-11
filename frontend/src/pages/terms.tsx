import { MainLayout } from "@/components/layout/MainLayout";

export default function TermsPage() {
  return (
    <MainLayout>
      <div className="bg-secondary/10 py-16 border-b">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">الشروط والأحكام</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            توضح هذه الصفحة شروط استخدام منصة دليل موردي المخابز والحلويات.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="prose prose-slate max-w-none rtl:text-right">
          
          <h3 className="text-xl font-bold mt-8 mb-4">1. القبول بالشروط</h3>
          <p className="text-muted-foreground mb-6">
            استخدامك لهذه المنصة يعني موافقتك الكاملة على جميع الشروط والأحكام المذكورة هنا. إذا كنت لا توافق على هذه الشروط، يرجى عدم استخدام المنصة.
          </p>

          <h3 className="text-xl font-bold mt-8 mb-4">2. طبيعة الخدمة</h3>
          <p className="text-muted-foreground mb-6">
            منصتنا هي دليل معلوماتي فقط، يهدف إلى مساعدة أصحاب المخابز والمقاهي في العثور على الموردين المناسبين. نحن لا نبيع المنتجات المعروضة بشكل مباشر، ولا نمثل الموردين قانونياً.
          </p>

          <h3 className="text-xl font-bold mt-8 mb-4">3. إخلاء المسؤولية</h3>
          <div className="bg-card border-l-4 border-l-primary p-6 rounded-r-xl mb-6 shadow-sm">
            <p className="text-foreground leading-relaxed text-sm">
              هذه المنصة هي دليل استرشادي يهدف إلى تسهيل الوصول والتواصل بين أصحاب الأعمال والموردين. المنصة لا تتدخل في عمليات البيع والشراء أو الأسعار أو العقود المبرمة بين الطرفين، ولا تتحمل أي مسؤولية قانونية عن جودة المنتجات أو تأخير التوصيل أو أي خلاف تجاري قد ينشأ. ننصح دائماً بطلب عينات لتجربة المنتجات والتأكد من مطابقتها لمواصفات مشروعك قبل اعتماد الطلبيات الكبيرة.
            </p>
          </div>

          <h3 className="text-xl font-bold mt-8 mb-4">4. دقة المعلومات</h3>
          <p className="text-muted-foreground mb-6">
            نبذل قصارى جهدنا لضمان دقة المعلومات المعروضة (مثل الأسعار، المواصفات، وأرقام التواصل)، لكننا لا نضمن صحتها بنسبة 100% لأنها تعتمد على ما يقدمه الموردون. الأسعار قابلة للتغيير دون إشعار مسبق.
          </p>

          <h3 className="text-xl font-bold mt-8 mb-4">5. تقييمات المستخدمين</h3>
          <p className="text-muted-foreground mb-6">
            التقييمات والتعليقات تعبر عن رأي أصحابها فقط ولا تمثل رأي إدارة المنصة. نحتفظ بالحق في حذف أي تعليق يحتوي على إساءة أو ألفاظ نابية أو تشهير غير مبرر.
          </p>
          
        </div>
      </div>
    </MainLayout>
  );
}
