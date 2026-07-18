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
