-- =====================================================
-- الإعداد الكامل: شغّل هذا الملف وحده في Supabase > SQL Editor
-- (آمن لإعادة التشغيل في أي وقت)
-- =====================================================

-- =============================================
-- نظام إدارة مصنع الصبّ - مخطط قاعدة البيانات
-- شغّل هذا الملف في Supabase > SQL Editor > New query
-- =============================================

-- 1) المواد الخام (لا تكرار بالاسم)
create table if not exists materials (
  id bigint generated always as identity primary key,
  name text not null unique,
  unit text not null default 'كغم',
  unit_price numeric not null default 0,
  min_qty numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- 2) حركات المواد (توريد / صرف) - الكمية الحالية تُحسب من هذا الجدول
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

-- 3) الزبائن (لا تكرار بالاسم)
create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null unique,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- 4) الخلطات
create table if not exists mixtures (
  id bigint generated always as identity primary key,
  name text not null,
  date date not null default current_date,
  output_qty numeric not null default 0,
  output_unit text not null default 'كغم',
  status text not null default 'draft' check (status in ('draft','executed')),
  cost numeric not null default 0,
  customer_id bigint references customers(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

-- 5) مكونات الخلطة
create table if not exists mixture_items (
  id bigint generated always as identity primary key,
  mixture_id bigint not null references mixtures(id) on delete cascade,
  material_id bigint not null references materials(id) on delete restrict,
  qty numeric not null check (qty > 0)
);

-- 6) الفواتير / المبيعات
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

-- 7) المصروفات اليومية
create table if not exists expenses (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  category text not null,
  amount numeric not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- =============================================
-- الصلاحيات: سياسات مفتوحة للمفتاح العام (anon)
-- ملاحظة: لاحقاً يمكن تفعيل تسجيل الدخول وتشديد السياسات
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


-- =====================================================
-- المرحلة الثالثة: سجل الحركات (تدقيق مضاد للتلاعب)
-- كل إضافة/تعديل/حذف تُسجل تلقائياً من قاعدة البيانات نفسها
-- =====================================================

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb
);

-- دالة التسجيل: تعمل من الخادم ولا يمكن تجاوزها من التطبيق
create or replace function audit_trigger() returns trigger
language plpgsql security definer as $$
declare uname text;
begin
  select name into uname from profiles where id = auth.uid();
  insert into audit_log(user_id, user_name, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(),
    coalesce(uname, 'غير معروف'),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id::text else new.id::text end,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- تفعيل التسجيل على كل الجداول
do $$
declare t text;
begin
  foreach t in array array['materials','movements','customers','mixtures','mixture_items',
    'invoices','expenses','vehicles','partners','partner_withdrawals','employees','salaries','profiles']
  loop
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;

-- الحماية: القراءة للمالك فقط — ولا سياسات تعديل أو حذف إطلاقاً (سجل غير قابل للتلاعب)
alter table audit_log enable row level security;
drop policy if exists "audit owner read" on audit_log;
create policy "audit owner read" on audit_log for select to authenticated
  using (my_role() = 'owner');


-- =====================================================
-- المرحلة الرابعة: تغيير كلمات المرور من داخل النظام (للمالك)
-- =====================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function admin_set_password(target_user uuid, new_password text)
returns void
language plpgsql security definer
set search_path = public, extensions, auth
as $$
begin
  if coalesce(my_role(), '') <> 'owner' then
    raise exception 'غير مسموح — هذه العملية للمالك فقط';
  end if;
  if length(new_password) < 6 then
    raise exception 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = target_user;
  if not found then
    raise exception 'المستخدم غير موجود';
  end if;
end $$;

revoke all on function admin_set_password(uuid, text) from public, anon;
grant execute on function admin_set_password(uuid, text) to authenticated;
