-- =====================================================
-- المرحلة الخامسة: الخلطات الجاهزة (وصفات محفوظة)
-- الكميات تُخزن لكل وحدة إنتاج واحدة (م³ عادةً) ثم تُضرب بالكمية المطلوبة
-- =====================================================

create table if not exists recipes (
  id bigint generated always as identity primary key,
  name text not null unique,
  unit text not null default 'م³',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists recipe_items (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  material_id bigint not null references materials(id) on delete cascade,
  qty_per_unit numeric not null check (qty_per_unit > 0)
);

-- ربط الخلطة المنفذة بالوصفة التي بُنيت منها (اختياري - للتقارير)
alter table mixtures add column if not exists recipe_id bigint references recipes(id) on delete set null;

-- الصلاحيات: كل مستخدم مسجّل (نفس بقية الأقسام التشغيلية)
alter table recipes      enable row level security;
alter table recipe_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['recipes','recipe_items']
  loop
    execute format('drop policy if exists "auth all %s" on %I', t, t);
    execute format('create policy "auth all %s" on %I for all to authenticated using (true) with check (true)', t, t);
    -- تفعيل سجل التدقيق
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;
