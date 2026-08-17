create or replace function public.get_public_stock_status()
returns table (
  product_code text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.product_code,
    case
      when p.total_pieces > p.minimum_stock then 'متوفر'
      else 'غير متوفر حاليا'
    end as status
  from public.stock_products p
  where coalesce(trim(p.product_code), '') <> '';
$$;

grant execute on function public.get_public_stock_status() to anon, authenticated;
