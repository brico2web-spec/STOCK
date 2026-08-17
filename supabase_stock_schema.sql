-- 3D PEINTURES · قاعدة بيانات المخزون
-- شغّل هذا السكريبت مرة واحدة داخل Supabase SQL Editor.
-- لا تضع كلمات السر أو مفاتيح الإدارة داخل هذا الملف أو داخل GitHub.

create extension if not exists pgcrypto;

create table if not exists public.stock_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'viewer' check (role in ('admin', 'manager', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_code text not null default '',
  category text not null default '',
  unit text not null default 'قطعة',
  boxes_quantity integer not null default 0 check (boxes_quantity >= 0),
  pieces_per_box integer not null default 1 check (pieces_per_box > 0),
  total_pieces integer not null default 0 check (total_pieces >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  supplier text not null default '',
  storage_location text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.stock_products(id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment')),
  quantity_pieces integer not null check (quantity_pieces <> 0),
  boxes_quantity integer not null default 0 check (boxes_quantity >= 0),
  previous_quantity integer not null default 0 check (previous_quantity >= 0),
  new_quantity integer not null default 0 check (new_quantity >= 0),
  reason text not null default '',
  note text not null default '',
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_change_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'movement')),
  summary text not null default '',
  before_data jsonb,
  after_data jsonb,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_products_name_idx on public.stock_products (lower(product_name));
create index if not exists stock_products_code_idx on public.stock_products (lower(product_code));
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_date_idx on public.stock_movements (created_at desc);
create index if not exists stock_change_log_date_idx on public.stock_change_log (created_at desc);

create or replace function public.current_stock_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.stock_profiles where id = auth.uid()), 'viewer');
$$;

revoke all on function public.current_stock_role() from public;
grant execute on function public.current_stock_role() to authenticated;

alter table public.stock_profiles enable row level security;
alter table public.stock_products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_change_log enable row level security;

drop policy if exists stock_profiles_select on public.stock_profiles;
create policy stock_profiles_select on public.stock_profiles
  for select to authenticated
  using (id = auth.uid() or public.current_stock_role() in ('admin', 'manager'));

drop policy if exists stock_profiles_admin_write on public.stock_profiles;
create policy stock_profiles_admin_write on public.stock_profiles
  for all to authenticated
  using (public.current_stock_role() = 'admin')
  with check (public.current_stock_role() = 'admin');

drop policy if exists stock_products_select on public.stock_products;
create policy stock_products_select on public.stock_products
  for select to authenticated
  using (true);

drop policy if exists stock_products_manager_insert on public.stock_products;
create policy stock_products_manager_insert on public.stock_products
  for insert to authenticated
  with check (public.current_stock_role() in ('admin', 'manager'));

drop policy if exists stock_products_manager_update on public.stock_products;
create policy stock_products_manager_update on public.stock_products
  for update to authenticated
  using (public.current_stock_role() in ('admin', 'manager'))
  with check (public.current_stock_role() in ('admin', 'manager'));

drop policy if exists stock_products_admin_delete on public.stock_products;
create policy stock_products_admin_delete on public.stock_products
  for delete to authenticated
  using (public.current_stock_role() = 'admin');

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (true);

drop policy if exists stock_movements_manager_insert on public.stock_movements;
create policy stock_movements_manager_insert on public.stock_movements
  for insert to authenticated
  with check (public.current_stock_role() in ('admin', 'manager'));

drop policy if exists stock_movements_admin_update on public.stock_movements;
create policy stock_movements_admin_update on public.stock_movements
  for update to authenticated
  using (public.current_stock_role() = 'admin')
  with check (public.current_stock_role() = 'admin');

drop policy if exists stock_movements_admin_delete on public.stock_movements;
create policy stock_movements_admin_delete on public.stock_movements
  for delete to authenticated
  using (public.current_stock_role() = 'admin');

drop policy if exists stock_log_select on public.stock_change_log;
create policy stock_log_select on public.stock_change_log
  for select to authenticated
  using (true);

drop policy if exists stock_log_manager_insert on public.stock_change_log;
create policy stock_log_manager_insert on public.stock_change_log
  for insert to authenticated
  with check (public.current_stock_role() in ('admin', 'manager'));

drop policy if exists stock_log_admin_update on public.stock_change_log;
create policy stock_log_admin_update on public.stock_change_log
  for update to authenticated
  using (public.current_stock_role() = 'admin')
  with check (public.current_stock_role() = 'admin');

drop policy if exists stock_log_admin_delete on public.stock_change_log;
create policy stock_log_admin_delete on public.stock_change_log
  for delete to authenticated
  using (public.current_stock_role() = 'admin');

create or replace function public.set_stock_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stock_profiles_updated_at on public.stock_profiles;
create trigger stock_profiles_updated_at
before update on public.stock_profiles
for each row execute function public.set_stock_updated_at();

drop trigger if exists stock_products_updated_at on public.stock_products;
create trigger stock_products_updated_at
before update on public.stock_products
for each row execute function public.set_stock_updated_at();

-- تفعيل التحديثات المباشرة للجداول الثلاثة إذا كانت Realtime متاحة.
do $$
begin
  begin alter publication supabase_realtime add table public.stock_products; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.stock_movements; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.stock_change_log; exception when duplicate_object then null; end;
end $$;

-- بعد إنشاء حساب رئيس المخزن من Authentication > Users، استعمل هذا السطر
-- مع تبديل USER_UUID بالمعرّف الحقيقي للحساب:
-- insert into public.stock_profiles (id, full_name, role)
-- values ('USER_UUID', 'رئيس المخزن', 'manager')
-- on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;
