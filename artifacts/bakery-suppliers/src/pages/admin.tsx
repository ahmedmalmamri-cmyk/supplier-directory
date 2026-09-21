import { MainLayout } from "@/components/layout/MainLayout";
import {
  useAdminLogin,
  useAdminLogout,
  useApproveRegistration,
  getListRegistrationInterestsQueryKey,
  useListRegistrationInterests,
  useRejectRegistration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Clock3, LogIn, LogOut, ShieldCheck, UserRound, XCircle } from "lucide-react";

const statusLabels = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
} as const;

const statusStyles = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
} as const;

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const registrations = useListRegistrationInterests({
    query: { enabled: isAuthenticated, queryKey: getListRegistrationInterestsQueryKey() },
  });

  const login = useAdminLogin({
    mutation: {
      onSuccess: () => {
        setPassword("");
        setIsAuthenticated(true);
      },
    },
  });

  const logout = useAdminLogout({
    mutation: {
      onSuccess: () => setIsAuthenticated(false),
    },
  });

  const reviewOptions = {
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/registrations"] });
      },
    },
  };
  const approve = useApproveRegistration(reviewOptions);
  const reject = useRejectRegistration(reviewOptions);
  const isReviewing = approve.isPending || reject.isPending;

  return (
    <MainLayout>
      <div className="bg-secondary/10 py-12 border-b">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary mb-3">
              <ShieldCheck className="w-5 h-5" />
              <span className="font-bold text-sm">مساحة خاصة بالمدير</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">لوحة التحكم الإدارية</h1>
            <p className="text-muted-foreground mt-2">مراجعة طلبات التسجيل قبل ظهور الموردين في الدليل.</p>
          </div>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2.5 font-bold hover:bg-muted disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-5xl">
        {!isAuthenticated ? (
          <div className="max-w-md mx-auto bg-card border rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold mb-2">دخول المدير</h2>
            <p className="text-sm text-muted-foreground mb-6">أدخل كلمة مرور المدير لعرض طلبات التسجيل وإدارتها.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                login.mutate({ data: { password } });
              }}
              className="space-y-4"
            >
              <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" className="hidden" />
              <label className="block">
                <span className="text-sm font-bold block mb-2">كلمة المرور</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-12 px-4 rounded-xl border bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
              <button type="submit" disabled={login.isPending || !password} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" />
                {login.isPending ? "جاري التحقق..." : "دخول"}
              </button>
              {login.isError && <p className="text-sm text-destructive text-center">كلمة المرور غير صحيحة.</p>}
            </form>
          </div>
        ) : (
          <section>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <SummaryCard icon={<Clock3 className="w-5 h-5" />} label="قيد المراجعة" value={registrations.data?.filter((item) => item.status === "pending").length ?? 0} />
              <SummaryCard icon={<CheckCircle2 className="w-5 h-5" />} label="مقبول" value={registrations.data?.filter((item) => item.status === "approved").length ?? 0} />
              <SummaryCard icon={<XCircle className="w-5 h-5" />} label="مرفوض" value={registrations.data?.filter((item) => item.status === "rejected").length ?? 0} />
            </div>

            {registrations.isLoading ? (
              <div className="text-center py-16 text-muted-foreground">جاري تحميل الطلبات...</div>
            ) : registrations.isError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-destructive">
                انتهت جلسة المدير أو تعذر تحميل الطلبات. أعد تحميل الصفحة وسجل الدخول مرة أخرى.
              </div>
            ) : registrations.data?.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-12 text-center">
                <UserRound className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h2 className="font-bold text-lg mb-2">لا توجد طلبات تسجيل</h2>
                <p className="text-muted-foreground">ستظهر الطلبات الجديدة هنا للمراجعة.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {registrations.data?.map((registration) => (
                  <article key={registration.id} className="bg-card border rounded-2xl p-5 md:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <h2 className="text-xl font-bold">{registration.name}</h2>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusStyles[registration.status]}`}>
                            {statusLabels[registration.status]}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-muted-foreground">
                          <span dir="ltr" className="text-right sm:text-left">{registration.email}</span>
                          <span>{registration.region}</span>
                          <span>تاريخ الطلب: {formatDate(registration.createdAt)}</span>
                          {registration.reviewedAt && <span>تاريخ المراجعة: {formatDate(registration.reviewedAt)}</span>}
                        </div>
                      </div>
                      {registration.status === "pending" && (
                        <div className="flex gap-3 shrink-0">
                          <button
                            type="button"
                            onClick={() => approve.mutate({ id: registration.id })}
                            disabled={isReviewing}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white px-4 py-2.5 font-bold hover:bg-green-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            موافقة وإضافة
                          </button>
                          <button
                            type="button"
                            onClick={() => reject.mutate({ id: registration.id })}
                            disabled={isReviewing}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 text-red-700 px-4 py-2.5 font-bold hover:bg-red-50 disabled:opacity-60"
                          >
                            <XCircle className="w-4 h-4" />
                            رفض
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </MainLayout>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-card border rounded-2xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}