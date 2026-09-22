import { MainLayout } from "@/components/layout/MainLayout";

export default function AboutPage() {
  return (
    <MainLayout>
      <div className="bg-secondary/10 py-16 border-b">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">من نحن</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
             منصة تجمع أصحاب الأعمال في قطاع المخابز والحلويات مع الموردين المتخصصين.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="prose prose-lg prose-amber mx-auto rtl:text-right">
          <h2 className="text-2xl font-bold text-foreground mb-4">رسالتنا</h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            نسعى في "دليل موردي المخابز والحلويات" إلى تسهيل عملية الوصول إلى أفضل الموردين المتخصصين في توفير المواد الخام والمعدات اللازمة لنجاح مشاريع المخابز والحلويات والمقاهي. نؤمن بأن الجودة تبدأ من المورد، ولذلك نعمل على بناء شبكة موثوقة تعزز من كفاءة ونمو هذا القطاع الحيوي.
          </p>

          <h2 className="text-2xl font-bold text-foreground mb-4">لماذا نحن؟</h2>
          <ul className="space-y-4 mb-8 text-muted-foreground">
            <li className="flex gap-3">
              <span className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0"></span>
              <span><strong>تخصص دقيق:</strong> نحن نركز حصرياً على احتياجات المخابز والحلويات، مما يجعل بحثك دقيقاً وموجهاً.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0"></span>
              <span><strong>موردون معتمدون:</strong> نعمل على تقييم وتوثيق الموردين لضمان المصداقية والجودة.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0"></span>
              <span><strong>معلومات فنية متكاملة:</strong> نوفر تفاصيل فنية دقيقة عن المنتجات كنسب الخلط وفترات الصلاحية لمساعدتك في اتخاذ القرار.</span>
            </li>
          </ul>

          <div className="bg-card border-l-4 border-l-primary p-6 rounded-r-xl my-12 text-sm leading-relaxed shadow-sm">
            <h3 className="font-bold text-base mb-2">إخلاء مسؤولية</h3>
            <p className="text-muted-foreground">
              هذه المنصة هي دليل استرشادي يهدف إلى تسهيل الوصول والتواصل بين أصحاب الأعمال والموردين. المنصة لا تتدخل في عمليات البيع والشراء أو الأسعار أو العقود المبرمة بين الطرفين، ولا تتحمل أي مسؤولية قانونية عن جودة المنتجات أو تأخير التوصيل أو أي خلاف تجاري قد ينشأ. ننصح دائماً بطلب عينات لتجربة المنتجات والتأكد من مطابقتها لمواصفات مشروعك قبل اعتماد الطلبيات الكبيرة.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
