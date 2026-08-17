# موقع مخزون 3D PEINTURES الدائم

هذه النسخة هي واجهة إنتاجية مستقلة للمخزون، ولا تستعمل بيانات تجريبية. تعتمد على Supabase لتسجيل الدخول، المخزون المشترك، حركات السلع، وسجل التغييرات.

## ما تم إنجازه

تتضمن الصفحة شاشة إعداد الربط، تسجيل دخول بالبريد وكلمة المرور، صلاحيات `admin` و`manager` و`viewer`، بطاقات المخزون والبحث، تسجيل دخول وخروج السلع، سجل الحركات، سجل التغييرات، والتحديثات المباشرة عند تعديل البيانات من جهاز آخر. يتم تحديث الكمية داخل دالة قاعدة البيانات `record_stock_movement` في عملية واحدة لتفادي تعارض جهازين.

## خطوات إكمال الربط

أولاً، شغّل `supabase_stock_schema.sql` داخل Supabase SQL Editor. ثم شغّل `supabase_stock_movement_rpc.sql` بعده. لا تحتاج إلى تشغيلهما أكثر من مرة؛ السكريبتان قابلان لإعادة التشغيل بأمان.

بعد ذلك، افتح **Project Settings → API** في مشروع Supabase، وانسخ `Publishable key` أو `anon public key`. لا تنسخ `service_role key` ولا كلمة سر قاعدة البيانات. ضع المفتاح في ملف `stock-config.js` مكان القيمة الفارغة:

```javascript
window.STOCK_CONFIG = {
  url: 'https://zliwnkahlxdpufgdcaku.supabase.co',
  anonKey: 'ضع هنا anon public key'
};
```

أنشئ حساب رئيس المخزن من **Authentication → Users → Add user**. بعد إنشاء الحساب، انسخ UUID ديالو، ثم شغّل هذا الاستعلام مع تغيير القيمتين:

```sql
insert into public.stock_profiles (id, full_name, role)
values ('UUID ديال الحساب', 'رئيس المخزن', 'manager')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role;
```

لإنشاء حسابكم بصلاحية كاملة، أنشئ حساباً آخر بالطريقة نفسها واستعمل `admin` مكان `manager`.

## النشر على GitHub Pages

ضع `stock.html` و`stock-config.js` في المستودع الذي تريد نشره، أو في مستودع مستقل للمخزون، ثم فعّل **Settings → Pages → Deploy from branch → main → root**. الرابط الناتج تقدر تضيفه في AppCreator24 كصفحة مستقلة.

إذا كان الموقعان ديال GitHub في مستودعين مختلفين، يمكن وضع نفس `stock.html` و`stock-config.js` في بجوج؛ ما دام الرابط والمفتاح العام نفسهما، سيقرآن نفس مخزون Supabase. لا تضع أي مفتاح سري داخل المستودع.

## ملاحظة مهمة

المفتاح العام `anon/publishable` ليس كلمة سر قاعدة البيانات. الحماية الحقيقية كتجي من تسجيل الدخول وRLS والصلاحيات الموجودة في SQL. رئيس المخزن يقدر يسجل الحركات، والمدير يقدر يدير المراقبة والتعديلات حسب الصلاحية، والمستخدم `viewer` يقدر يشوف فقط.
