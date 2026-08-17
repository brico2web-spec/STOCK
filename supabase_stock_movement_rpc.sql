-- شغّل هذا السكريبت بعد supabase_stock_schema.sql
-- يسجل دخول/خروج السلع ويحدث الكمية وسجل التغييرات في عملية واحدة.

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity_pieces integer,
  p_boxes_quantity integer default 0,
  p_reason text default '',
  p_note text default ''
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.stock_products%rowtype;
  v_movement public.stock_movements%rowtype;
  v_old integer;
  v_new integer;
  v_delta integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولا';
  end if;

  if public.current_stock_role() not in ('admin', 'manager') then
    raise exception 'ليس لديك صلاحية تعديل المخزون';
  end if;

  if p_quantity_pieces is null or p_quantity_pieces = 0 then
    raise exception 'الكمية يجب أن تكون مختلفة عن صفر';
  end if;

  if p_movement_type not in ('in', 'out', 'adjustment') then
    raise exception 'نوع الحركة غير صالح';
  end if;

  select * into v_product
  from public.stock_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'المنتوج غير موجود';
  end if;

  v_old := v_product.total_pieces;
  v_delta := case
    when p_movement_type = 'in' then abs(p_quantity_pieces)
    when p_movement_type = 'out' then -abs(p_quantity_pieces)
    else p_quantity_pieces
  end;
  v_new := v_old + v_delta;

  if v_new < 0 then
    raise exception 'الكمية الخارجة أكبر من المخزون المتوفر';
  end if;

  update public.stock_products
  set total_pieces = v_new,
      boxes_quantity = case
        when p_movement_type = 'in' then boxes_quantity + greatest(coalesce(p_boxes_quantity, 0), 0)
        when p_movement_type = 'out' then greatest(0, boxes_quantity - greatest(coalesce(p_boxes_quantity, 0), 0))
        else boxes_quantity
      end,
      updated_at = now()
  where id = p_product_id;

  insert into public.stock_movements (
    product_id, movement_type, quantity_pieces, boxes_quantity,
    previous_quantity, new_quantity, reason, note, performed_by
  ) values (
    p_product_id, p_movement_type, v_delta, greatest(coalesce(p_boxes_quantity, 0), 0),
    v_old, v_new, coalesce(p_reason, ''), coalesce(p_note, ''), auth.uid()
  ) returning * into v_movement;

  insert into public.stock_change_log (
    table_name, record_id, action, summary, before_data, after_data, performed_by
  ) values (
    'stock_products', p_product_id, 'movement',
    case when p_movement_type = 'in' then 'إضافة إلى المخزون'
         when p_movement_type = 'out' then 'خروج من المخزون'
         else 'تعديل المخزون' end,
    jsonb_build_object('total_pieces', v_old, 'boxes_quantity', v_product.boxes_quantity),
    jsonb_build_object('total_pieces', v_new),
    auth.uid()
  );

  return v_movement;
end;
$$;

revoke all on function public.record_stock_movement(uuid, text, integer, integer, text, text) from public;
grant execute on function public.record_stock_movement(uuid, text, integer, integer, text, text) to authenticated;
