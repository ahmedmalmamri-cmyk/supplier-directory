import { MainLayout } from "@/components/layout/MainLayout";
import { CheckCircle2, Clock3, MapPin, Rocket, Sparkles } from "lucide-react";

const phases = [
  { title: "المرحلة 1: المنطقة الشرقية", timing: "الآن", cities: "الدمام، الخبر، الظهران، الأحساء، الجبيل", state: "current" },
  { title: "المرحلة 2: الرياض", timing: "بعد 3-6 أشهر", cities: "مدينة الرياض والمناطق المحيطة", state: "upcoming" },
  { title: "المرحلة 3: جدة ومكة", timing: "بعد 6-12 شهر", cities: "جدة، مكة المكرمة والمناطق المحيطة", state: "upcoming" },
  { title: "المرحلة 4: باقي المملكة", timing: "بعد اكتمال المراحل السابقة", cities: "التوسع التدريجي في جميع المناطق", state: "upcoming" },
];

export default function ExpansionPage() {
  return (
    <MainLayout>
      <div className="bg-secondary/10 py-16 border-b">
        <div className="container mx-auto px-4 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center">
            <Rocket className="w-7 h-7" />
          </div>
          <h1 className="text-4xl font-bold mb-4">خطة التوسع</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            نبدأ من المنطقة الشرقية، ثم نوسع الدليل تدريجياً لنخدم أصحاب المخابز والحلويات في جميع أنحاء المملكة.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-14 max-w-4xl">
        <div className="relative">
          <div className="absolute right-5 top-6 bottom-6 w-px bg-border hidden sm:block" />
          <div className="space-y-6">
            {phases.map((phase, index) => {
              const isCurrent = phase.state === "current";
              return (
                <article key={phase.title} className={`relative rounded-2xl border p-6 sm:pr-16 ${isCurrent ? "border-primary/50 bg-primary/10 shadow-sm" : "bg-card"}`}>
                  <div className={`absolute right-2 sm:right-0 top-6 w-10 h-10 rounded-full flex items-center justify-center ${isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {isCurrent ? <CheckCircle2 className="w-5 h-5" /> : <span className="font-bold">{index + 1}</span>}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h2 className="text-xl font-bold">{phase.title}</h2>
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${isCurrent ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {isCurrent ? <Sparkles className="w-4 h-4" /> : <Clock3 className="w-4 h-4" />}
                      {phase.timing}
                    </span>
                  </div>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 text-primary" />
                    {phase.cities}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}