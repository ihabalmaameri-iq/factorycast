-- =====================================================
-- المرحلة السادسة: الموردون وعرباتهم وربطهم بحركات التوريد
-- =====================================================

create table if not exists suppliers (
  id bigint generated always as identity primary key,
  name text not null unique,
  phone text,
  address text,
  material_types text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists supplier_vehicles (
  id bigint generated always as identity primary key,
  supplier_id bigint not null references suppliers(id) on delete cascade,
  name text not null,
  driver text,
  phone text,
  capacity numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- معلومات التوريد على حركة المخزون
alter table movements add column if not exists supplier_id bigint references suppliers(id) on delete set null;
alter table movements add column if not exists supplier_vehicle_id bigint references supplier_vehicles(id) on delete set null;
alter table movements add column if not exists doc_no text;
alter table movements add column if not exists paid boolean not null default true;

-- الصلاحيات + سجل التدقيق
alter table suppliers         enable row level security;
alter table supplier_vehicles enable row level security;

do $$
declare t text;
begin
  foreach t in array array['suppliers','supplier_vehicles']
  loop
    execute format('drop policy if exists "auth all %s" on %I', t, t);
    execute format('create policy "auth all %s" on %I for all to authenticated using (true) with check (true)', t, t);
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;
