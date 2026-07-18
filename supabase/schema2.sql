-- =====================================================
-- المرحلة الثانية: الحسابات والصلاحيات + النقل + الشركاء + الرواتب
-- شغّل هذا الملف في Supabase > SQL Editor (بعد schema.sql)
-- =====================================================

-- 1) العربات / النقل
create table if not exists vehicles (
  id bigint generated always as identity primary key,
  name text not null,
  driver text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- إضافة حقول النقل للفواتير
alter table invoices add column if not exists vehicle_id bigint references vehicles(id) on delete set null;
alter table invoices add column if not exists delivery_location text;
alter table invoices add column if not exists delivery_fee numeric not null default 0;

-- 2) الشركاء وسحوباتهم
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

-- 3) الموظفون والرواتب
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

-- 4) الملفات الشخصية للمستخدمين (مرتبطة بحسابات الدخول)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'accountant' check (role in ('owner','manager','accountant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- دوال مساعدة (security definer لتجاوز RLS داخلياً)
create or replace function my_role() returns text
language sql security definer stable as
$$ select role from profiles where id = auth.uid() and active $$;

create or replace function profiles_count() returns bigint
language sql security definer stable as
$$ select count(*) from profiles $$;

-- =====================================================
-- 5) تشديد الأمان: الدخول للمسجلين فقط (إلغاء السياسات المفتوحة)
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
  -- الجداول التشغيلية: كل مستخدم مسجّل
  foreach t in array array['materials','movements','customers','mixtures','mixture_items','invoices','expenses','vehicles','employees','salaries']
  loop
    execute format('drop policy if exists "allow all %s" on %I', t, t);
    execute format('drop policy if exists "auth all %s" on %I', t, t);
    execute format('create policy "auth all %s" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- الشركاء والسحوبات: المالك فقط (حماية من جهة الخادم)
drop policy if exists "partners owner" on partners;
create policy "partners owner" on partners for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');
drop policy if exists "withdrawals owner" on partner_withdrawals;
create policy "withdrawals owner" on partner_withdrawals for all to authenticated
  using (my_role() = 'owner') with check (my_role() = 'owner');

-- الملفات الشخصية
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
