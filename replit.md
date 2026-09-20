# دليل موردي المخابز والحلويات

دليل عربي معلوماتي لأصحاب المخابز والكافيهات للبحث عن الموردين والمنتجات والتواصل المباشر معهم.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل خادم Express على المسار `/api`
- `pnpm --filter @workspace/bakery-suppliers run dev` — تشغيل واجهة الدليل
- `pnpm --filter @workspace/api-server run typecheck` — فحص أنواع الخادم
- `pnpm --filter @workspace/bakery-suppliers run typecheck` — فحص أنواع الواجهة
- `pnpm --filter @workspace/api-spec run codegen` — إعادة توليد عميل API بعد تعديل OpenAPI

## Stack

- React + Vite + TypeScript + Tailwind CSS للواجهة العربية RTL
- Express 5 للخادم
- SQLite عبر `node:sqlite` للتخزين المحلي
- OpenAPI + Orval لعقود API والـ hooks المولدة

## Where things live

- `artifacts/bakery-suppliers/src/` — صفحات ومكونات الواجهة
- `artifacts/api-server/src/routes/directory.ts` — نقاط API للدليل
- `artifacts/api-server/src/lib/directory-db.ts` — مخطط SQLite والبيانات التجريبية
- `lib/api-spec/openapi.yaml` — المصدر الأساسي لعقد API
- `data/bakery-directory.sqlite` — قاعدة البيانات المحلية، تُنشأ تلقائياً عند تشغيل الخادم

## Product

- بحث باسم المنتج أو المورد
- تصنيفات مع فلترة وترتيب
- دليل موردين مع ملفات تفصيلية وتواصل واتساب واتصال
- تفاصيل فنية للمنتجات ومنتجات مشابهة
- تقييمات مفتوحة بالاسم وتُحفظ في SQLite
- صفحات من نحن واتصل بنا وشروط الاستخدام

## Architecture decisions

- الموقع دليل معلوماتي فقط؛ لا توجد حسابات أو مدفوعات أو طلبات.
- كل الصور اختيارية وتظهر بدائل رسومية محلية عند عدم توفر صورة.
- الاتصال التجاري يتم خارج الموقع عبر الهاتف أو واتساب.