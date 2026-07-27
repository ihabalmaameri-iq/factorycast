-- =====================================================
-- المرحلة السابعة: الإيرادات والقاصة (الصندوق)
-- =====================================================

-- إيرادات إضافية غير المبيعات (المبيعات تُحتسب تلقائياً من الفواتير)
create table if not exists revenues (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  category text not null default 'أخرى',
  source text,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

-- جرد القاصة الفعلي للمطابقة
create table if not exists cash_counts (
  id bigint generated always as identity primary key,
  date date not null default current_date,
  counted numeric not null,
  expected numeric not null,
  note text,
  created_at timestamptz not null default now()
);

-- إعدادات عامة مشتركة (الرصيد الافتتاحي للقاصة مثلاً)
create table if not exists app_settings (
  id bigint generated always as identity primary key,
  key text not null unique,
  value text
);

-- مجموع سحوبات الشركاء (رقم إجمالي فقط) ليصح حساب القاصة لغير المالك
-- دون كشف تفاصيل الشركاء
create or replace function withdrawals_total(d_from date default null, d_to date default null)
returns numeric
language sql security definer stable as
$$ select coalesce(sum(amount), 0) from partner_withdrawals
   where (d_from is null or date >= d_from) and (d_to is null or date <= d_to) $$;

revoke all on function withdrawals_total(date, date) from public, anon;
grant execute on function withdrawals_total(date, date) to authenticated;

-- الصلاحيات + سجل التدقيق
alter table revenues     enable row level security;
alter table cash_counts  enable row level security;
alter table app_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['revenues','cash_counts','app_settings']
  loop
    execute format('drop policy if exists "auth all %s" on %I', t, t);
    execute format('create policy "auth all %s" on %I for all to authenticated using (true) with check (true)', t, t);
    execute format('drop trigger if exists audit_%s on %I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on %I for each row execute function audit_trigger()', t, t);
  end loop;
end $$;
