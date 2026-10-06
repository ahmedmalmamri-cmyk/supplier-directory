import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  getGetSupplierAlmondVariantsQueryKey,
  useGetSupplierAlmondVariants,
  useUpdateSupplierAlmondVariants,
  type AlmondVariant,
  type SupplierAlmondVariantsInput,
} from "@workspace/api-client-react";
import { Form } from "@/components/ui/form";
import { SupplierWorkspace, WorkspaceError } from "@/components/supplier/SupplierWorkspace";
import { useSupplierAuth } from "@/lib/supplier-auth";

const variantsSchema = z.object({
  mode: z.enum(["unspecified", "all", "selected"]),
  variants: z.array(z.object({
    form: z.enum(["whole", "slices", "powder"]),
    preparation: z.enum(["raw", "roasted"]),
    size: z.enum(["32", "34", "36"]).nullable(),
  })),
}).superRefine(({ mode, variants }, context) => {
  if (mode === "selected" && variants.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "أضف تركيبة واحدة على الأقل قبل الحفظ." });
  }
  if (mode !== "selected" && variants.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "لا تُرسل تركيبات محددة مع هذا الاختيار." });
  }
  const keys = new Set<string>();
  variants.forEach((variant, index) => {
    if ((variant.form === "whole") !== (variant.size !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index, "size"], message: "اختر مقاساً للحب، واترك المقاس غير محدد للشرائح والمطحون." });
    }
    const key = `${variant.form}|${variant.preparation}|${variant.size ?? ""}`;
    if (keys.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", index], message: "هذه التركيبة مضافة بالفعل." });
    keys.add(key);
  });
});

const variantName = (variant: AlmondVariant) => {
  const form = variant.form === "whole" ? "حب" : variant.form === "slices" ? "شرائح" : "مطحون";
  const preparation = variant.preparation === "raw" ? "ني" : "محمص";
  return `لوز ${form} ${preparation}${variant.size ? ` · مقاس ${variant.size}` : ""}`;
};

