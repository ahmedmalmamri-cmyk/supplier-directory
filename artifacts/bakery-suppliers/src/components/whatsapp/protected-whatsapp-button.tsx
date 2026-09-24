import { Building2, CheckCircle2, LockKeyhole, MapPin, MessageCircle, Phone, UserRound, X } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useBuyerAuth } from "@/lib/buyer-auth";

type DialogMode = "gate" | "compose" | null;

type ProtectedWhatsAppButtonProps = {
  supplierId: number;
  supplierName: string;
  hasWhatsApp: boolean;
  className: string;
  label: string;
};

export function ProtectedWhatsAppButton({ supplierId, supplierName, hasWhatsApp, className, label }: ProtectedWhatsAppButtonProps) {
  const { user, isLoading, refresh } = useBuyerAuth();
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDialog(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  const openContact = async () => {
    if (!hasWhatsApp || isSending) return;
    setError("");
    const currentUser = isLoading ? await refresh() : user;
    setDialog(currentUser ? "compose" : "gate");
  };

  const sendMessage = async () => {
    setIsSending(true);
    setError("");
    const popup = window.open("", "_blank");
    try {
      const response = await fetch("/api/buyer/contact", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, message: customMessage }),
      });
      const result = await response.json() as { whatsappUrl?: string; error?: string };
      if (!response.ok || !result.whatsappUrl) {
        if (response.status === 401) {
          await refresh();
          setDialog("gate");
        }
        throw new Error(result.error || "تعذر تجهيز رسالة واتساب.");
      }
      if (popup) popup.location.href = result.whatsappUrl;
      else window.location.assign(result.whatsappUrl);
      setDialog(null);
      setCustomMessage("");
    } catch (sendError) {
      popup?.close();
      setError(sendError instanceof Error ? sendError.message : "تعذر إرسال الرسالة.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void openContact()} disabled={!hasWhatsApp || isLoading} className={className}>
        <MessageCircle className="h-4 w-4" /> {label}
      </button>
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="whatsapp-dialog-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 text-right shadow-2xl md:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <span className="text-xs font-bold text-muted-foreground">تواصل آمن عبر الدليل</span>
              <button type="button" aria-label="إغلاق" onClick={() => setDialog(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            {dialog === "gate" ? (
              <div className="pt-7">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-7 w-7" /></div>
                <h2 id="whatsapp-dialog-title" className="text-2xl font-extrabold">للتواصل مع هذا المورد، سجّل الآن</h2>
                <p className="mt-3 leading-7 text-muted-foreground">التسجيل مجاني وسريع (دقيقة واحدة)، وسيسمح لك بالتواصل المباشر مع جميع الموردين في الدليل.</p>
                <Link href="/register/buyer" onClick={() => setDialog(null)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-extrabold text-primary-foreground hover:bg-primary/90"><CheckCircle2 className="h-5 w-5" /> سجّل الآن كصاحب عمل</Link>
                <p className="mt-5 text-center text-sm text-muted-foreground">مسجل بالفعل؟ <Link href="/buyer/login" onClick={() => setDialog(null)} className="font-extrabold text-primary hover:underline">تسجيل الدخول</Link></p>
                <button type="button" onClick={() => setDialog(null)} className="mt-5 w-full rounded-xl border border-border px-5 py-3 font-bold hover:bg-muted">إلغاء</button>
              </div>
            ) : (
              <div className="pt-7">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#287d56]/10 text-[#287d56]"><MessageCircle className="h-7 w-7" /></div>
                <h2 id="whatsapp-dialog-title" className="text-2xl font-extrabold">التواصل مع {supplierName}</h2>
                <div className="mt-5 rounded-2xl bg-primary/5 p-4">
                  <p className="flex items-center gap-2 font-extrabold text-primary"><CheckCircle2 className="h-5 w-5" /> مرحباً {user?.fullName}</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">سيتم إرسال رسالة رسمية تحتوي على بيانات التواصل التالية:</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> النشاط: {user?.businessType}</span>
                    <span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> اسم النشاط: {user?.businessName || "غير محدد"}</span>
                    <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> المدينة: {user?.city}</span>
                    <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> الجوال: {user?.phone}</span>
                    <span className="flex items-center gap-2 sm:col-span-2"><UserRound className="h-3.5 w-3.5" /> الصفة: {user?.isOwner ? "صاحب العمل" : user?.jobTitle || "ممثل المنشأة"}</span>
                  </div>
                </div>
                <label className="mt-6 block text-sm font-bold">هل تريد إضافة رسالة؟ <span className="font-normal text-muted-foreground">(اختياري)</span>
                  <textarea value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} maxLength={1000} rows={4} className="mt-2 w-full resize-none rounded-xl border border-input bg-background p-3 font-normal leading-7 outline-none focus:border-primary" placeholder="اكتب استفسارك هنا..." />
                </label>
                {error && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p>}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" onClick={() => setDialog(null)} className="flex-1 rounded-xl border border-border px-5 py-3 font-bold hover:bg-muted">إلغاء</button>
                  <button type="button" onClick={() => void sendMessage()} disabled={isSending} className="flex-1 rounded-xl bg-[#287d56] px-5 py-3 font-extrabold text-white hover:bg-[#216a49] disabled:opacity-60"><MessageCircle className="ml-1 inline h-4 w-4" /> {isSending ? "جاري التجهيز..." : "إرسال عبر واتساب"}</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}