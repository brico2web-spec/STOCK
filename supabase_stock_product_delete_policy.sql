-- شغّل هذا السكريبت مرة واحدة في Supabase SQL Editor.
-- يسمح بالحذف للمدير ورئيس المخزن فقط، ويمنع viewer.

drop policy if exists stock_products_admin_delete on public.stock_products;
drop policy if exists stock_products_manager_delete on public.stock_products;

create policy stock_products_manager_delete on public.stock_products
  for delete to authenticated
  using (public.current_stock_role() in ('admin', 'manager'));