export default function SupplierAlmondVariantsPage() {
  const auth = useSupplierAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const queryKey = [...getGetSupplierAlmondVariantsQueryKey(), auth.supplier?.id ?? null];
  const query = useGetSupplierAlmondVariants({
    query: {
      queryKey,
      staleTime: 0,
      enabled: !auth.isLoading && !!auth.supplier,
    },
  });
  const update = useUpdateSupplierAlmondVariants();
  const form = useForm<SupplierAlmondVariantsInput>({
    resolver: zodResolver(variantsSchema),
    defaultValues: { mode: "unspecified", variants: [] },
  });
  const variants = form.watch("variants");
  const mode = form.watch("mode");
  const [choiceForm, setChoiceForm] = useState<AlmondVariant["form"]>("whole");
  const [preparation, setPreparation] = useState<AlmondVariant["preparation"]>("raw");
  const [size, setSize] = useState<AlmondVariant["size"]>("32");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editorError, setEditorError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (query.data && !form.formState.isDirty) {
      form.reset({ mode: query.data.mode, variants: query.data.variants });
    }
  }, [query.data, form]);

  useEffect(() => {
    if (!auth.isLoading && !auth.supplier) navigate("/supplier/login", { replace: true });
  }, [auth.isLoading, auth.supplier, navigate]);

  const changeMode = (nextMode: SupplierAlmondVariantsInput["mode"]) => {
    form.setValue("mode", nextMode, { shouldDirty: true, shouldValidate: true });
    if (nextMode !== "selected") {
      form.setValue("variants", [], { shouldDirty: true, shouldValidate: true });
      setEditingIndex(null);
    }
    setSaveError("");
    setNotice("");
  };

  const startEdit = (variant: AlmondVariant, index: number) => {
    setChoiceForm(variant.form);
    setPreparation(variant.preparation);
    setSize(variant.size);
    setEditingIndex(index);
    setEditorError("");
  };

  const addOrUpdateChoice = () => {
    setEditorError("");
    if (choiceForm === "whole" && !size) {
      setEditorError("اختر مقاساً للحب.");
      return;
    }
    const next: AlmondVariant = { form: choiceForm, preparation, size: choiceForm === "whole" ? size : null };
    const base = variants.filter((_, index) => index !== editingIndex);
    if (base.some((item) => item.form === next.form && item.preparation === next.preparation && item.size === next.size)) {
      setEditorError("هذه التركيبة موجودة بالفعل.");
      return;
    }
    const changed = [...base, next];
    form.setValue("variants", changed, { shouldDirty: true, shouldValidate: true });
    form.setValue("mode", "selected", { shouldDirty: true, shouldValidate: true });
    setEditingIndex(null);
    setChoiceForm("whole");
    setPreparation("raw");
    setSize("32");
  };

  const removeChoice = (index: number) => {
    form.setValue("variants", variants.filter((_, current) => current !== index), { shouldDirty: true, shouldValidate: true });
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
  };

  const reload = async () => {
    setSaveError("");
    setNotice("");
    const result = await query.refetch();
    if (result.data) form.reset({ mode: result.data.mode, variants: result.data.variants });
  };

  const submit = async (values: SupplierAlmondVariantsInput) => {
    setSaveError("");
    setNotice("");
    try {
      const saved = await update.mutateAsync({ data: values });
      form.reset({ mode: saved.mode, variants: saved.variants });
      queryClient.setQueryData(queryKey, saved);
      await queryClient.invalidateQueries({ queryKey });
      setNotice("تم حفظ تفضيلات اللوز. يمكنك العودة لاحقاً لتعديلها.");
      setEditingIndex(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "تعذر حفظ التغييرات. حاول مرة أخرى.");
      if ((error as { status?: number }).status === 401) navigate("/supplier/login", { replace: true });
    }
  };

  const error = query.error as (Error & { status?: number }) | null;
  return <SupplierWorkspace title="تفضيلات أصناف اللوز" eyebrow="خيارات التوريد" subtitle="أعلن فقط عن الأشكال والتحضيرات والمقاسات التي توفرها. هذه المعلومات ليست تأكيداً للمخزون الحالي." error={error}>
    {query.isPending ? <div className="supplier-panel h-64 animate-pulse bg-muted/60" role="status" aria-label="جارٍ تحميل تفضيلات اللوز" />
      : query.error ? <WorkspaceError error={error!} retry={() => void reload()} />
      : query.data && <>
        {!query.data.eligible ? <section className="supplier-panel p-6 md:p-8" data-testid="state-almond-ineligible">
          <h2 className="text-xl font-extrabold">خيارات اللوز غير متاحة لهذا الحساب حالياً</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">يمكنك ضبط هذه التفضيلات بعد ربط ملف المورد بأحد أصناف اللوز المعتمدة في الدليل. لا يمكن حفظ خيارات اللوز قبل ذلك.</p>
          <button type="button" data-testid="button-reload-almond-variants" onClick={() => void reload()} disabled={query.isFetching} className="mt-5 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"><RefreshCw className="h-4 w-4" /> إعادة التحميل</button>
        </section> : <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <section className="supplier-panel p-5 md:p-7" aria-labelledby="almond-settings-heading">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="almond-settings-heading" className="text-xl font-extrabold">ما الذي تفضّل إعلانه؟</h2><p className="mt-1 text-sm text-muted-foreground">اختر إجابة واحدة؛ يمكنك تغييرها وحفظها في أي وقت.</p></div>
                <button type="button" data-testid="button-reload-almond-variants" onClick={() => void reload()} disabled={query.isFetching || update.isPending} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50"><RefreshCw className="h-4 w-4" /> إعادة تحميل</button>
              </div>
              <div className="mt-5 grid gap-3">
                {([
                  ["unspecified", "لم أحدد بعد", "سأترك تفاصيل أشكال اللوز ومقاساته غير محددة حالياً."],
                  ["all", "أوفر جميع الخيارات", "أعلن عن توفر كل تركيبات اللوز المدعومة، دون تحديد منفصل لكل خيار."],
                  ["selected", "أحدد خيارات بعينها", "أضف كل تركيبة على حدة؛ يمكن إضافة أكثر من مقاس للحب."],
                ] as const).map(([value, label, detail]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                  <input type="radio" name="almond-mode" data-testid={`radio-almond-mode-${value}`} value={value} checked={mode === value} onChange={() => changeMode(value)} className="mt-1 accent-primary" />
                  <span><strong className="block text-sm">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
                </label>)}
              </div>
              {mode === "selected" && <>
                <h3 className="mt-7 text-base font-extrabold">التركيبات التي أعلنت عنها</h3>
                <p className="mt-1 text-sm text-muted-foreground">كل مقاس للحب خيار مستقل، مع إمكانية تكرار الشكل لمقاسات أو تحضيرات مختلفة.</p>
                <div className="mt-4 space-y-2">
                  {variants.map((variant, index) => <div key={`${variant.form}-${variant.preparation}-${variant.size ?? "none"}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3" data-testid={`row-almond-variant-${index}`}>
                    <span className="text-sm font-bold">{variantName(variant)}</span>
                    <span className="flex shrink-0 gap-1">
                      <button type="button" aria-label={`تعديل ${variantName(variant)}`} data-testid={`button-edit-almond-variant-${index}`} onClick={() => startEdit(variant, index)} className="rounded-lg border p-2 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
                      <button type="button" aria-label={`حذف ${variantName(variant)}`} data-testid={`button-remove-almond-variant-${index}`} onClick={() => removeChoice(index)} className="rounded-lg border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  </div>)}
                  {variants.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">لم تضف خيارات محددة بعد.</p>}
                </div>
                <div className="mt-4 rounded-xl bg-muted/30 p-4">
                  <h4 className="font-bold">{editingIndex === null ? "إضافة تركيبة" : "تعديل التركيبة"}</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-sm font-bold">الشكل<select data-testid="select-almond-form" value={choiceForm} onChange={(event) => { const next = event.target.value as AlmondVariant["form"]; setChoiceForm(next); if (next !== "whole") setSize(null); else if (!size) setSize("32"); setEditorError(""); }} className="mt-1 block h-10 w-full rounded-lg border bg-background px-2 font-normal"><option value="whole">حب</option><option value="slices">شرائح</option><option value="powder">مطحون</option></select></label>
                    <label className="text-sm font-bold">التحضير<select data-testid="select-almond-preparation" value={preparation} onChange={(event) => setPreparation(event.target.value as AlmondVariant["preparation"])} className="mt-1 block h-10 w-full rounded-lg border bg-background px-2 font-normal"><option value="raw">ني</option><option value="roasted">محمص</option></select></label>
                    {choiceForm === "whole" && <label className="text-sm font-bold">المقاس<select data-testid="select-almond-size" value={size ?? ""} onChange={(event) => setSize((event.target.value || null) as AlmondVariant["size"])} className="mt-1 block h-10 w-full rounded-lg border bg-background px-2 font-normal"><option value="">اختر المقاس</option><option value="32">32</option><option value="34">34</option><option value="36">36</option></select></label>}
                  </div>
                  {editorError && <p role="alert" className="mt-3 text-sm font-bold text-destructive" data-testid="status-almond-editor-error">{editorError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="button" data-testid="button-add-almond-variant" onClick={addOrUpdateChoice} className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5">{editingIndex === null ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}{editingIndex === null ? "إضافة إلى القائمة" : "تحديث الخيار"}</button>
                    {editingIndex !== null && <button type="button" data-testid="button-cancel-almond-edit" onClick={() => { setEditingIndex(null); setEditorError(""); }} className="rounded-xl border px-4 py-2 text-sm font-bold hover:bg-muted">إلغاء</button>}
                  </div>
                </div>
              </>}
              {form.formState.errors.variants?.message && <p role="alert" className="mt-3 text-sm font-bold text-destructive" data-testid="status-almond-validation-error">{form.formState.errors.variants.message}</p>}
              {saveError && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive" data-testid="status-almond-save-error">{saveError}</p>}
              {notice && <p role="status" className="mt-4 rounded-xl bg-success/10 p-3 text-sm font-bold text-success" data-testid="status-almond-saved">{notice}</p>}
              <button type="submit" data-testid="button-save-almond-variants" disabled={update.isPending || !form.formState.isDirty} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{update.isPending ? "جارٍ الحفظ..." : <><Check className="h-4 w-4" /> حفظ التفضيلات</>}</button>
            </section>
            <aside className="supplier-panel h-fit bg-secondary/40 p-5 md:p-6">
              <h2 className="text-lg font-extrabold">إعلان دقيق، دون وعود مخزون</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">تحديد شكل أو تحضير أو مقاس يساعد أصحاب المخابز على العثور على خياراتك المعلنة. لا تعني الخيارات المخزنة أن الكمية متوفرة الآن؛ يرجى تأكيد المخزون وموعد التسليم عند التواصل.</p>
              <p className="mt-4 border-t border-border pt-4 text-sm leading-7 text-muted-foreground">إذا اخترت «لم أحدد بعد»، فستبقى ضمن نتائج البحث العام عن اللوز، لكن لن تظهر عند تطبيق فلتر دقيق لاختيار معلن.</p>
            </aside>
          </form>
        </Form>}
      </>}
  </SupplierWorkspace>;
}