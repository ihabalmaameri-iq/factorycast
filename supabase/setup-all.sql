-- =====================================================
-- الإعداد الكامل: شغّل هذا الملف وحده في Supabase > SQL Editor
-- (يجمع schema.sql + schema2.sql — آمن لإعادة التشغيل)
-- =====================================================

-- =============================================
-- ظ†ط¸ط§ظ… ط¥ط¯ط§ط±ط© ظ…طµظ†ط¹ ط§ظ„طµط¨ظ‘ - ظ…ط®ط·ط· ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ
-- ط´ط؛ظ‘ظ„ ظ‡ط°ط§ ط§ظ„ظ…ظ„ظپ ظپظٹ Supabase > SQL Editor > New query
-- =============================================

-- 1) ط§ظ„ظ…ظˆط§ط¯ ط§ظ„ط®ط§ظ… (ظ„ط§ طھظƒط±ط§ط± ط¨ط§ظ„ط§ط³ظ…)
create table if not exists materials (
  id bigint generated always as identity primary key,
  name text not null unique,
  unit text not null default 'ظƒط؛ظ…',
  unit_price numeric not null default 0,
  min_qty numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- 2) ط­ط±ظƒط§طھ ط§ظ„ظ…ظˆط§ط¯ (طھظˆط±ظٹط¯ / طµط±ظپ) - ط§ظ„ظƒظ…ظٹط© ط§ظ„ط­ط§ظ„ظٹط© طھظڈط­ط³ط¨ ظ…ظ† ظ‡ط°ط§ ط§ظ„ط¬ط¯ظˆظ„
create table if not exists movements (
  id bigint generated always as identity primary key,
  material_id bigint not null references materials(id) on delete cascade,
  type text not null check (type in ('in','out')),
  qty numeric not null check (qty > 0),
  price numeric default 0,
  note text,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

-- 3) ط§ظ„ط²ط¨ط§ط¦ظ† (ظ„ط§ طھظƒط±ط§ط± ط¨ط§ظ„ط§ط³ظ…)
create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null unique,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- 4) ط§ظ„ط®ظ„ط·ط§طھ
create table if not exists mixtures (
  id bigint generated always as identity primary key,
  name text not null,
  date date not null default current_date,
  output_qty numeric not null default 0,
  output_unit text not null default 'ظƒط؛ظ…',
  status text not null default 'draft' check (status in ('draft','executed')),
  cost numeric not null default 0,
  customer_id bigint references customers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- 5) ظ…ظƒظˆظ†ط§طھ ط§ظ„ط®ظ„ط·ط©
create table if not exists mixture_items (
  id bigint generated always as identity primary key,
  mixture_id bigint not null references mixtures(id) on delete cascade,
  material_id bigint not null references materials(id) on delete restrict,
  qty numeric not null check (qty > 0)
);

-- 6) ط§ظ„ظپظˆط§طھظٹط± / ط§ظ„ظ…ط¨ظٹط¹ط§طھ
create table if not exists invoices (
  id bigint generated always as identity primary key,
  invoice_no text not null unique,
  date date not null default current_date,
  customer_id bigint not null references customers(id) on delete restrict,
  mixture_id bigint references mixtures(id) on delete set null,
  qty numeric not null default 0,
  cost numeric not null default 0,
  margin_pct numeric not null default 0,
  total numeric not null default 0,
  paid boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- 7) ط§ظ„ظ…طµط±ظˆظپط§طھ ط§ظ„ظٹظˆظ…ظٹط©
