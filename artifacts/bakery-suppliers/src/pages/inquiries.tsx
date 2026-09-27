import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowUpLeft, MessageCircle, PackageSearch, X } from "lucide-react";
import { getListBuyerItemInquiriesQueryKey, useCloseBuyerItemInquiry, useCreateBuyerItemInquiryContact, useListBuyerItemInquiries, type BuyerItemInquiry } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { InquiryEmpty, InquiryError, InquiryFacts, InquiryGuard, InquiryHeader, InquiryLoading, ReplyDetails, statusText } from "@/components/inquiries/shared";
import { useBuyerAuth } from "@/lib/buyer-auth";
import { useSupplierAuth } from "@/lib/supplier-auth";

export default function InquiriesPage() {
  const { user, isLoading: buyerLoading } = useBuyerAuth();
  const { supplier, isLoading: supplierLoading } = useSupplierAuth();
  const allowed = !!user?.isOwner && !supplier;
  const list = useListBuyerItemInquiries({ query: { queryKey: [...getListBuyerItemInquiriesQueryKey(), user?.id], enabled: !buyerLoading && !supplierLoading && allowed } });
  const close = useCloseBuyerItemInquiry();
  const contact = useCreateBuyerItemInquiryContact();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [contactKey, setContactKey] = useState("");
  const [contactError, setContactError] = useState("");
  const [preview, setPreview] = useState("");
  const [closeError, setCloseError] = useState("");
  const closeInquiry = async () => {
    if (confirmId == null) return;
    setCloseError("");
    try { await close.mutateAsync({ id: confirmId }); await queryClient.invalidateQueries({ queryKey: getListBuyerItemInquiriesQueryKey() }); setConfirmId(null); }
    catch { setCloseError("تعذر إغلاق الاستفسار. حاول مرة أخرى."); }
  };
  const contactSupplier = (inquiryId: number, supplierId: number) => {
    const key = `${inquiryId}-${supplierId}`; setContactKey(key); setContactError("");
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setContactError("اسمح بالنوافذ المنبثقة لفتح رسالة التواصل."); return; }
    contact.mutate({ id: inquiryId, supplierId }, { onSuccess: result => {
      if (result.simulated) { popup.close(); setPreview(result.message); }
      else if (result.whatsappUrl) { popup.opener = null; popup.location.href = result.whatsappUrl; }
      else { popup.close(); setContactError("تعذر تجهيز رابط التواصل."); }
    }, onError: () => { popup.close(); setContactError("تعذر تجهيز التواصل. حاول مرة أخرى."); } });
  };
  return <MainLayout><InquiryHeader eyebrow="حساب صاحب العمل" title="استفسارات المنتجات" description="ردود خاصة على المنتج والعلامة التي طلبتها. قارن السعر والعبوة وموقع الفرع قبل التواصل." action={allowed && <Link href="/inquiries/new" data-testid="link-new-inquiry" className="inquiry-btn inquiry-btn-primary"><PackageSearch className="h-4 w-4" /> استفسار جديد</Link>} /><div className="container mx-auto max-w-6xl flex-1 px-4 py-8 md:py-11">
    {buyerLoading || supplierLoading ? <InquiryLoading /> : !allowed ? <InquiryGuard kind={supplier || user ? "owner" : "buyer"} /> : list.isLoading ? <InquiryLoading /> : list.error ? <InquiryError retry={() => void list.refetch()} /> : !list.data?.length ? <InquiryEmpty /> : <div className="space-y-6">{list.data.map((inquiry: BuyerItemInquiry) => <article key={inquiry.id} data-testid={`card-buyer-inquiry-${inquiry.id}`} className="inquiry-surface overflow-hidden"><div className="border-b border-border bg-secondary/15 p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold text-primary">{inquiry.itemName} · {inquiry.businessName || "نشاط تجاري"}</p><h2 className="mt-1 text-xl font-extrabold md:text-2xl">{inquiry.brandOrType}</h2></div><span data-testid={`status-buyer-inquiry-${inquiry.id}`} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">{statusText[inquiry.status]}</span></div><div className="mt-3"><InquiryFacts inquiry={inquiry} /></div>{inquiry.note && <p className="mt-3 text-sm leading-7">{inquiry.note}</p>}{inquiry.photoUrl && <a href={inquiry.photoUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-buyer-inquiry-photo-${inquiry.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary underline">الصورة المرجعية <ArrowUpLeft className="h-4 w-4" /></a>}</div>
      <div className="p-5 md:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold">ردود الموردين <span className="text-sm text-muted-foreground">({inquiry.replies.length.toLocaleString("ar-SA")})</span></h3>{inquiry.status === "active" && <button type="button" data-testid={`button-close-inquiry-${inquiry.id}`} onClick={() => setConfirmId(inquiry.id)} className="text-sm font-bold text-muted-foreground underline hover:text-destructive">إغلاق الاستفسار</button>}</div>{inquiry.replies.length ? <div className="grid gap-3 md:grid-cols-2">{inquiry.replies.map(reply => <div key={reply.supplierId} data-testid={`card-inquiry-reply-${inquiry.id}-${reply.supplierId}`} className="flex flex-col justify-between rounded-2xl border border-border bg-background/60 p-4"><ReplyDetails reply={reply} />{(reply.responseStatus === "available" || reply.responseStatus === "alternative") && <><button type="button" data-testid={`button-contact-inquiry-${inquiry.id}-${reply.supplierId}`} onClick={() => contactSupplier(inquiry.id, reply.supplierId)} disabled={contact.isPending} className="inquiry-btn inquiry-btn-outline mt-4 w-full"><MessageCircle className="h-4 w-4" />{contact.isPending && contactKey === `${inquiry.id}-${reply.supplierId}` ? "جارٍ تجهيز التواصل..." : "التواصل مع المورد"}</button>{contactError && contactKey === `${inquiry.id}-${reply.supplierId}` && <p role="alert" className="mt-2 text-xs text-destructive">{contactError}</p>}</>}</div>)}</div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">لم تصل ردود بعد. ستظهر هنا عندما يرد مورد مطابق.</p>}</div></article>)}</div>}
  </div>
  {confirmId !== null && <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/50 p-4"><section role="dialog" aria-modal="true" aria-label="تأكيد إغلاق الاستفسار" className="inquiry-surface w-full max-w-md p-6"><h2 className="text-xl font-extrabold">إغلاق هذا الاستفسار؟</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">لن يتمكن الموردون من إرسال ردود جديدة بعد إغلاقه. تبقى الردود السابقة متاحة لك.</p>{closeError && <p role="alert" className="mt-3 text-sm text-destructive">{closeError}</p>}<div className="mt-5 flex gap-2"><button type="button" data-testid="button-confirm-close-inquiry" disabled={close.isPending} onClick={() => void closeInquiry()} className="inquiry-btn inquiry-btn-primary">{close.isPending ? "جارٍ الإغلاق..." : "تأكيد الإغلاق"}</button><button type="button" data-testid="button-cancel-close-inquiry" onClick={() => { setConfirmId(null); setCloseError(""); }} className="inquiry-btn inquiry-btn-outline">تراجع</button></div></section></div>}
  {preview && <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/50 p-4"><section role="dialog" aria-modal="true" aria-label="معاينة رسالة التواصل" className="inquiry-surface w-full max-w-lg p-6"><div className="flex items-center justify-between"><h2 className="font-extrabold">معاينة رسالة التواصل</h2><button type="button" data-testid="button-close-contact-preview" onClick={() => setPreview("")} aria-label="إغلاق"><X className="h-5 w-5" /></button></div><p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm leading-7">{preview}</p></section></div>}
  </MainLayout>;
}