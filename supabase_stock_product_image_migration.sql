-- شغّل هذا السكريبت مرة واحدة في Supabase SQL Editor قبل رفع نسخة stock.html الجديدة.
-- الصورة كتتحفظ كـ WebP مصغرة داخل image_url، لذلك ما كاينش Bucket إضافي مطلوب.

alter table public.stock_products
  add column if not exists image_url text not null default '';

notify pgrst, 'reload schema';