create table if not exists expenses (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  category text not null,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- =============================================
-- ط§ظ„طµظ„ط§ط­ظٹط§طھ: ط³ظٹط§ط³ط§طھ ظ…ظپطھظˆط­ط© ظ„ظ„ظ…ظپطھط§ط­ ط§ظ„ط¹ط§ظ… (anon)
-- ظ…ظ„ط§ط­ط¸ط©: ظ„ط§ط­ظ‚ط§ظ‹ ظٹظ…ظƒظ† طھظپط¹ظٹظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ظˆطھط´ط¯ظٹط¯ ط§ظ„ط³ظٹط§ط³ط§طھ
-- =============================================
alter table materials     enable row level security;
alter table movements     enable row level security;
alter table customers     enable row level security;
alter table mixtures      enable row level security;
alter table mixture_items enable row level security;
alter table invoices      enable row level security;
alter table expenses      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['materials','movements','customers','mixtures','mixture_items','invoices','expenses']
  loop
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('create policy "allow all %s" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;


-- =====================================================
-- ط§ظ„ظ…ط±ط­ظ„ط© ط§ظ„ط«ط§ظ†ظٹط©: ط§ظ„ط­ط³ط§ط¨ط§طھ ظˆط§ظ„طµظ„ط§ط­ظٹط§طھ + ط§ظ„ظ†ظ‚ظ„ + ط§ظ„ط´ط±ظƒط§ط، + ط§ظ„ط±ظˆط§طھط¨
-- ط´ط؛ظ‘ظ„ ظ‡ط°ط§ ط§ظ„ظ…ظ„ظپ ظپظٹ Supabase > SQL Editor (ط¨ط¹ط¯ schema.sql)
-- =====================================================

-- 1) ط§ظ„ط¹ط±ط¨ط§طھ / ط§ظ„ظ†ظ‚ظ„
create table if not exists vehicles (
  id bigint generated always as identity primary key,
  name text not null,
  driver text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- ط¥ط¶ط§ظپط© ط­ظ‚ظˆظ„ ط§ظ„ظ†ظ‚ظ„ ظ„ظ„ظپظˆط§طھظٹط±
alter table invoices add column if not exists vehicle_id bigint references vehicles(id) on delete set null;
alter table invoices add column if not exists delivery_location text;
alter table invoices add column if not exists delivery_fee numeric not null default 0;

-- 2) ط§ظ„ط´ط±ظƒط§ط، ظˆط³ط­ظˆط¨ط§طھظ‡ظ…
create table if not exists partners (
  id bigint generated always as identity primary key,
  name text not null unique,
  share_pct numeric not null default 0,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists partner_withdrawals (
  id bigint generated always as identity primary key,
  partner_id bigint not null references partners(id) on delete cascade,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

-- 3) ط§ظ„ظ…ظˆط¸ظپظˆظ† ظˆط§ظ„ط±ظˆط§طھط¨
create table if not exists employees (
  id bigint generated always as identity primary key,
  name text not null,
  title text,
  phone text,
  base_salary numeric not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists salaries (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees(id) on delete cascade,
  date date not null default current_date,
  month text,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

-- 4) ط§ظ„ظ…ظ„ظپط§طھ ط§ظ„ط´ط®طµظٹط© ظ„ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† (ظ…ط±طھط¨ط·ط© ط¨ط­ط³ط§ط¨ط§طھ ط§ظ„ط¯ط®ظˆظ„)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'accountant' check (role in ('owner','manager','accountant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ط¯ظˆط§ظ„ ظ…ط³ط§ط¹ط¯ط© (security definer ظ„طھط¬ط§ظˆط² RLS ط¯ط§ط®ظ„ظٹط§ظ‹)
create or replace function my_role() returns text
language sql security definer stable as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function profiles_count() returns bigint
language sql security definer stable as
$$ select count(*) from profiles $$;

-- =====================================================
-- 5) طھط´ط¯ظٹط¯ ط§ظ„ط£ظ…ط§ظ†: ط§ظ„ط¯ط®ظˆظ„ ظ„ظ„ظ…ط³ط¬ظ„ظٹظ† ظپظ‚ط· (ط¥ظ„ط؛ط§ط، ط§ظ„ط³ظٹط§ط³ط§طھ ط§ظ„ظ…ظپطھظˆط­ط©)
-- =====================================================
alter table vehicles            enable row level security;
alter table partners            enable row level security;
alter table partner_withdrawals enable row level security;
alter table employees           enable row level security;
alter table salaries            enable row level security;
alter table profiles            enable row level security;

do $$
declare t text;
begin
  -- ط§ظ„ط¬ط¯ط§ظˆظ„ ط§ظ„طھط´ط؛ظٹظ„ظٹط©: ظƒظ„ ظ…ط³طھط®ط¯ظ… ظ…ط³ط¬ظ‘ظ„
  foreach t in array array['materials','movements','customers','mixtures','mixture_items','invoices','expenses','vehicles','employees','salaries']
  loop
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('drop policy if exists "auth all %s" on %I', t, t);
    execute format('create policy "auth all %s" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- ط§ظ„ط´ط±ظƒط§ط، ظˆط§ظ„ط³ط­ظˆط¨ط§طھ: ط§ظ„ظ…ط§ظ„ظƒ ظپظ‚ط· (ط­ظ…ط§ظٹط© ظ…ظ† ط¬ظ‡ط© ط§ظ„ط®ط§ط¯ظ…)
drop policy if exists "partners owner" on partners;
create policy "partners owner" on partners for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists "withdrawals owner" on partner_withdrawals;
create policy "withdrawals owner" on partner_withdrawals for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');

-- ط§ظ„ظ…ظ„ظپط§طھ ط§ظ„ط´ط®طµظٹط©
drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles for select to authenticated using (true);
drop policy if exists "profiles insert" on profiles;
create policy "profiles insert" on profiles for insert to authenticated
  with check (profiles_count() = 0 or my_role() = 'owner');
drop policy if exists "profiles update" on profiles;
create policy "profiles update" on profiles for update to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists "profiles delete" on profiles;
create policy "profiles delete" on profiles for delete to authenticated
  using (my_role() = 'owner');

