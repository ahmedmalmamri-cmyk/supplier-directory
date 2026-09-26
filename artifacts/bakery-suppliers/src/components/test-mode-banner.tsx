import { useEffect, useState } from "react";
import { ShieldCheck, Store, ShoppingCart, LogOut, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

type TestRole = "supplier" | "buyer";
type TestModeStatus = { active: false } | { active: true; role: TestRole; accountType: "test" | "existing" };

class TestModeRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestTestMode<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.error === "string"
      ? body.error
      : body && typeof body.message === "string"
        ? body.message
        : "تعذر تحديث حالة وضع المعاينة.";
    throw new TestModeRequestError(response.status, message);
  }
  return body as T;
}

export function TestModeBanner() {
  const [location, navigate] = useLocation();
  const buyerAuth = useBuyerAuth();
  const supplierAuth = useSupplierAuth();
  const [status, setStatus] = useState<TestModeStatus | null>(null);
  const [error, setError] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const nextStatus = await requestTestMode<TestModeStatus>("/api/test-mode/status");
        if (mounted) {
          setStatus(nextStatus);
          setError("");
        }
      } catch {
        if (mounted) setError("تعذر التحقق من حالة وضع المعاينة.");
      }
    };
    void loadStatus();
    const refreshTimer = window.setInterval(() => void loadStatus(), 30000);
    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, [location]);

  const exitTestMode = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setError("");
    try {
      await requestTestMode<{ success: true }>("/api/admin/test-mode/exit", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setStatus({ active: false });
      await Promise.all([buyerAuth.refresh(), supplierAuth.refresh()]);
      navigate("/test-mode");
    } catch (exitError) {
      setError(exitError instanceof TestModeRequestError && exitError.status === 409
        ? "لا يمكن إنهاء وضع المعاينة أثناء وجود عملية قيد التنفيذ."
        : "تعذر إنهاء وضع المعاينة. حاول مرة أخرى.");
    } finally {
      setIsExiting(false);
    }
  };

  if (!status?.active && !error) return null;

  if (error && !status?.active) {
    return (
      <div className="border-b border-warning/25 bg-warning/10 px-4 py-2 text-warning-foreground" role="status" data-testid="status-test-mode-error">
        <div className="container mx-auto flex max-w-7xl items-center gap-2 text-xs font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const isSupplier = status?.active && status.role === "supplier";
  const isExistingBuyer = status?.active && status.role === "buyer" && status.accountType === "existing";
  return (
    <div className="border-b border-primary/20 bg-primary/[0.08] px-4 py-3" role="region" aria-label="حالة وضع المعاينة" data-testid="banner-test-mode">
      <div className="container mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-extrabold" data-testid="text-test-mode-active">
              وضع المعاينة الآمن نشط
              {isSupplier ? <Store className="h-4 w-4 text-primary" /> : <ShoppingCart className="h-4 w-4 text-primary" />}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-test-mode-role">
              {isSupplier
                ? "أنت تستعرض الآن شاشة المورد بحساب اختباري. لا يتم حفظ النشاط الحقيقي."
                : isExistingBuyer
                  ? "أنت تستعرض الآن شاشة صاحب العمل بحسابك الحالي. لا يتم إنشاء حساب تجريبي أو حفظ النشاط الحقيقي."
                  : "أنت تستعرض الآن شاشة صاحب العمل. لا يتم حفظ النشاط الحقيقي."}
            </p>
            {error && <p className="mt-1 text-xs font-bold text-destructive" role="alert" data-testid="status-test-mode-exit-error">{error}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void exitTestMode()}
          disabled={isExiting}
          data-testid="button-exit-test-mode"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-card px-4 text-sm font-extrabold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {isExiting ? "جارٍ إنهاء المعاينة..." : "إنهاء وضع المعاينة"}
        </button>
      </div>
    </div>
  );
}

export default TestModeBanner;