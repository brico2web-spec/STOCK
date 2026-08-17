-- شغّل هذا السكريبت مرة واحدة في Supabase SQL Editor.
-- حذف آمن للمنتوج مع حذف حركاته المرتبطة بسبب ON DELETE CASCADE.

create or replace function public.delete_stock_product(p_product_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.stock_products%rowtype;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولا';
  end if;

  if public.current_stock_role() not in ('admin', 'manager') then
    raise exception 'ليس لديك صلاحية حذف المنتوجات';
  end if;

  select * into v_product
  from public.stock_products
  where id = p_product_id;

  if not found then
    raise exception 'المنتوج غير موجود أو تحيد من قبل';
  end if;

  delete from public.stock_products where id = p_product_id;

  insert into public.stock_change_log (
    table_name, record_id, action, summary, before_data, after_data, performed_by
  ) values (
    'stock_products', p_product_id, 'delete', 'حذف المنتوج',
    jsonb_build_object('product_name', v_product.product_name,
                       'product_code', v_product.product_code,
                       'total_pieces', v_product.total_pieces),
    null, auth.uid()
  );

  return true;
end;
$$;

revoke all on function public.delete_stock_product(uuid) from public;
grant execute on function public.delete_stock_product(uuid) to authenticated;
