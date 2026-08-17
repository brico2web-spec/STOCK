-- 3D PEINTURES · Central Commercial Data
-- Run once in Supabase Dashboard → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.commercial_cloud_data (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dataset_key text not null,
  payload jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  unique(owner_id, dataset_key)
);

create index if not exists commercial_cloud_data_owner_idx
  on public.commercial_cloud_data(owner_id);

alter table public.commercial_cloud_data enable row level security;

revoke all on public.commercial_cloud_data from anon;
grant select, insert, update, delete on public.commercial_cloud_data to authenticated;

drop policy if exists "Commercial users read own data" on public.commercial_cloud_data;
create policy "Commercial users read own data"
  on public.commercial_cloud_data for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Commercial users insert own data" on public.commercial_cloud_data;
create policy "Commercial users insert own data"
  on public.commercial_cloud_data for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Commercial users update own data" on public.commercial_cloud_data;
create policy "Commercial users update own data"
  on public.commercial_cloud_data for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Commercial users delete own data" on public.commercial_cloud_data;
create policy "Commercial users delete own data"
  on public.commercial_cloud_data for delete to authenticated
  using (auth.uid() = owner_id);

create or replace function public.touch_commercial_cloud_data()
returns trigger language plpgsql security invoker as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commercial_cloud_data_touch on public.commercial_cloud_data;
create trigger commercial_cloud_data_touch
before update on public.commercial_cloud_data
for each row execute function public.touch_commercial_cloud_data();
